"""
MediKiosk Database Layer ΓÇö Async SQLite with aiosqlite
Manages Patient Tokens, Demographics, Clinical Intake Sessions, SOCRATES History,
Medical Documents, Red Flags, Token Mismatch Security Logs, and Physician Reviews.
"""

import aiosqlite
import os
import json
import random
import string
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "medx.db")


def generate_secure_patient_token() -> str:
    """Generate a unique, unguessable patient token in the format PT-XXXX-YY."""
    digits = f"{random.randint(1000, 9999)}"
    letters = ''.join(random.choices(string.ascii_uppercase, k=2))
    return f"PT-{digits}-{letters}"


async def init_db():
    """Initialize database tables with persistent patient tokens and security logging."""
    async with aiosqlite.connect(DB_PATH) as db:
        # 1. Patients Table with UNIQUE patient_token
        await db.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_token TEXT UNIQUE NOT NULL,
                user_id TEXT DEFAULT 'token_user',
                name TEXT NOT NULL,
                age INTEGER,
                gender TEXT,
                phone TEXT,
                abha_id TEXT,
                language TEXT DEFAULT 'en',
                conditions TEXT DEFAULT '[]',
                allergies TEXT DEFAULT '[]',
                medications TEXT DEFAULT '[]',
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 2. Intake Sessions
        await db.execute("""
            CREATE TABLE IF NOT EXISTS intake_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_token TEXT UNIQUE NOT NULL,
                patient_token TEXT NOT NULL,
                queue_number TEXT NOT NULL,
                patient_id INTEGER NOT NULL,
                user_id TEXT DEFAULT 'token_user',
                department TEXT DEFAULT 'allopathic', -- 'allopathic' | 'ayush'
                language TEXT DEFAULT 'en',
                status TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed' | 'urgent_triage' | 'physician_reviewed' | 'routed_his'
                consent_record TEXT DEFAULT '{}',
                red_flag_alert TEXT DEFAULT '{}',
                socrates_hpi TEXT DEFAULT '{}',
                structured_summary TEXT DEFAULT '',
                clinician_disposition TEXT DEFAULT '{}',
                fhir_bundle TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # 3. Session Messages
        await db.execute("""
            CREATE TABLE IF NOT EXISTS session_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                provenance TEXT DEFAULT 'patient_reported',
                file_path TEXT,
                file_type TEXT,
                file_name TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES intake_sessions(id)
            )
        """)

        # 4. Uploaded Medical Documents
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                patient_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                doc_type TEXT DEFAULT 'prescription',
                extracted_entities TEXT DEFAULT '{}',
                ocr_text TEXT DEFAULT '',
                status TEXT DEFAULT 'processed',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES intake_sessions(id),
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
        """)

        # 5. Security & Clinical Audit Logs
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                patient_token TEXT,
                actor_role TEXT NOT NULL, -- 'patient' | 'physician' | 'triage' | 'system'
                action TEXT NOT NULL, -- 'TOKEN_VERIFIED' | 'TOKEN_MISMATCH_ALERT' | 'INTAKE_STARTED' | 'RED_FLAG_TRIGGERED' | 'DOC_SCANNED' | 'SUMMARY_CONFIRMED'
                details TEXT DEFAULT '{}',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 6. Doctors Table for Dynamic Doctor Accounts & Profiles
        await db.execute("""
            CREATE TABLE IF NOT EXISTS doctors (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT DEFAULT '',
                name TEXT NOT NULL,
                specialty TEXT DEFAULT '',
                auth_provider TEXT DEFAULT 'email', -- 'email' | 'google'
                profile_completed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Auto-migration helpers for patient_token & assigned doctor columns
        try:
            await db.execute("ALTER TABLE patients ADD COLUMN patient_token TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE intake_sessions ADD COLUMN patient_token TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE intake_sessions ADD COLUMN assigned_doctor_id TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE intake_sessions ADD COLUMN assigned_doctor_name TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE intake_sessions ADD COLUMN assigned_doctor_specialty TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE audit_logs ADD COLUMN patient_token TEXT")
        except Exception:
            pass

        # Seed default test doctor if not already present
        cursor = await db.execute("SELECT id FROM doctors WHERE email = ?", ("25ece1055@nitgoa.ac.in",))
        if not await cursor.fetchone():
            await db.execute("""
                INSERT INTO doctors (id, email, password_hash, name, specialty, auth_provider, profile_completed)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                "doc_25ece1055",
                "25ece1055@nitgoa.ac.in",
                "123456789",
                "Dr. Rohan Vernekar",
                "General Medicine / OPD",
                "email",
                1
            ))

        await db.commit()
    print("[DB] MediKiosk Database initialized with Token Auth, Doctors Registry & Security Logging")


