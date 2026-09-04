"""
MediKiosk FastAPI Server — Token-Based Patient Intake & Google OAuth Doctor Console.
Enforces Token Identification for Patients and Strict RBAC for Attending Physicians.
"""

import os
import shutil
import uuid
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Body, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import aiosqlite
from database import (
    init_db, generate_secure_patient_token, lookup_patient_by_token,
    get_or_create_patient_by_token, get_patient,
    create_intake_session, get_intake_session, update_intake_session,
    list_physician_queue, save_session_message, get_session_messages,
    save_document, get_session_documents, log_audit_event, get_session_audit_logs,
    get_token_security_alerts, get_patient_complete_medical_history,
    update_patient_master_health_record,
    get_doctor_by_email, get_doctor_by_id, create_doctor,
    update_doctor_profile, list_available_doctors, DB_PATH
)
from agent import (
    run_intake_conversation, analyze_medical_document,
    generate_physician_clinical_summary, generate_abdm_fhir_bundle
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    yield

app = FastAPI(title="MediKiosk API — Token Patient & OAuth Doctor", version="2.3.0", lifespan=lifespan)

# CORS for React Frontend (Localhost + Vercel + Render + DevTunnels)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://medikiosk-6wg9.onrender.com",
        "https://nms5ccjr-8000.inc1.devtunnels.ms",
        "https://nms5ccjr-5173.inc1.devtunnels.ms"
    ],
    allow_origin_regex=r"https://.*(\.vercel\.app|\.onrender\.com|\.devtunnels\.ms)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded documents
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ─── RBAC Authorization Dependency (Strictly for Doctors) ──────

async def require_doctor_role(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role")
) -> Dict[str, str]:
    """Strict authorization: Enforce DOCTOR role. Non-doctors receive 403 Forbidden."""
    if not x_user_role or x_user_role.lower() != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Doctor authorization required to view patient records, queues, or clinical summaries."
        )
    return {"user_id": x_user_id or "doctor_user", "role": "doctor"}


# ─── Pydantic Request Models ───────────────────────────────────

class TokenLookupRequest(BaseModel):
    token: str

class TokenMismatchRequest(BaseModel):
    token: str
    reported_name: Optional[str] = ""
    reason: Optional[str] = "Patient clicked Not My Details"

class PatientInitRequest(BaseModel):
    patient_token: str
    name: str
    age: int
    gender: Optional[str] = "Male"
    phone: Optional[str] = None
    abha_id: Optional[str] = None
    language: Optional[str] = "en"
    department: Optional[str] = "allopathic"
    consent: Optional[Dict[str, Any]] = None
    assigned_doctor_id: Optional[str] = ""
    assigned_doctor_name: Optional[str] = ""
    assigned_doctor_specialty: Optional[str] = ""

class DoctorRegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = ""
    specialty: Optional[str] = ""

class DoctorLoginRequest(BaseModel):
    email: str
    password: str

class DoctorGoogleSyncRequest(BaseModel):
    email: str
    name: Optional[str] = ""
    google_id: Optional[str] = ""

class DoctorProfileUpdateRequest(BaseModel):
    doctor_id: str
    name: str
    specialty: str

class IntakeChatRequest(BaseModel):
    session_id: int
    message: str
    language: Optional[str] = "en"

class IntakeSubmitRequest(BaseModel):
    session_id: int

class PhysicianConfirmRequest(BaseModel):
    session_id: int
    confirmed_summary: str
    disposition_notes: Optional[str] = ""
    assigned_doctor: Optional[str] = "Attending Physician"
    diagnosis: Optional[str] = ""
    prescriptions: Optional[Any] = None
    follow_up: Optional[str] = ""
    status: Optional[str] = "completed"

class PhysicianStatusRequest(BaseModel):
    session_id: int
    status: str


# ─── 1. Patient Token Verification & Generation Endpoints ───────

