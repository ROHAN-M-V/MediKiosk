"""
MediKiosk AI Engine — Multi-Modal Clinical Intake, OCR Extraction,
SOCRATES Adaptive Triage, Dual-Language (English + Hindi), and ABDM FHIR Generator.
High-Speed Async Engine Powered by Google GenAI SDK (gemini-3.1-flash-lite / gemini-3.5-flash-lite).
"""

import os
import json
import base64
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

import google.genai as genai
from google.genai import types

load_dotenv()

# Initialize High-Speed GenAI Client
genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

FAST_INTAKE_MODEL = "gemini-3.1-flash-lite"
FAST_FALLBACK_MODEL = "gemini-3.5-flash-lite"


# ─── 1. Adaptive Clinical Intake Interview (SOCRATES + Multilingual + Red Flag) ───

INTAKE_SYSTEM_PROMPT = """You are MediKiosk AI, an ultra-fast, empathetic clinical intake assistant in a hospital outpatient kiosk.

YOUR GOAL:
Collect patient presenting symptoms concisely using the clinical SOCRATES framework before doctor review.

MULTILINGUAL LANGUAGE RULES:
- ONLY SUPPORT TWO LANGUAGES: English and Hindi.
- Automatically detect whether the patient is communicating in English or Hindi (including Devanagari or Hinglish/romanized Hindi).
- If the patient communicates in Hindi, reply in natural, compassionate, simple conversational Hindi (Devanagari script) and provide Hindi suggested quick chips.
- If the patient communicates in English, reply in natural, compassionate English and provide English suggested quick chips.
- Always include `"detected_language": "hi"` or `"en"` in your JSON response.

CLINICAL RULES:
1. Ask 1-2 focused, compassionate questions at a time in simple, jargon-free language.
2. Track SOCRATES (Site, Onset, Character, Radiation, Associations, Time course, Exacerbating/Relieving, Severity 1-10).
3. RED-FLAG EMERGENCY DETECTION:
   Immediately flag critical acute risks (Crushing chest pain / radiating to arm/jaw, acute stroke / slurred speech / facial droop, severe respiratory failure / stridor, acute sepsis).

OUTPUT FORMAT:
Respond with ONLY a valid JSON object matching this schema:
```json
{
  "reply_text": "Empathetic reply in the patient's language + next 1-2 focused questions",
  "detected_language": "en" | "hi",
  "suggested_chips": ["Chip 1", "Chip 2", "Chip 3", "Chip 4"],
  "socrates_extracted": {
    "chief_complaint": "Extracted main issue (English or clear Hindi)",
    "site": "Location or null",
    "onset": "Duration or null",
    "character": "Quality or null",
    "radiation": "Radiation path or null",
    "associations": ["List of symptoms"],
    "time_course": "Pattern or null",
    "exacerbating_relieving": "Triggers or null",
    "severity": "1-10 rating or null"
  },
  "red_flag": {
    "is_critical": true/false,
    "severity": "NORMAL" | "HIGH_EMERGENCY",
    "reason": "Short clinical reason if critical or null"
  },
  "is_intake_complete": true/false
}
```
"""


async def run_intake_conversation(
    user_message: str,
    patient_info: Dict[str, Any],
    history_messages: List[Dict[str, Any]],
    current_socrates: Optional[Dict[str, Any]] = None,
    language: str = "en"
) -> Dict[str, Any]:
    """High-speed async conversational interview supporting English and Hindi."""
    history_str = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history_messages[-4:]])

    prompt = f"""Language preference hint: {language} (auto-detect based on patient message)
Patient: {patient_info.get('name', 'Patient')}, {patient_info.get('age', 'Unknown')}yo {patient_info.get('gender', '')}
Current SOCRATES: {json.dumps(current_socrates or {})}
Recent transcript:
{history_str}

PATIENT MESSAGE: "{user_message}"
Output JSON:"""

    for model_name in (FAST_INTAKE_MODEL, FAST_FALLBACK_MODEL):
        try:
            response = await genai_client.aio.models.generate_content(
                model=model_name,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_text(text=f"{INTAKE_SYSTEM_PROMPT}\n\n{prompt}")
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=700
                )
            )

            content = response.text or ""
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            parsed = json.loads(content)
            if "detected_language" not in parsed:
                # Basic fallback detection
                is_hindi = any('\u0900' <= char <= '\u097F' for char in user_message)
                parsed["detected_language"] = "hi" if is_hindi else "en"
            return parsed
        except Exception as e:
            continue

    # Instant Fallback if offline
    is_hindi = any('\u0900' <= char <= '\u097F' for char in user_message)
    if is_hindi or language == "hi":
        return {
            "reply_text": "यह बताने के लिए धन्यवाद। क्या आप बता सकते हैं कि यह तकलीफ कब से शुरू हुई और 1 से 10 के पैमाने पर दर्द कितना तेज है?",
            "detected_language": "hi",
            "suggested_chips": ["आज से शुरू हुआ", "2-3 दिन से", "हल्का दर्द (1-4)", "तेज दर्द (7-10)"],
            "socrates_extracted": current_socrates or {"chief_complaint": user_message},
            "red_flag": {"is_critical": False, "severity": "NORMAL", "reason": None},
            "is_intake_complete": False
        }

    return {
        "reply_text": "Thank you for sharing that. Could you tell me when these symptoms first started and how severe the discomfort feels from 1 to 10?",
        "detected_language": "en",
        "suggested_chips": ["Started today", "Started 2-3 days ago", "Mild (1-4)", "Severe (7-10)"],
        "socrates_extracted": current_socrates or {"chief_complaint": user_message},
        "red_flag": {"is_critical": False, "severity": "NORMAL", "reason": None},
        "is_intake_complete": False
    }


