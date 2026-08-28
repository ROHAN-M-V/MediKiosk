"""
MediKiosk Database Layer — Async SQLite with aiosqlite
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

        # Auto-migration helpers for patient_token column
        try:
            await db.execute("ALTER TABLE patients ADD COLUMN patient_token TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE intake_sessions ADD COLUMN patient_token TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE audit_logs ADD COLUMN patient_token TEXT")
        except Exception:
            pass

    print("[DB] MediKiosk Database initialized with Token Authentication & Security Logging")


# ─── Patient Token CRUD & Verification ────────────────────────

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


# ─── Intake Session CRUD ───────────────────────────────────────

async def create_intake_session(
    patient_id: int,
    patient_token: str,
    user_id: str = "token_user",
    department: str = "allopathic",
    language: str = "en",
    consent_record: Optional[Dict] = None
) -> Dict[str, Any]:
    """Start a new clinical intake session linked to the patient token."""
    queue_number = f"MK-{random.randint(1001, 9999)}"
    session_token = f"sess_{datetime.now().strftime('%Y%m%d%H%M%S')}_{random.randint(100, 999)}"

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO intake_sessions
               (session_token, patient_token, queue_number, patient_id, user_id, department, language, consent_record, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')""",
            (session_token, patient_token, queue_number, patient_id, user_id, department, language, json.dumps(consent_record or {}))
        )
        await db.commit()
        sid = cursor.lastrowid

    await log_audit_event(
        session_id=sid,
        patient_token=patient_token,
        actor_role="patient",
        action="INTAKE_STARTED",
        details={"queue_number": queue_number, "language": language}
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
    """Update intake session status, SOCRATES data, summary, or doctor review."""
    allowed = {"status", "department", "language", "consent_record", "red_flag_alert", "socrates_hpi", "structured_summary", "clinician_disposition", "fhir_bundle"}
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


async def list_physician_queue(department: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all intake sessions for the Doctor Dashboard with token and security alerts."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = """
            SELECT s.*, p.name as patient_name, p.age as patient_age, p.gender as patient_gender,
                   p.phone as patient_phone, p.abha_id as patient_abha, p.patient_token
            FROM intake_sessions s
            JOIN patients p ON s.patient_id = p.id
            ORDER BY
                CASE WHEN json_extract(s.red_flag_alert, '$.is_critical') = 1 THEN 0 ELSE 1 END,
                s.updated_at DESC
        """
        cursor = await db.execute(query)
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
            if d.get("patient_token"):
                alerts = await get_token_security_alerts(d["patient_token"])
                d["security_alerts"] = alerts
            else:
                d["security_alerts"] = []

            result.append(d)
        return result


# ─── Messages CRUD ─────────────────────────────────────────────

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


# ─── Document CRUD ─────────────────────────────────────────────

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


# ─── Security Audit Log & Token Mismatch Alerts ────────────────

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


# ─── Helper ────────────────────────────────────────────────────

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
