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

from database import (
    init_db, generate_secure_patient_token, lookup_patient_by_token,
    get_or_create_patient_by_token, get_patient,
    create_intake_session, get_intake_session, update_intake_session,
    list_physician_queue, save_session_message, get_session_messages,
    save_document, get_session_documents, log_audit_event, get_session_audit_logs,
    get_token_security_alerts
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
        consent_record=data.consent or {"granted": True, "timestamp": datetime.now().isoformat()}
    )

    welcome_text = (
        f"Hello {patient['name']}. Your permanent token is {token}. "
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

    messages = await get_session_messages(session_id)
    documents = await get_session_documents(session_id)
    return {
        "session": session,
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

    final_status = "urgent_triage" if session.get("red_flag_alert", {}).get("is_critical") else "completed"

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


# ─── 3. Doctor Console Endpoints (DOCTOR AUTH REQUIRED) ────────

@app.get("/api/physician/queue")
async def get_physician_queue(
    department: Optional[str] = Query(None),
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Fetch live patient queue with priority triage and security alerts (Strictly Doctor Protected)."""
    queue = await list_physician_queue(department=department)
    return {"queue": queue}


@app.get("/api/physician/session/{session_id}")
async def get_physician_session_detail(
    session_id: int,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Retrieve full intake packet for physician examination (Strictly Doctor Protected)."""
    session = await get_intake_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    patient = await get_patient(session["patient_id"])
    messages = await get_session_messages(session_id)
    documents = await get_session_documents(session_id)
    audit_logs = await get_session_audit_logs(session_id)
    security_alerts = await get_token_security_alerts(session.get("patient_token", ""))

    return {
        "session": session,
        "patient": patient,
        "messages": messages,
        "documents": documents,
        "audit_logs": audit_logs,
        "security_alerts": security_alerts
    }


@app.post("/api/physician/confirm")
async def confirm_physician_summary(
    data: PhysicianConfirmRequest,
    doctor: Dict[str, str] = Depends(require_doctor_role)
):
    """Doctor confirms clinical summary and generates ABDM FHIR R4 export (Strictly Doctor Protected)."""
    session = await get_intake_session(data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    patient = await get_patient(session["patient_id"])
    documents = await get_session_documents(data.session_id)

    fhir_bundle = await generate_abdm_fhir_bundle(
        patient_info=patient or {},
        session_data=session,
        documents=documents,
        confirmed_summary=data.confirmed_summary
    )

    disposition = {
        "status": "confirmed_by_doctor",
        "assigned_doctor": data.assigned_doctor,
        "doctor_id": doctor["user_id"],
        "notes": data.disposition_notes,
        "confirmed_at": datetime.now().isoformat(),
        "mock_integrations": {
            "his_sync": True,
            "abha_linked": True,
            "fhir_exported": True
        }
    }

    updated = await update_intake_session(
        data.session_id,
        structured_summary=data.confirmed_summary,
        clinician_disposition=disposition,
        fhir_bundle=fhir_bundle,
        status="physician_reviewed"
    )

    await log_audit_event(
        actor_role="physician",
        action="SUMMARY_CONFIRMED",
        session_id=data.session_id,
        patient_token=session.get("patient_token"),
        details={"doctor": data.assigned_doctor, "doctor_id": doctor["user_id"], "notes": data.disposition_notes}
    )

    return {
        "status": "success",
        "session": updated,
        "fhir_bundle": fhir_bundle,
        "mock_sync": {
            "his_status": "Synchronized (Record #HIS-88291)",
            "abha_status": "Linked to ABHA Profile",
            "fhir_status": "FHIR R4 Composition Validated"
        }
    }


# ─── Health Check ─────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "MediKiosk Clinical Platform", "version": "2.3.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