# ─── 2. Medical Document OCR & Entity Extraction ───────────────

DOCUMENT_OCR_PROMPT = """You are a Clinical Document AI and Medical Entity Extractor.
Analyze this medical document (Prescription, Lab Report, Discharge Summary, or Scan).

Extract all clinical entities into this structured JSON format:
```json
{
  "doc_type": "prescription" | "lab_report" | "discharge_summary" | "imaging_report" | "other",
  "document_date": "YYYY-MM-DD or Unknown",
  "diagnoses": ["List of identified medical conditions"],
  "medications": [
    {
      "name": "Drug Name",
      "dosage": "500 mg",
      "frequency": "BD / Twice daily",
      "duration": "5 days",
      "instructions": "After meals"
    }
  ],
  "lab_results": [
    {
      "test_name": "HbA1c",
      "value": "8.4",
      "unit": "%",
      "reference_range": "4.0-5.6",
      "is_abnormal": true,
      "flag": "HIGH"
    }
  ],
  "summary": "Concise 2-sentence clinical summary of document"
}
```
"""


async def analyze_medical_document(
    file_path: str,
    file_type: str,
    file_name: str,
    doc_type_hint: str = "prescription"
) -> Dict[str, Any]:
    """Extract clinical entities from prescriptions, reports, or images."""
    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        mime_type = file_type or "image/jpeg"
        if file_name.lower().endswith(".pdf"):
            mime_type = "application/pdf"
        elif file_name.lower().endswith(".png"):
            mime_type = "image/png"
        elif file_name.lower().endswith(".jpg") or file_name.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"

        part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)

        response = await genai_client.aio.models.generate_content(
            model=FAST_INTAKE_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=f"{DOCUMENT_OCR_PROMPT}\n\nHint: {doc_type_hint}. Filename: {file_name}"),
                        part
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=1000
            )
        )

        content = response.text or ""
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        return json.loads(content)
    except Exception as e:
        return {
            "doc_type": doc_type_hint,
            "document_date": datetime.now().strftime("%Y-%m-%d"),
            "diagnoses": ["Prescription / Medical Record Scanned"],
            "medications": [],
            "lab_results": [],
            "summary": f"Uploaded {file_name} recorded for clinical review."
        }


# ─── 3. Physician Clinical Summary Synthesis ───────────────────

PHYSICIAN_SUMMARY_PROMPT = """You are a Senior Hospital Clinical Documentation Specialist.
Generate a structured, verifiable **Physician Intake Summary** in Markdown format based on the patient's symptoms, SOCRATES history, and scanned documents.
Note: If patient communicated in Hindi, provide the clinical summary in standard English clinical notation for attending physician review, noting any patient-reported Hindi terms.

STRUCTURE REQUIRED:
# Clinical Intake Summary
## 1. Chief Complaint & History of Presenting Illness (HPI)
(Structured SOCRATES breakdown)

## 2. Active Medications & Past Medical History
(From scanned prescriptions and patient reports)

## 3. Key Laboratory & Diagnostic Findings
(Highlight abnormal lab values with flags)

## 4. Triage Assessment & Suggested Differential
(Primary considerations for attending doctor review)
"""


async def generate_physician_clinical_summary(
    patient_info: Dict[str, Any],
    socrates_hpi: Dict[str, Any],
    documents: List[Dict[str, Any]],
    messages: List[Dict[str, Any]]
) -> str:
    """Synthesize complete clinical summary draft for physician verification."""
    docs_context = "\n".join([
        f"- Document: {d.get('file_name', '')} ({d.get('doc_type', '')})\n  Entities: {json.dumps(d.get('extracted_entities', {}))}"
        for d in documents
    ])

    prompt = f"""
Patient Demographics:
- Name: {patient_info.get('name', 'Patient')}
- Age: {patient_info.get('age', 'Unknown')}
- Gender: {patient_info.get('gender', 'Unknown')}
- Known Conditions: {patient_info.get('conditions', [])}

SOCRATES HPI:
{json.dumps(socrates_hpi, indent=2)}

Uploaded Records & Extracted Data:
{docs_context or 'No external documents uploaded.'}

Transcript Highlights:
{json.dumps([m.get('content', '') for m in messages[-8:]])}
"""

    try:
        response = await genai_client.aio.models.generate_content(
            model=FAST_INTAKE_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=f"{PHYSICIAN_SUMMARY_PROMPT}\n\n{prompt}")
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=1200
            )
        )
        return response.text or "# Clinical Intake Summary\nDraft summary available for doctor review."
    except Exception as e:
        return f"# Clinical Intake Summary\n**Patient:** {patient_info.get('name')} ({patient_info.get('age')}y {patient_info.get('gender')})\n**Chief Complaint:** {socrates_hpi.get('chief_complaint', 'General Consultation')}\n**Onset:** {socrates_hpi.get('onset', 'N/A')}\n**Severity:** {socrates_hpi.get('severity', 'N/A')}/10"