@app.post("/api/patient/token-lookup")
async def api_lookup_patient_token(data: TokenLookupRequest):
    """Lookup patient by token. Returns ONLY minimal identity confirmation (Name, Age) for privacy."""
    patient = await lookup_patient_by_token(data.token)
    if not patient:
        return {"found": False, "message": "Token not found in system."}

    # Log successful token verification event
    await log_audit_event(
        actor_role="patient",
        action="TOKEN_VERIFIED",
        patient_token=patient["patient_token"],
        details={"name": patient["name"]}
    )

    return {
        "found": True,
        "confirmation": {
            "token": patient["patient_token"],
            "name": patient["name"],
            "age": patient["age"],
            "gender": patient["gender"]
        }
    }


@app.post("/api/patient/token-generate")
async def api_generate_patient_token():
    """Generate a new secure, unguessable persistent patient token."""
    new_token = generate_secure_patient_token()
    return {"token": new_token}


@app.post("/api/patient/token-mismatch")
async def api_log_token_mismatch(data: TokenMismatchRequest):
    """Log when someone enters a valid token but rejects confirmation (Wrong-Token event)."""
    clean_token = data.token.strip().upper()
    await log_audit_event(
        actor_role="patient",
        action="TOKEN_MISMATCH_ALERT",
        patient_token=clean_token,
        details={
            "reason": data.reason or "Identity rejected by user at kiosk",
            "reported_name": data.reported_name,
            "timestamp": datetime.now().isoformat()
        }
    )
    return {"status": "logged", "message": "Security mismatch alert recorded for doctor."}


# ─── 2. Patient Kiosk Intake Endpoints ─────────────────────────

@app.post("/api/intake/start")
async def start_intake_session(data: PatientInitRequest):
    """Start an intake session bound to the persistent patient token."""
    token = data.patient_token.strip().upper() if data.patient_token else generate_secure_patient_token()

    patient = await get_or_create_patient_by_token(
        patient_token=token,
        name=data.name.strip(),
        age=data.age,
        gender=data.gender,
        phone=data.phone,
        abha_id=data.abha_id,
        language=data.language or "en"
    )

    session = await create_intake_session(
        patient_id=patient["id"],
        patient_token=token,
        user_id=f"token_{token}",
        department=data.department or "allopathic",
        language=data.language or "en",
        consent_record=data.consent or {"granted": True, "timestamp": datetime.now().isoformat()},
        assigned_doctor_id=data.assigned_doctor_id or "",
        assigned_doctor_name=data.assigned_doctor_name or "",
        assigned_doctor_specialty=data.assigned_doctor_specialty or ""
    )

    doctor_note = f" You are consulting with {data.assigned_doctor_name} ({data.assigned_doctor_specialty})." if data.assigned_doctor_name else ""
    welcome_text = (
        f"Hello {patient['name']}. Your permanent token is {token}.{doctor_note} "
        "Please describe what symptoms you are experiencing today."
    )
    await save_session_message(session["id"], "assistant", welcome_text)

    return {
        "session": session,
        "patient": patient,
        "initial_message": welcome_text
    }


@app.get("/api/intake/{session_id}")
async def fetch_intake_session(session_id: int):
    """Retrieve state of an ongoing intake session."""
    session = await get_intake_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Intake session not found")

    patient = await get_patient(session["patient_id"])
    messages = await get_session_messages(session_id)
    documents = await get_session_documents(session_id)
    return {
        "session": session,
        "patient": patient,
        "messages": messages,
        "documents": documents
    }