# ΓöÇΓöÇΓöÇ Patient Token CRUD & Verification ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async def lookup_patient_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Lookup patient by token. Returns ONLY minimal verification info (Name, Age) for privacy."""
    token = token.strip().upper()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT id, patient_token, name, age, gender FROM patients WHERE patient_token = ?", (token,))
        row = await cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "patient_token": row["patient_token"],
            "name": row["name"],
            "age": row["age"],
            "gender": row["gender"],
            "exists": True
        }


async def get_or_create_patient_by_token(
    patient_token: str,
    name: str,
    age: Optional[int] = None,
    gender: Optional[str] = "Male",
    phone: Optional[str] = None,
    abha_id: Optional[str] = None,
    language: str = "en"
) -> Dict[str, Any]:
    """Get existing patient by token or create a new persistent patient profile."""
    patient_token = patient_token.strip().upper()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM patients WHERE patient_token = ?", (patient_token,))
        row = await cursor.fetchone()
        if row:
            # Update demographic fields if changed
            pid = row["id"]
            await db.execute(
                """UPDATE patients SET name = COALESCE(?, name), age = COALESCE(?, age),
                   gender = COALESCE(?, gender), phone = COALESCE(?, phone), abha_id = COALESCE(?, abha_id)
                   WHERE id = ?""",
                (name, age, gender, phone, abha_id, pid)
            )
            await db.commit()
            return await get_patient(pid)

        # Create new persistent patient profile
        cursor = await db.execute(
            """INSERT INTO patients (patient_token, user_id, name, age, gender, phone, abha_id, language, conditions, allergies, medications, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '')""",
            (patient_token, f"token_{patient_token}", name, age, gender, phone, abha_id, language)
        )
        await db.commit()
        pid = cursor.lastrowid
        return await get_patient(pid)


async def get_patient(patient_id: int) -> Optional[Dict[str, Any]]:
    """Get single patient record."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
        row = await cursor.fetchone()
        if row:
            return _row_to_dict(row)
    return None


# ΓöÇΓöÇΓöÇ Intake Session CRUD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async def create_intake_session(
    patient_id: int,
    patient_token: str,
    user_id: str = "token_user",
    department: str = "allopathic",
    language: str = "en",
    consent_record: Optional[Dict] = None,
    assigned_doctor_id: str = "",
    assigned_doctor_name: str = "",
    assigned_doctor_specialty: str = ""
) -> Dict[str, Any]:
    """Start a new clinical intake session linked to the patient token and assigned doctor."""
    queue_number = f"MK-{random.randint(1001, 9999)}"
    session_token = f"sess_{datetime.now().strftime('%Y%m%d%H%M%S')}_{random.randint(100, 999)}"

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO intake_sessions
               (session_token, patient_token, queue_number, patient_id, user_id, department, language, consent_record, status,
                assigned_doctor_id, assigned_doctor_name, assigned_doctor_specialty)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)""",
            (session_token, patient_token, queue_number, patient_id, user_id, department, language, json.dumps(consent_record or {}),
             assigned_doctor_id, assigned_doctor_name, assigned_doctor_specialty)
        )
        await db.commit()
        sid = cursor.lastrowid

    await log_audit_event(
        session_id=sid,
        patient_token=patient_token,
        actor_role="patient",
        action="INTAKE_STARTED",
        details={"queue_number": queue_number, "language": language, "assigned_doctor": assigned_doctor_name}
    )
    return await get_intake_session(sid)