# ─── 4. ABDM FHIR R4 Bundle Export Generator ───────────────────

async def generate_abdm_fhir_bundle(
    patient_info: Dict[str, Any],
    session_data: Dict[str, Any],
    documents: List[Dict[str, Any]],
    confirmed_summary: str,
    diagnosis: Optional[str] = "",
    prescriptions: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate an HL7 FHIR R4 Compliant Bundle for Ayushman Bharat Digital Mission (ABDM)."""
    patient_id = f"PAT-{patient_info.get('id', '999')}"
    encounter_id = f"ENC-{session_data.get('id', '101')}"
    timestamp = datetime.now().isoformat() + "Z"

    entries = [
        {
            "fullUrl": f"urn:uuid:Composition/{encounter_id}",
            "resource": {
                "resourceType": "Composition",
                "id": encounter_id,
                "status": "final",
                "type": {
                    "coding": [{
                        "system": "http://snomed.info/sct",
                        "code": "371530004",
                        "display": "Clinical consultation report"
                    }]
                },
                "subject": {"reference": f"Patient/{patient_id}", "display": patient_info.get("name")},
                "date": timestamp,
                "title": "MediKiosk Clinical Intake & Triage Record",
                "section": [{
                    "title": "Clinical Summary Draft",
                    "text": {"status": "generated", "div": f"<div>{confirmed_summary}</div>"}
                }]
            }
        },
        {
            "fullUrl": f"urn:uuid:Patient/{patient_id}",
            "resource": {
                "resourceType": "Patient",
                "id": patient_id,
                "name": [{"text": patient_info.get("name")}],
                "gender": (patient_info.get("gender") or "unknown").lower(),
                "identifier": [{"system": "https://healthid.abdm.gov.in", "value": patient_info.get("abha_id") or "UNLINKED"}]
            }
        }
    ]

    # Add Condition resource if diagnosis is present
    if diagnosis and diagnosis.strip():
        cond_id = f"COND-{session_data.get('id', '101')}"
        entries.append({
            "fullUrl": f"urn:uuid:Condition/{cond_id}",
            "resource": {
                "resourceType": "Condition",
                "id": cond_id,
                "clinicalStatus": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active"
                    }]
                },
                "verificationStatus": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed"
                    }]
                },
                "code": {
                    "text": diagnosis
                },
                "subject": {"reference": f"Patient/{patient_id}", "display": patient_info.get("name")},
                "recordedDate": timestamp
            }
        })

    # Add MedicationRequest resources if prescriptions are present
    if prescriptions and isinstance(prescriptions, list):
        for idx, rx in enumerate(prescriptions):
            med_name = rx.get("name", "").strip() if isinstance(rx, dict) else str(rx).strip()
            if not med_name:
                continue
            med_id = f"MED-{session_data.get('id', '101')}-{idx + 1}"
            dosage_str = rx.get("dosage", "") if isinstance(rx, dict) else ""
            freq_str = rx.get("frequency", "") if isinstance(rx, dict) else ""
            dur_str = rx.get("duration", "") if isinstance(rx, dict) else ""
            instructions = " ".join(filter(bool, [dosage_str, freq_str, dur_str])) or "As directed"
            entries.append({
                "fullUrl": f"urn:uuid:MedicationRequest/{med_id}",
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": med_id,
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {
                        "text": med_name
                    },
                    "subject": {"reference": f"Patient/{patient_id}", "display": patient_info.get("name")},
                    "authoredOn": timestamp,
                    "dosageInstruction": [{
                        "text": instructions
                    }]
                }
            })

    # Add DocumentReference resources for attached files
    if documents and isinstance(documents, list):
        for idx, doc in enumerate(documents):
            doc_id = f"DOC-{doc.get('id', idx + 1)}"
            entries.append({
                "fullUrl": f"urn:uuid:DocumentReference/{doc_id}",
                "resource": {
                    "resourceType": "DocumentReference",
                    "id": doc_id,
                    "status": "current",
                    "type": {
                        "text": doc.get("doc_type", "Medical Document")
                    },
                    "subject": {"reference": f"Patient/{patient_id}", "display": patient_info.get("name")},
                    "date": doc.get("created_at", timestamp),
                    "description": doc.get("file_name", "attached_record")
                }
            })

    bundle = {
        "resourceType": "Bundle",
        "id": f"bundle-medikiosk-{session_data.get('queue_number', '0000')}",
        "meta": {
            "versionId": "1",
            "lastUpdated": timestamp,
            "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"]
        },
        "identifier": {
            "system": "https://medikiosk.health.gov.in/bundles",
            "value": session_data.get("session_token", "sess-token")
        },
        "type": "document",
        "timestamp": timestamp,
        "entry": entries
    }
    return bundle