@app.post("/api/intake/chat")
async def chat_intake(data: IntakeChatRequest):
    """Kiosk interview: Run SOCRATES triage extraction & red-flag detection."""
    session = await get_intake_session(data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    patient = await get_patient(session["patient_id"])
    history_messages = await get_session_messages(data.session_id)

    # 1. Save patient message
    await save_session_message(data.session_id, "user", data.message)

    # 2. Run AI SOCRATES & Triage Engine
    ai_result = await run_intake_conversation(
        user_message=data.message,
        patient_info=patient or {},
        history_messages=history_messages,
        current_socrates=session.get("socrates_hpi", {}),
        language=data.language or session.get("language", "en")
    )

    reply_text = ai_result.get("reply_text", "Thank you. How long have you had these symptoms?")
    updated_socrates = ai_result.get("socrates_extracted", session.get("socrates_hpi", {}))
    red_flag = ai_result.get("red_flag", {"is_critical": False, "severity": "NORMAL"})

    # 3. Save assistant message
    await save_session_message(data.session_id, "assistant", reply_text)

    # 4. Update session state
    new_status = "urgent_triage" if red_flag.get("is_critical") else session.get("status", "in_progress")
    await update_intake_session(
        data.session_id,
        socrates_hpi=updated_socrates,
        red_flag_alert=red_flag,
        status=new_status
    )

    if red_flag.get("is_critical"):
        await log_audit_event(
            actor_role="triage",
            action="RED_FLAG_TRIGGERED",
            session_id=data.session_id,
            patient_token=session.get("patient_token"),
            details=red_flag
        )

    return {
        "reply": reply_text,
        "detected_language": ai_result.get("detected_language", "en"),
        "suggested_chips": ai_result.get("suggested_chips", []),
        "socrates_hpi": updated_socrates,
        "red_flag": red_flag,
        "is_intake_complete": ai_result.get("is_intake_complete", False)
    }


@app.post("/api/intake/upload-document")
async def upload_document(
    session_id: int = Form(...),
    doc_type: str = Form("prescription"),
    file: UploadFile = File(...)
):
    """Document upload & Multi-Modal OCR extraction."""
    session = await get_intake_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    entities = await analyze_medical_document(
        file_path=file_path,
        file_type=file.content_type,
        file_name=file.filename,
        doc_type_hint=doc_type
    )

    doc_record = await save_document(
        session_id=session_id,
        patient_id=session["patient_id"],
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        doc_type=entities.get("doc_type", doc_type),
        extracted_entities=entities,
        ocr_text=entities.get("summary", "")
    )

    bot_msg = f"📄 **Document Scanned**: `{file.filename}` ({doc_record['doc_type'].upper()})\n{entities.get('summary', '')}"
    await save_session_message(session_id, "assistant", bot_msg, provenance="document_ocr")

    return {
        "document": doc_record,
        "entities": entities
    }


@app.post("/api/intake/submit")
async def submit_intake(data: IntakeSubmitRequest):
    """Synthesize clinical summary and place patient in physician queue."""
    session = await get_intake_session(data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    patient = await get_patient(session["patient_id"])
    documents = await get_session_documents(data.session_id)
    messages = await get_session_messages(data.session_id)

    summary_draft = await generate_physician_clinical_summary(
        patient_info=patient or {},
        socrates_hpi=session.get("socrates_hpi", {}),
        documents=documents,
        messages=messages
    )

    final_status = "urgent_triage" if session.get("red_flag_alert", {}).get("is_critical") else "waiting"

    updated = await update_intake_session(
        data.session_id,
        structured_summary=summary_draft,
        status=final_status
    )

    await log_audit_event(
        actor_role="patient",
        action="INTAKE_SUBMITTED",
        session_id=data.session_id,
        patient_token=session.get("patient_token"),
        details={"queue_number": session["queue_number"]}
    )

    return {
        "session": updated,
        "summary_draft": summary_draft,
        "queue_number": session["queue_number"]
    }


# ─── 3. Doctor Auth & Dynamic Registry Endpoints ────────────────

@app.get("/api/doctors")
async def get_available_doctors():
    """List all registered doctors available for patient selection (No hardcoded doctors)."""
    doctors = await list_available_doctors()
    return {
        "doctors": [
            {
                "id": d["id"],
                "name": d["name"],
                "specialty": d.get("specialty") or "General Medicine / OPD",
                "email": d["email"],
                "profile_completed": bool(d.get("profile_completed", 0))
            }
            for d in doctors
        ]
    }


@app.post("/api/doctors/register")
async def register_doctor(data: DoctorRegisterRequest):
    """Register a new doctor account with email & password. No email verification link required!"""
    clean_email = data.email.strip().lower()
    if not clean_email or not data.password.strip():
        raise HTTPException(status_code=400, detail="Email and password are required.")

    existing = await get_doctor_by_email(clean_email)
    if existing:
        raise HTTPException(status_code=400, detail="A doctor account with this email already exists. Please sign in.")

    has_profile = bool(data.name and data.name.strip() and data.specialty and data.specialty.strip())
    doctor = await create_doctor(
        email=clean_email,
        password_hash=data.password.strip(),
        name=data.name or "",
        specialty=data.specialty or "",
        auth_provider="email",
        profile_completed=1 if has_profile else 0
    )

    return {
        "status": "success",
        "message": "Doctor registered successfully.",
        "doctor": {
            "id": doctor["id"],
            "email": doctor["email"],
            "name": doctor["name"],
            "specialty": doctor.get("specialty", ""),
            "role": "doctor",
            "profile_completed": bool(doctor.get("profile_completed", 0))
        }
    }


@app.post("/api/doctors/login")
async def login_doctor(data: DoctorLoginRequest):
    """Login doctor with email & password. Immediately authenticated."""
    clean_email = data.email.strip().lower()
    doctor = await get_doctor_by_email(clean_email)
    if not doctor:
        raise HTTPException(status_code=401, detail="No doctor account found with this email. Please register first.")

    # Validate password
    if doctor.get("password_hash") and doctor["password_hash"] != data.password.strip():
        raise HTTPException(status_code=401, detail="Invalid password. Please check your credentials.")

    return {
        "status": "success",
        "doctor": {
            "id": doctor["id"],
            "email": doctor["email"],
            "name": doctor["name"],
            "specialty": doctor.get("specialty") or "General Medicine / OPD",
            "role": "doctor",
            "profile_completed": bool(doctor.get("profile_completed", 0))
        }
    }


@app.post("/api/doctors/sync-google")
async def sync_google_doctor(data: DoctorGoogleSyncRequest):
    """Sync or register doctor logging in via Google OAuth."""
    clean_email = data.email.strip().lower()
    doctor = await get_doctor_by_email(clean_email)
    if not doctor:
        clean_name = data.name.strip() if data.name else f"Dr. {clean_email.split('@')[0]}"
        doctor = await create_doctor(
            email=clean_email,
            password_hash="",
            name=clean_name,
            specialty="",
            auth_provider="google",
            profile_completed=0,
            doctor_id=data.google_id
        )

    return {
        "status": "success",
        "doctor": {
            "id": doctor["id"],
            "email": doctor["email"],
            "name": doctor["name"],
            "specialty": doctor.get("specialty") or "",
            "role": "doctor",
            "profile_completed": bool(doctor.get("profile_completed", 0))
        }
    }


@app.post("/api/doctors/profile")
async def update_doctor_profile_endpoint(
    data: DoctorProfileUpdateRequest,
    doctor_auth: Dict[str, str] = Depends(require_doctor_role)
):
    """Update doctor profile (Name and Field/Specialization) after first login."""
    if not data.name.strip() or not data.specialty.strip():
        raise HTTPException(status_code=400, detail="Name and field/specialization are required.")

    updated = await update_doctor_profile(
        doctor_id=data.doctor_id,
        name=data.name,
        specialty=data.specialty
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Doctor record not found.")

    return {
        "status": "success",
        "doctor": {
            "id": updated["id"],
            "email": updated["email"],
            "name": updated["name"],
            "specialty": updated["specialty"],
            "role": "doctor",
            "profile_completed": True
        }
    }


# ─── 4. Concise Clinical Summary Synthesizer ───────────────────

def synthesize_concise_summaries(session, patient, messages, documents, patient_history):
    """Synthesize the 3 primary concise summaries required by attending physicians."""
    hpi = session.get("socrates_hpi", {}) or {}
    red_flag = session.get("red_flag_alert", {}) or {}

    # 1. Current Query Summary
    chief_complaint = hpi.get("chief_complaint") or "General Outpatient Consultation"
    onset = hpi.get("onset") or "Not specified"
    severity = hpi.get("severity") or "N/A"
    site = hpi.get("site") or "Not specified"
    character = hpi.get("character") or "Not specified"
    radiation = hpi.get("radiation") or "None"
    timing = hpi.get("timing") or "Constant"
    assoc = ", ".join(hpi.get("associations", [])) if isinstance(hpi.get("associations"), list) else (hpi.get("associations") or "None reported")

    current_query_summary = {
        "chief_complaint": chief_complaint,
        "site": site,
        "onset": onset,
        "character": character,
        "severity": f"{severity}/10" if str(severity).isdigit() else str(severity),
        "radiation": radiation,
        "timing": timing,
        "associations": assoc,
        "is_urgent": bool(red_flag.get("is_critical", False)),
        "triage_reason": red_flag.get("reason", ""),
        "assigned_doctor_name": session.get("assigned_doctor_name", ""),
        "assigned_doctor_specialty": session.get("assigned_doctor_specialty", ""),
        "text_overview": f"Patient presents with {chief_complaint}. Onset: {onset}, Severity: {severity}/10. Characteristics: {character} located at {site}. Associated symptoms: {assoc}."
    }

    # 2. Patient History Summary
    prev_visits = patient_history.get("previous_consultations", []) if patient_history else []
    conditions = patient.get("conditions", []) if patient else []
    chronic_meds = patient_history.get("cumulative_active_medications", []) if patient_history else []
    allergies = patient.get("allergies", []) if patient else []

    if prev_visits:
        recent_dx = [v.get("diagnosis") for v in prev_visits[:3] if v.get("diagnosis")]
        history_text = f"Returning patient with {len(prev_visits)} prior consultations recorded on this token."
        if recent_dx:
            history_text += f" Recent diagnoses: {', '.join(recent_dx)}."
        if conditions:
            history_text += f" Known chronic conditions: {', '.join(conditions) if isinstance(conditions, list) else conditions}."
        if allergies:
            history_text += f" Known allergies: {', '.join(allergies) if isinstance(allergies, list) else allergies}."
    else:
        history_text = "First-time patient check-in at MediKiosk. No prior hospital consultation records on this token."
        if conditions:
            history_text += f" Patient reports existing conditions: {', '.join(conditions) if isinstance(conditions, list) else conditions}."
        if allergies:
            history_text += f" Reported allergies: {', '.join(allergies) if isinstance(allergies, list) else allergies}."

    patient_history_summary = {
        "is_returning": bool(prev_visits),
        "total_prior_visits": len(prev_visits),
        "known_conditions": conditions,
        "allergies": allergies,
        "active_medications": chronic_meds,
        "text_overview": history_text
    }

    # 3. Uploaded Documents Summary
    docs_summary_list = []
    abnormal_labs = []
    extracted_rx = []
    for doc in documents:
        ent = doc.get("extracted_entities", {}) or {}
        if ent.get("lab_results"):
            for lr in ent["lab_results"]:
                if lr.get("is_abnormal"):
                    abnormal_labs.append(f"{lr.get('test_name')}: {lr.get('value')} {lr.get('unit')} ({lr.get('flag', 'HIGH')})")
        if ent.get("medications"):
            for m in ent["medications"]:
                extracted_rx.append(f"{m.get('name')} {m.get('dosage', '')}")
        docs_summary_list.append({
            "file_name": doc.get("file_name"),
            "doc_type": doc.get("doc_type"),
            "summary": ent.get("summary") or doc.get("doc_type", "Medical Document")
        })

    if documents:
        docs_text = f"{len(documents)} external medical documents uploaded for this visit."
        if abnormal_labs:
            docs_text += f" Critical Lab Findings: {'; '.join(abnormal_labs)}."
        if extracted_rx:
            docs_text += f" Prescriptions noted: {', '.join(extracted_rx[:4])}."
    else:
        docs_text = "No external medical reports or scanned documents uploaded for this visit."

    uploaded_documents_summary = {
        "total_documents": len(documents),
        "abnormal_labs": abnormal_labs,
        "extracted_medications": extracted_rx,
        "documents_list": docs_summary_list,
        "text_overview": docs_text
    }

    return current_query_summary, patient_history_summary, uploaded_documents_summary


# ─── 5. Doctor Console Endpoints (DOCTOR AUTH REQUIRED) ────────

@app.get("/api/physician/queue")
async def get_physician_queue(
    department: Optional[str] = Query(None),
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Fetch live patient queue with priority triage and security alerts (Strict Doctor Authorization)."""
    queue = await list_physician_queue(department=department, doctor_id=doctor["user_id"])
    return {"queue": queue}


@app.get("/api/physician/session/{session_id}")
async def get_physician_session_detail(
    session_id: int,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Retrieve full intake packet with 3 primary concise summaries and expandable chat (Strictly Doctor Protected)."""
    session = await get_intake_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strict Doctor-Patient Access Control: Only the assigned doctor can access this OPD record
    assigned_doc_id = session.get("assigned_doctor_id") or ""
    if assigned_doc_id != doctor["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You are not authorized to view this patient's records."
        )

    patient_token = session.get("patient_token", "")
    patient = await get_patient(session["patient_id"])
    messages = await get_session_messages(session_id)
    documents = await get_session_documents(session_id)
    audit_logs = await get_session_audit_logs(session_id)
    security_alerts = await get_token_security_alerts(patient_token)
    
    # Retrieve complete longitudinal medical history tied to this patient token
    patient_history = await get_patient_complete_medical_history(
        patient_token=patient_token,
        current_session_id=session_id
    )

    # Synthesize the 3 primary concise clinical summaries
    q_sum, h_sum, d_sum = synthesize_concise_summaries(
        session=session,
        patient=patient or {},
        messages=messages or [],
        documents=documents or [],
        patient_history=patient_history or {}
    )

    return {
        "session": session,
        "patient": patient,
        "messages": messages,
        "documents": documents,
        "audit_logs": audit_logs,
        "security_alerts": security_alerts,
        "patient_history": patient_history,
        "current_query_summary": q_sum,
        "patient_history_summary": h_sum,
        "uploaded_documents_summary": d_sum
    }


@app.get("/api/physician/patient-history/{patient_token}")
async def get_physician_patient_history(
    patient_token: str,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Fetch complete historical consultations, diagnoses, and lab tests for a patient token (Strictly Doctor Protected)."""
    # Strict Doctor-Patient Access Control: Verify doctor has at least one assigned OPD record for this patient
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM intake_sessions WHERE patient_token = ? AND assigned_doctor_id = ?",
            (patient_token.strip().upper(), doctor["user_id"])
        )
        count = (await cursor.fetchone())[0]
        if count == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: You have no assigned OPD records for this patient."
            )
    history = await get_patient_complete_medical_history(patient_token=patient_token)
    return {"patient_history": history}


@app.post("/api/physician/confirm")
async def confirm_physician_summary(
    data: PhysicianConfirmRequest,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Doctor confirms clinical summary and generates ABDM FHIR R4 export (Strictly Doctor Protected)."""
    session = await get_intake_session(data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strict Doctor-Patient Access Control: Only the assigned doctor can verify this session
    assigned_doc_id = session.get("assigned_doctor_id") or ""
    if assigned_doc_id != doctor["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You are not authorized to verify this patient session."
        )

    patient = await get_patient(session["patient_id"])
    documents = await get_session_documents(data.session_id)

    fhir_bundle = await generate_abdm_fhir_bundle(
        patient_info=patient or {},
        session_data=session,
        documents=documents,
        confirmed_summary=data.confirmed_summary,
        diagnosis=data.diagnosis or "",
        prescriptions=data.prescriptions or []
    )

    disposition = {
        "status": "completed",
        "assigned_doctor": data.assigned_doctor,
        "doctor_id": doctor["user_id"],
        "diagnosis": data.diagnosis or "",
        "prescriptions": data.prescriptions or [],
        "follow_up": data.follow_up or "",
        "notes": data.disposition_notes or "",
        "confirmed_at": datetime.now().isoformat(),
        "mock_integrations": {
            "his_sync": True,
            "abha_linked": True,
            "fhir_exported": True
        }
    }

    status_val = data.status or "completed"
    updated = await update_intake_session(
        data.session_id,
        structured_summary=data.confirmed_summary,
        clinician_disposition=disposition,
        fhir_bundle=fhir_bundle,
        status=status_val
    )

    # Automatically update the patient's master health record with physician disposition notes
    if session.get("patient_id"):
        combined_note = f"Diagnosis: {data.diagnosis}. Prescriptions: {data.prescriptions}. Notes: {data.disposition_notes}"
        await update_patient_master_health_record(
            patient_id=session["patient_id"],
            doctor_note=combined_note
        )

    await log_audit_event(
        actor_role="physician",
        action="SUMMARY_CONFIRMED",
        session_id=data.session_id,
        patient_token=session.get("patient_token"),
        details={"doctor": data.assigned_doctor, "doctor_id": doctor["user_id"], "notes": data.disposition_notes}
    )

    # Return updated session and refreshed patient longitudinal history
    refreshed_history = await get_patient_complete_medical_history(
        patient_token=session.get("patient_token", ""),
        current_session_id=data.session_id
    )

    return {
        "status": "success",
        "session": updated,
        "fhir_bundle": fhir_bundle,
        "patient_history": refreshed_history,
        "mock_sync": {
            "his_status": "Synchronized (Record #HIS-88291)",
            "abha_status": "Linked to ABHA Profile",
            "fhir_status": "FHIR R4 Composition Validated"
        }
    }


@app.post("/api/physician/update-status")
async def update_physician_session_status(
    data: PhysicianStatusRequest,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Doctor updates the session status (e.g. waiting -> in_consultation -> completed)."""
    session = await get_intake_session(data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strict Doctor-Patient Access Control
    assigned_doc_id = session.get("assigned_doctor_id") or ""
    if assigned_doc_id != doctor["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You are not authorized to update this patient session."
        )

    updated = await update_intake_session(
        data.session_id,
        status=data.status
    )

    await log_audit_event(
        actor_role="physician",
        action="STATUS_UPDATED",
        session_id=data.session_id,
        patient_token=session.get("patient_token"),
        details={"new_status": data.status, "doctor_id": doctor["user_id"]}
    )

    return {"status": "success", "session": updated, "new_status": data.status}


@app.get("/api/physician/fhir/{session_id}")
async def get_or_generate_session_fhir(
    session_id: int,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Retrieve or dynamically generate HL7 FHIR R4 Bundle for any session."""
    session = await get_intake_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strict Doctor-Patient Access Control
    assigned_doc_id = session.get("assigned_doctor_id") or ""
    if assigned_doc_id != doctor["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You are not authorized to access FHIR records for this patient session."
        )

    # If bundle already generated and stored, return it
    bundle = session.get("fhir_bundle")
    if bundle and isinstance(bundle, dict) and len(bundle) > 0 and bundle.get("resourceType") == "Bundle":
        return {"session_id": session_id, "fhir_bundle": bundle}

    # Otherwise, generate compliant bundle on the fly from current intake data
    patient = await get_patient(session["patient_id"])
    documents = await get_session_documents(session_id)
    disp = session.get("clinician_disposition", {}) or {}
    summary = session.get("structured_summary") or session.get("socrates_hpi", {}).get("chief_complaint") or "Intake completed"

    fhir_bundle = await generate_abdm_fhir_bundle(
        patient_info=patient or {},
        session_data=session,
        documents=documents,
        confirmed_summary=summary,
        diagnosis=disp.get("diagnosis", ""),
        prescriptions=disp.get("prescriptions", [])
    )
    return {"session_id": session_id, "fhir_bundle": fhir_bundle}


# ─── Health Check ─────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "MediKiosk Clinical Platform", "version": "2.3.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