async def get_intake_session(session_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve an intake session with patient details and documents."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT s.*, p.name as patient_name, p.age as patient_age, p.gender as patient_gender,
                   p.phone as patient_phone, p.abha_id as patient_abha, p.patient_token,
                   p.allergies as patient_allergies, p.medications as patient_medications,
                   p.conditions as patient_conditions
            FROM intake_sessions s
            JOIN patients p ON s.patient_id = p.id
            WHERE s.id = ?
        """, (session_id,))
        row = await cursor.fetchone()
        if not row:
            return None

        session_dict = _row_to_dict(row)
        for col in ("consent_record", "red_flag_alert", "socrates_hpi", "clinician_disposition", "fhir_bundle", "patient_allergies", "patient_medications", "patient_conditions"):
            if session_dict.get(col) and isinstance(session_dict[col], str):
                try:
                    session_dict[col] = json.loads(session_dict[col])
                except Exception:
                    pass

        session_dict["documents"] = await get_session_documents(session_id)
        return session_dict


async def update_intake_session(session_id: int, **kwargs) -> Optional[Dict[str, Any]]:
    """Update intake session status, SOCRATES data, summary, assigned doctor, or doctor review."""
    allowed = {
        "status", "department", "language", "consent_record", "red_flag_alert",
        "socrates_hpi", "structured_summary", "clinician_disposition", "fhir_bundle",
        "assigned_doctor_id", "assigned_doctor_name", "assigned_doctor_specialty"
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_intake_session(session_id)

    for field in ("consent_record", "red_flag_alert", "socrates_hpi", "clinician_disposition", "fhir_bundle"):
        if field in updates and isinstance(updates[field], (dict, list)):
            updates[field] = json.dumps(updates[field])

    updates["updated_at"] = datetime.now().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [session_id]

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE intake_sessions SET {set_clause} WHERE id = ?", values)
        await db.commit()

    return await get_intake_session(session_id)


async def list_physician_queue(
    department: Optional[str] = None,
    doctor_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List intake sessions assigned to the authenticated doctor, with token, returning patient flag, and security alerts."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        conditions = []
        params = []
        
        if doctor_id and doctor_id.strip():
            # Strict doctor-patient access control: return only sessions assigned to this specific doctor
            conditions.append("s.assigned_doctor_id = ?")
            params.append(doctor_id.strip())
        else:
            # Fail closed: unauthorized or missing doctor_id returns zero records
            conditions.append("1 = 0")
            
        if department:
            conditions.append("s.department = ?")
            params.append(department)
            
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        query = f"""
            SELECT s.*, p.name as patient_name, p.age as patient_age, p.gender as patient_gender,
                   p.phone as patient_phone, p.abha_id as patient_abha, p.patient_token
            FROM intake_sessions s
            JOIN patients p ON s.patient_id = p.id
            {where_clause}
            ORDER BY
                CASE WHEN json_extract(s.red_flag_alert, '$.is_critical') = 1 THEN 0 ELSE 1 END,
                s.updated_at DESC
        """
        cursor = await db.execute(query, tuple(params))
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            d = _row_to_dict(r)
            for col in ("consent_record", "red_flag_alert", "socrates_hpi", "clinician_disposition"):
                if d.get(col) and isinstance(d[col], str):
                    try:
                        d[col] = json.loads(d[col])
                    except Exception:
                        pass
            
            # Check if there are any security mismatch alerts on this patient token
            token = d.get("patient_token")
            if token:
                alerts = await get_token_security_alerts(token)
                d["security_alerts"] = alerts

                # Count previous historical visits for this token (completed / reviewed sessions)
                cursor_count = await db.execute(
                    "SELECT COUNT(*) as cnt FROM intake_sessions WHERE patient_token = ? AND id != ?",
                    (token, d["id"])
                )
                cnt_row = await cursor_count.fetchone()
                prev_count = cnt_row["cnt"] if cnt_row else 0
                d["previous_visits_count"] = prev_count
                d["is_returning_patient"] = prev_count > 0
            else:
                d["security_alerts"] = []
                d["previous_visits_count"] = 0
                d["is_returning_patient"] = False

            result.append(d)
        return result


# ─── Longitudinal Patient Medical History ──────────────────────

async def get_patient_complete_medical_history(
    patient_token: Optional[str] = None,
    current_session_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Synthesize complete longitudinal patient medical history tied to their permanent Token ID:
    - Chronological previous consultation visits & verified summaries
    - Previous presenting symptoms and complaints
    - Prescribed medications and treatments
    - Historical lab tests and abnormal report flags
    - Previous doctor disposition notes
    - Concise overall health background summary
    """
    if not patient_token:
        return {
            "patient_token": "",
            "is_returning_patient": False,
            "total_visits_count": 0,
            "previous_visits": [],
            "cumulative_diagnoses": [],
            "cumulative_medications": [],
            "cumulative_lab_reports": [],
            "previous_doctor_notes": [],
            "overall_health_summary": "First visit. No previous clinical records on file."
        }
    token = str(patient_token).strip().upper()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Fetch patient master profile
        cursor = await db.execute("SELECT * FROM patients WHERE patient_token = ?", (token,))
        patient_row = await cursor.fetchone()
        if not patient_row:
            return {
                "patient_token": token,
                "is_returning_patient": False,
                "total_visits_count": 0,
                "previous_visits": [],
                "cumulative_diagnoses": [],
                "cumulative_medications": [],
                "cumulative_lab_reports": [],
                "previous_doctor_notes": [],
                "overall_health_summary": "First visit. No previous clinical records on file."
            }

        patient = _row_to_dict(patient_row)

        # 2. Fetch all intake sessions for this patient token
        cursor = await db.execute(
            """SELECT s.*, p.name as patient_name, p.age as patient_age, p.gender as patient_gender
               FROM intake_sessions s
               JOIN patients p ON s.patient_id = p.id
               WHERE s.patient_token = ?
               ORDER BY s.created_at DESC""",
            (token,)
        )
        session_rows = await cursor.fetchall()

        all_sessions = []
        for sr in session_rows:
            sd = _row_to_dict(sr)
            for col in ("consent_record", "red_flag_alert", "socrates_hpi", "clinician_disposition", "fhir_bundle"):
                if sd.get(col) and isinstance(sd[col], str):
                    try:
                        sd[col] = json.loads(sd[col])
                    except Exception:
                        sd[col] = {}
            sd["documents"] = await get_session_documents(sd["id"])
            all_sessions.append(sd)

    # Separate into previous visits (all visits except current session)
    previous_visits = []
    for s in all_sessions:
        if current_session_id is not None and s["id"] == current_session_id:
            continue
        previous_visits.append(s)

    # 3. Aggregate past diagnoses across patient master + previous sessions + documents
    diagnoses_set = set()
    diagnoses_list = []

    # Master conditions
    for cond in (patient.get("conditions") or []):
        if isinstance(cond, str) and cond.strip() and cond not in diagnoses_set:
            diagnoses_set.add(cond)
            diagnoses_list.append({"diagnosis": cond, "source": "Master Profile", "date": patient.get("created_at")})

    # Session diagnoses & chief complaints
    for s in previous_visits:
        date_str = s.get("created_at", "")
        # Chief complaint
        cc = s.get("socrates_hpi", {}).get("chief_complaint")
        if cc and cc not in diagnoses_set and cc not in ("Identifying...", "General intake", "—"):
            diagnoses_set.add(cc)
            diagnoses_list.append({
                "diagnosis": cc,
                "source": f"Visit {s.get('queue_number')} ({s.get('department', 'OPD')})",
                "date": date_str
            })

        # Extracted diagnoses from scanned documents
        for doc in s.get("documents", []):
            extracted = doc.get("extracted_entities", {})
            for d in (extracted.get("diagnoses") or []):
                if d and d not in diagnoses_set:
                    diagnoses_set.add(d)
                    diagnoses_list.append({
                        "diagnosis": d,
                        "source": f"Document: {doc.get('file_name')}",
                        "date": doc.get("uploaded_at", date_str)
                    })

    # 4. Aggregate cumulative medications across master + past doctor notes + documents
    medications_map = {}

    for med in (patient.get("medications") or []):
        if isinstance(med, dict) and med.get("name"):
            name = med["name"]
            medications_map[name.lower()] = {
                "name": name,
                "dosage": med.get("dosage", "As prescribed"),
                "frequency": med.get("frequency", "Standard"),
                "source": "Master Profile",
                "date": patient.get("created_at")
            }
        elif isinstance(med, str) and med.strip():
            medications_map[med.lower()] = {
                "name": med,
                "dosage": "As prescribed",
                "frequency": "Standard",
                "source": "Master Profile",
                "date": patient.get("created_at")
            }

    for s in previous_visits:
        date_str = s.get("created_at", "")
        disp = s.get("clinician_disposition", {})
        doc_notes = disp.get("notes") or ""

        # Check documents for medications
        for doc in s.get("documents", []):
            extracted = doc.get("extracted_entities", {})
            for m in (extracted.get("medications") or []):
                if isinstance(m, dict) and m.get("name"):
                    m_name = m["name"]
                    medications_map[m_name.lower()] = {
                        "name": m_name,
                        "dosage": m.get("dosage", "—"),
                        "frequency": m.get("frequency", "—"),
                        "source": f"Prescription ({doc.get('file_name')})",
                        "date": doc.get("uploaded_at", date_str)
                    }

    # 5. Aggregate cumulative lab reports and abnormal test flags
    lab_reports_list = []
    for s in previous_visits:
        date_str = s.get("created_at", "")
        for doc in s.get("documents", []):
            extracted = doc.get("extracted_entities", {})
            for lab in (extracted.get("lab_results") or []):
                if isinstance(lab, dict) and lab.get("test_name"):
                    lab_reports_list.append({
                        "test_name": lab.get("test_name"),
                        "value": lab.get("value"),
                        "unit": lab.get("unit", ""),
                        "reference_range": lab.get("reference_range", "Standard"),
                        "is_abnormal": bool(lab.get("is_abnormal")),
                        "flag": lab.get("flag", "NORMAL"),
                        "visit_date": doc.get("uploaded_at", date_str),
                        "file_name": doc.get("file_name")
                    })

    # 6. Aggregate previous doctor notes & dispositions
    doctor_notes_list = []
    for s in previous_visits:
        disp = s.get("clinician_disposition", {})
        notes = disp.get("notes") or ""
        if notes or s.get("status") == "physician_reviewed":
            doctor_notes_list.append({
                "session_id": s["id"],
                "queue_number": s.get("queue_number"),
                "department": s.get("department", "allopathic"),
                "doctor_name": disp.get("assigned_doctor") or "Attending Physician",
                "notes": notes if notes else "Consultation completed and verified.",
                "date": disp.get("confirmed_at") or s.get("updated_at") or s.get("created_at"),
                "status": s.get("status")
            })

    # 7. Generate concise overall health summary
    total_prev = len(previous_visits)
    first_date = previous_visits[-1].get("created_at") if previous_visits else None
    last_date = previous_visits[0].get("created_at") if previous_visits else None

    if total_prev > 0:
        diag_names = [d["diagnosis"] for d in diagnoses_list[:4]]
        diag_summary = ", ".join(diag_names) if diag_names else "General outpatient follow-up"
        med_names = [m["name"] for m in list(medications_map.values())[:4]]
        med_summary = ", ".join(med_names) if med_names else "No active chronic medications on record"
        abnormal_labs = [f"{l['test_name']} ({l['value']} {l['unit']})" for l in lab_reports_list if l.get("is_abnormal")][:3]
        abnormal_summary = f" Notable abnormal findings: {', '.join(abnormal_labs)}." if abnormal_labs else ""

        overall_summary = (
            f"Returning patient ({patient.get('age', '—')}y {patient.get('gender', '')}) with {total_prev} prior visit(s). "
            f"Key past diagnoses / complaints: {diag_summary}. "
            f"Past prescribed medications: {med_summary}.{abnormal_summary}"
        )
    else:
        overall_summary = f"First consultation at MediKiosk for {patient.get('name')}. No prior visits on file."

    return {
        "patient_token": token,
        "is_returning_patient": total_prev > 0,
        "total_visits_count": total_prev,
        "first_visit_date": first_date,
        "last_visit_date": last_date,
        "patient_profile": {
            "name": patient.get("name"),
            "age": patient.get("age"),
            "gender": patient.get("gender"),
            "phone": patient.get("phone"),
            "abha_id": patient.get("abha_id"),
            "allergies": patient.get("allergies") or [],
            "conditions": patient.get("conditions") or []
        },
        "previous_visits": previous_visits,
        "cumulative_diagnoses": diagnoses_list,
        "cumulative_medications": list(medications_map.values()),
        "cumulative_lab_reports": lab_reports_list,
        "previous_doctor_notes": doctor_notes_list,
        "overall_health_summary": overall_summary
    }


async def update_patient_master_health_record(
    patient_id: int,
    new_condition: Optional[str] = None,
    new_medication: Optional[Dict] = None,
    doctor_note: Optional[str] = None
):
    """Update patient master profile with newly confirmed diagnoses and medications."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
        p = await cursor.fetchone()
        if not p:
            return

        p_dict = _row_to_dict(p)
        conditions = p_dict.get("conditions") or []
        medications = p_dict.get("medications") or []
        existing_notes = p_dict.get("notes") or ""

        if new_condition and new_condition not in conditions:
            conditions.append(new_condition)

        if new_medication:
            med_name = new_medication.get("name", "").lower()
            if not any(m.get("name", "").lower() == med_name for m in medications if isinstance(m, dict)):
                medications.append(new_medication)

        new_notes_str = existing_notes
        if doctor_note:
            timestamp = datetime.now().strftime("%Y-%m-%d")
            entry = f"[{timestamp}] {doctor_note}"
            new_notes_str = f"{existing_notes}\n{entry}".strip()

        await db.execute(
            """UPDATE patients
               SET conditions = ?, medications = ?, notes = ?
               WHERE id = ?""",
            (json.dumps(conditions), json.dumps(medications), new_notes_str, patient_id)
        )
        await db.commit()


# ΓöÇΓöÇΓöÇ Messages CRUD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async def save_session_message(
    session_id: int,
    role: str,
    content: str,
    provenance: str = "patient_reported",
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    file_name: Optional[str] = None
) -> Dict[str, Any]:
    """Save an interview message within an intake session."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO session_messages
               (session_id, role, content, provenance, file_path, file_type, file_name)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session_id, role, content, provenance, file_path, file_type, file_name)
        )
        await db.commit()
        msg_id = cursor.lastrowid
        return {
            "id": msg_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "provenance": provenance,
            "file_path": file_path,
            "file_type": file_type,
            "file_name": file_name,
            "timestamp": datetime.now().isoformat()
        }


async def get_session_messages(session_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve chat history for an intake session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?",
            (session_id, limit)
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]


# ΓöÇΓöÇΓöÇ Document CRUD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async def save_document(
    session_id: int,
    patient_id: int,
    file_path: str,
    file_name: str,
    file_type: str,
    doc_type: str = "prescription",
    extracted_entities: Optional[Dict] = None,
    ocr_text: str = ""
) -> Dict[str, Any]:
    """Save metadata and extracted medical entities of an uploaded document."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO documents
               (session_id, patient_id, file_path, file_name, file_type, doc_type, extracted_entities, ocr_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, patient_id, file_path, file_name, file_type, doc_type,
             json.dumps(extracted_entities or {}), ocr_text)
        )
        await db.commit()
        doc_id = cursor.lastrowid

    return {
        "id": doc_id,
        "session_id": session_id,
        "patient_id": patient_id,
        "file_path": file_path,
        "file_name": file_name,
        "file_type": file_type,
        "doc_type": doc_type,
        "extracted_entities": extracted_entities or {},
        "ocr_text": ocr_text,
        "uploaded_at": datetime.now().isoformat()
    }


async def get_session_documents(session_id: int) -> List[Dict[str, Any]]:
    """Get all documents associated with an intake session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM documents WHERE session_id = ? ORDER BY uploaded_at ASC", (session_id,))
        rows = await cursor.fetchall()
        docs = []
        for r in rows:
            d = _row_to_dict(r)
            if d.get("extracted_entities") and isinstance(d["extracted_entities"], str):
                try:
                    d["extracted_entities"] = json.loads(d["extracted_entities"])
                except Exception:
                    d["extracted_entities"] = {}
            docs.append(d)
        return docs


# ΓöÇΓöÇΓöÇ Security Audit Log & Token Mismatch Alerts ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

async def log_audit_event(
    actor_role: str,
    action: str,
    session_id: Optional[int] = None,
    patient_token: Optional[str] = None,
    details: Optional[Dict] = None
):
    """Record a clinical action or security event into the audit trail."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO audit_logs (session_id, patient_token, actor_role, action, details) VALUES (?, ?, ?, ?, ?)",
            (session_id, patient_token, actor_role, action, json.dumps(details or {}))
        )
        await db.commit()


async def get_token_security_alerts(patient_token: str) -> List[Dict[str, Any]]:
    """Retrieve security/mismatch alerts for a patient token."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM audit_logs WHERE patient_token = ? AND action = 'TOKEN_MISMATCH_ALERT' ORDER BY timestamp DESC",
            (patient_token,)
        )
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]


async def get_session_audit_logs(session_id: int) -> List[Dict[str, Any]]:
    """Retrieve full audit log trail for a session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM audit_logs WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
        rows = await cursor.fetchall()
        logs = []
        for r in rows:
            d = _row_to_dict(r)
            if d.get("details") and isinstance(d["details"], str):
                try:
                    d["details"] = json.loads(d["details"])
                except Exception:
                    pass
            logs.append(d)
        return logs


# ΓöÇΓöÇΓöÇ Helper ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

def _row_to_dict(row: aiosqlite.Row) -> Dict[str, Any]:
    """Convert SQLite row to dictionary."""
    d = dict(row)
    for field in ("conditions", "allergies", "medications"):
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                d[field] = []
    return d


# ─── Doctor Management ───────────────────────────────────────

async def get_doctor_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve doctor account by email address."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM doctors WHERE email = ?", (email.strip().lower(),))
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None


async def get_doctor_by_id(doctor_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve doctor account by unique doctor ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM doctors WHERE id = ?", (doctor_id,))
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None


async def create_doctor(
    email: str,
    password_hash: str = "",
    name: str = "",
    specialty: str = "",
    auth_provider: str = "email",
    profile_completed: int = 0,
    doctor_id: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new doctor account in the database."""
    doc_id = doctor_id or f"doc_{int(datetime.now().timestamp())}_{random.randint(100, 999)}"
    clean_email = email.strip().lower()
    clean_name = name.strip() or f"Dr. {clean_email.split('@')[0]}"

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO doctors (id, email, password_hash, name, specialty, auth_provider, profile_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (doc_id, clean_email, password_hash, clean_name, specialty.strip(), auth_provider, profile_completed))
        await db.commit()
    return await get_doctor_by_id(doc_id)


async def update_doctor_profile(
    doctor_id: str,
    name: str,
    specialty: str
) -> Optional[Dict[str, Any]]:
    """Update doctor's full name, field/specialization, and mark profile as completed."""
    clean_name = name.strip()
    if not clean_name.lower().startswith("dr.") and not clean_name.lower().startswith("dr "):
        clean_name = f"Dr. {clean_name}"

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE doctors
            SET name = ?, specialty = ?, profile_completed = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (clean_name, specialty.strip(), doctor_id))
        await db.commit()
    return await get_doctor_by_id(doctor_id)


async def list_available_doctors() -> List[Dict[str, Any]]:
    """List all registered doctors available for patient OPD selection."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT id, email, name, specialty, profile_completed, created_at
            FROM doctors
            ORDER BY created_at ASC
        """)
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]

