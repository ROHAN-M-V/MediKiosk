# MediKiosk — AI Clinical Intake Platform
## Hackathon MVP Transformation Prompt

You are a senior product manager, healthcare technology architect, and AI product designer. Transform my existing working web application into **MediKiosk — an AI-Powered Clinical Intake & History Platform**.

## Existing Project

The current project already uses:

- React frontend
- FastAPI backend
- Supabase database/authentication
- Existing chatbot functionality
- Existing UI/components

### Critical instruction

**Do NOT rebuild the project from scratch.**

First inspect the existing codebase and understand:

- Frontend structure
- Components
- Routing
- Authentication
- Supabase integration
- FastAPI APIs
- Database schema
- Existing chatbot/LLM implementation
- Existing styling and UI

Then extend and transform the existing application.

## UI Preservation

**Keep the existing UI style and design language.**

Do not completely redesign the application.

Preserve:

- Existing color palette
- Typography
- General component style
- Navigation
- Spacing
- Existing buttons/cards where appropriate
- Responsive behavior
- Existing visual identity

Only introduce new components required for the MediKiosk workflow.

The final application should feel like an evolution of the existing project, not a completely different application.

---

# 1. Login and Role Selection

The first screen must clearly provide two options:

- **Login as Patient**
- **Login as Doctor**

Example:

```text
MediKiosk

How would you like to continue?

[ PATIENT ]
Start medical intake

[ DOCTOR ]
View patient records
```

After selecting a role, route the user to the appropriate authentication/dashboard flow.

### Role-based authorization

Roles must be stored and enforced.

A patient must never be able to access the doctor dashboard.

A doctor must never be routed to the patient intake interface.

Implement authorization using Supabase authentication and backend validation. Do not rely only on hiding buttons or routes in React.

---

# 2. Patient Workflow

The patient workflow should be:

```text
Patient Login
    ↓
Patient Dashboard
    ↓
Start New Intake
    ↓
Language Selection
    ↓
Consent
    ↓
AI Medical History
    ↓
Voice / Text / Touch
    ↓
Upload Previous Records
    ↓
OCR + Medical Extraction
    ↓
Review Information
    ↓
Submit
    ↓
Clinical Summary Generated
    ↓
Doctor Dashboard
```

---

# 3. Patient Dashboard

Show:

- Patient name
- Patient ID
- Previous intake sessions
- Current session status
- Start New Medical Intake
- Previous medical summaries
- Uploaded documents
- Basic profile

Example:

```text
Welcome, Rahul

Patient ID: MK-1024

[ Start New Medical Intake ]

Previous Visits
────────────────────────
28 Aug 2026
Chest pain
Completed

12 Jun 2026
Fever
Completed
```

---

# 4. Language Selection

Before beginning the interview:

```text
Choose your preferred language

[ English ]
[ Hindi ]
```

Architect the system so additional Indian languages can be added later.

Do not attempt to implement 20 languages in the MVP.

---

# 5. Consent

Before collecting medical information, show a clear consent screen.

Explain that:

- Medical information is being collected.
- Responses are processed by the AI system.
- Previous medical documents may be processed.
- The resulting summary is available to authorized medical staff.

Provide:

```text
[ I Understand & Give Consent ]
```

Store consent status and timestamp in Supabase.

Support an audio explanation where practical.

---

# 6. AI Clinical History Interview

This is the primary AI feature.

Transform the existing chatbot into a **structured clinical history-taking engine**.

Do NOT make it behave like a generic chatbot.

The AI should maintain structured clinical information behind the conversation.

Use a schema similar to:

```json
{
  "chief_complaint": "",
  "duration": "",
  "onset": "",
  "symptoms": [],
  "history_of_present_illness": "",
  "past_medical_history": [],
  "past_surgical_history": [],
  "medications": [],
  "allergies": [],
  "family_history": "",
  "personal_history": "",
  "review_of_systems": []
}
```

Improve the schema if required after inspecting the existing backend.

---

# 7. Adaptive Questioning

Do NOT ask every patient the exact same fixed questions.

The AI should dynamically ask relevant follow-up questions based on patient responses.

Example:

Patient:
> I have chest pain.

The AI should ask relevant questions about:

- Onset
- Duration
- Location
- Character
- Severity
- Radiation
- Aggravating factors
- Relieving factors
- Associated symptoms
- Breathlessness
- Sweating
- Nausea

If the patient says:

> I have a headache.

The questioning path should adapt to headache-related information.

The backend must maintain the current structured history state so the AI knows:

- What has already been answered
- What information is missing
- What question should come next

Do not repeatedly ask questions whose answers are already known.

---

# 8. Voice Input

Add voice interaction to the existing chatbot.

Workflow:

```text
AI asks question
    ↓
Patient presses microphone
    ↓
Patient speaks
    ↓
Speech-to-text
    ↓
AI processes response
    ↓
Structured history updated
    ↓
Next question
```

Keep text input as a fallback.

If speech recognition fails:

```text
We couldn't understand that.

[ Try Again ]
[ Type Answer ]
```

Show the recognized text where practical so the patient can correct mistakes.

---

# 9. Touch-Based Answers

Where appropriate, provide buttons instead of requiring free-text input.

Examples:

```text
Do you have fever?

[ YES ] [ NO ]
```

```text
How severe is the pain?

[ Mild ] [ Moderate ] [ Severe ]
```

```text
When did it start?

[ Today ]
[ Yesterday ]
[ More than a week ago ]
```

This is important for elderly and low-literacy users.

---

# 10. Progress Indicator

Show interview progress.

Examples:

```text
Medical History

████████████░░░░

History of Present Illness
```

or:

```text
Step 3 of 6
```

Do not force unnecessary questions just to reach 100%.

---

# 11. Red-Flag Detection

Add a red-flag detection layer.

Detect predefined potentially urgent symptom combinations.

Example:

```text
Patient:
Severe chest pain + difficulty breathing

        ↓

🚨 POTENTIAL RED FLAG

Priority clinical assessment recommended.
```

The system must NOT diagnose diseases.

Never display:

> You are having a heart attack.

Instead display:

> Potential red-flag symptoms detected. Priority clinical assessment recommended.

Flag the case to the doctor/triage dashboard.

---

# 12. Medical Document Upload

After the interview, allow patients to upload previous records.

Support:

- JPG
- PNG
- PDF

Document types:

- Prescriptions
- Laboratory reports
- Discharge summaries
- Investigation reports
- Previous medical records

Example:

```text
Previous Medical Records

[ 📷 Take Photo ]
[ 📄 Upload File ]

Uploaded Documents

✓ prescription.jpg
✓ blood_report.pdf
✓ discharge_summary.pdf
```

For the hackathon, use prepared sample documents to guarantee a reliable demo.

---

# 13. OCR and Medical Information Extraction

Build the pipeline:

```text
Uploaded Document
       ↓
OCR
       ↓
Extracted Text
       ↓
Medical Entity Extraction
       ↓
Structured Medical Data
```

Extract:

### Diagnoses
- Disease/condition names

### Medications
- Medication name
- Dose
- Frequency

### Investigations
- Test name
- Value
- Unit
- Reference range if available
- Date

### Procedures
- Surgery
- Procedure
- Date

### Other relevant information

Keep the original document accessible to the doctor.

---

# 14. OCR Confidence and Verification

Do not blindly trust OCR.

If information is uncertain:

```text
⚠ Uncertain extraction

Medication:
Metformin 500 mg

[ Verify ]
[ View Original Document ]
```

The doctor must be able to compare extracted information against the original document.

---

# 15. Medical Timeline

Create a chronological timeline from previous documents and current history.

Example:

```text
MEDICAL TIMELINE

2024
│
├── Diabetes diagnosed
│
2025
│
├── Hypertension diagnosed
│
├── Metformin prescribed
│
2026
│
├── HbA1c: 8.2%
│
└── Current visit
    Chest pain × 2 days
```

Use extracted dates where available.

If the date is unknown, mark it as unknown rather than inventing one.

---

# 16. Abnormal Lab Highlighting

If a laboratory report contains reference ranges, identify potentially out-of-range values.

Example:

```text
HbA1c       8.2%       ⚠
Hb          9.2 g/dL   ⚠
WBC         8,200      ✓
```

Do not automatically diagnose the cause of an abnormal result.

---

# 17. Patient Review Screen

Before submission, allow the patient to review collected information.

Example:

```text
YOUR INFORMATION

Chief Complaint
Chest pain

Duration
2 days

Allergies
No known drug allergies

Medications
Metformin 500 mg

[ Edit ]
[ Confirm & Submit ]
```

---

# 18. AI Clinical Summary

Combine:

```text
Patient interview
       +
Uploaded documents
       ↓
AI structured summary
```

Generate a concise physician-readable summary containing:

- Patient information
- Chief complaint
- History of present illness
- Past medical history
- Past surgical history
- Medications
- Allergies
- Family history
- Personal/social history
- Review of systems
- Previous investigations
- Medical timeline
- Red flags
- Important items requiring attention

Do not generate a diagnosis unless it was explicitly present in the patient's existing records.

Clearly distinguish patient-reported information from extracted document information.

---

# 19. Source Attribution

Show where important information came from.

Example:

```text
Chest pain × 2 days
[Patient reported]

HbA1c: 8.2%
[Extracted from report]

Metformin 500 mg BD
[Prescription — 12/03/2026]
```

---

# 20. Uncertainty Detection

If the AI/OCR is uncertain:

```text
⚠ Medication name uncertain

Extracted:
"Metformin 500 mg"

[View Document]
[Correct]
```

Never silently convert uncertain information into confirmed medical data.

---

# 21. Doctor Dashboard

Create a separate doctor-facing dashboard.

Example:

```text
Doctor Dashboard

Patient Queue

MK-1024  Rahul
Chest pain × 2 days
🚨 Red Flag

MK-1025  Priya
Fever × 3 days

MK-1026  Amit
Back pain
```

Clicking a patient opens their complete intake.

---

# 22. Doctor Patient View

Show:

- Patient demographics
- AI-generated summary
- Structured history
- Previous medical records
- Medical timeline
- Medications
- Allergies
- Investigations
- Red flags
- Original uploaded documents

Allow the doctor to switch between summary and original documents.

---

# 23. Doctor Edit and Verify

The AI summary must be editable.

Provide:

```text
[ Edit Summary ]

[ Confirm Summary ]
```

The doctor can:

- Correct information
- Add information
- Remove incorrect information
- Correct OCR mistakes
- Confirm final history

The AI-generated summary is always a draft.

---

# 24. Patient/Doctor Role-Based Security

Implement actual authorization.

```text
PATIENT
→ Can access only their own records.

DOCTOR
→ Can access authorized patient records.

PATIENT
→ Cannot access doctor routes.

DOCTOR
→ Cannot access patient-only intake routes.
```

Use Supabase authentication and backend authorization.

Do not rely solely on frontend route protection.

---

# 25. Mock HIS / ABDM Integration

For the hackathon, do NOT build real ABDM integration.

Create a realistic mock integration layer.

After doctor confirmation:

```text
Clinical Summary Confirmed ✓

HIS
✓ Record saved

ABHA
✓ Linked

FHIR
✓ Ready
```

Clearly label these as mock/demo integrations.

Keep the architecture ready for future real ABDM/FHIR integration.

---

# 26. AYUSH Mode

If time permits, add:

```text
Select Clinical Mode

[ Modern Medicine ]
[ AYUSH / Ayurveda ]
```

AYUSH mode may collect:

- Prakriti
- Vikriti
- Sara
- Samhanana
- Pramana
- Satmya
- Sattva
- Ahara Shakti
- Vyayama Shakti
- Vaya
- Ahara-Vihara

Do not implement autonomous Ayurvedic diagnosis in the MVP.

---

# 27. Session Management

Implement:

- Start intake
- Save progress
- Resume interrupted session
- Submit intake
- Mark intake completed
- End session
- Clear temporary session data after completion

---

# 28. Database

Extend the existing Supabase database rather than replacing it.

Create or modify tables as necessary:

```text
users
patients
doctors
intake_sessions
clinical_history
conversation_messages
medical_documents
extracted_medical_data
medical_timeline
clinical_summaries
consents
red_flags
doctor_reviews
```

Use proper foreign keys and role relationships.

Avoid unnecessary duplication.

---

# 29. API Design

Extend the existing FastAPI backend.

Create logical endpoints for:

- Authentication
- Patient profile
- Doctor profile
- Intake session
- Conversation
- Structured history
- Voice transcription
- Document upload
- OCR processing
- Medical extraction
- Timeline
- Summary generation
- Red flags
- Doctor review
- Mock HIS/ABDM sync

Reuse existing APIs where possible.

Do not create duplicate functionality.

---

# 30. Error Handling

Gracefully handle:

- AI API failure
- OCR failure
- Speech recognition failure
- Invalid document
- Large document
- Empty response
- Network failure
- Expired session
- Unauthorized access
- Missing medical information

One failed AI/OCR request must not crash the entire intake session.

---

# 31. Demo Mode

Because this is a hackathon project, create a reliable demo mode.

Provide sample patients and sample medical documents.

Example:

```text
[ Load Demo Patient ]

Rahul Sharma
42 years
Chest pain
```

Provide sample reports that can be uploaded instantly.

The complete workflow should be demonstrable without relying on unpredictable live data.

---

# 32. UI Requirements

Keep the existing UI as the foundation.

The final UI should be:

- Professional
- Clean
- Medical
- Accessible
- Responsive
- Easy to understand

Avoid unnecessary animations and decorative UI.

Prioritize information hierarchy and usability.

The patient interface should be extremely simple.

The doctor interface can be information-dense.

---

# 33. MVP vs Future Scope

## MVP

Implement:

1. Patient/doctor role selection
2. Authentication
3. Patient dashboard
4. Doctor dashboard
5. Language selection
6. Consent
7. AI clinical history interview
8. Adaptive questioning
9. Voice input
10. Text/touch input
11. Structured history extraction
12. Medical document upload
13. OCR
14. Medical entity extraction
15. Medical timeline
16. Abnormal lab highlighting
17. Red-flag detection
18. Patient review
19. Clinical summary
20. Doctor edit/verification
21. Original document viewer
22. Source attribution
23. Mock HIS/ABDM/FHIR integration
24. Demo mode

## Future Scope

- Full ABDM integration
- Production FHIR interoperability
- Real hospital HIS integration
- ABHA authentication
- More Indian languages
- Advanced handwritten-document processing
- Large-scale hospital deployment
- Advanced AYUSH workflows
- Hospital analytics
- Real-time clinical workflow integration

## Explicitly Out of Scope for MVP

- Autonomous diagnosis
- Autonomous treatment recommendations
- Production hospital deployment
- Full ABDM certification/integration
- Aadhaar authentication
- Perfect handwritten OCR
- 20+ language support
- Complete autonomous Ayurvedic clinical reasoning

---

# 34. Recommended Architecture

Use the existing stack.

```text
React / Next.js
       ↓
FastAPI
       ↓
Supabase
       ↓
AI Services
 ├── LLM
 ├── Speech-to-Text
 ├── Text-to-Speech
 └── OCR / Document AI
```

Logical application flow:

```text
Patient UI
    ↓
Backend API
    ↓
Conversation Engine
    ↓
Structured Clinical State
    ↓
OCR / Document Processing
    ↓
Medical Entity Extraction
    ↓
Clinical Summary Generator
    ↓
Supabase
    ↓
Doctor Dashboard
```

Do not replace the existing framework or database unless there is a genuine technical reason.

---

# 35. Final End-to-End Acceptance Test

The transformation is complete only when this workflow works:

### Patient

Login as Patient  
→ Select language  
→ Give consent  
→ Start intake  
→ AI asks clinical questions  
→ Patient responds by voice/text/touch  
→ AI asks relevant follow-ups  
→ Red flags are detected where applicable  
→ Patient uploads medical report  
→ OCR extracts information  
→ Medical information is structured  
→ Timeline is generated  
→ Patient reviews information  
→ Patient submits

### Doctor

Login as Doctor  
→ Doctor dashboard opens  
→ New patient appears in queue  
→ Red flag is visible if applicable  
→ Doctor opens patient  
→ Structured clinical summary appears  
→ Previous documents are available  
→ Timeline is visible  
→ Doctor can verify/edit summary  
→ Doctor confirms  
→ Mock HIS/ABDM/FHIR sync is displayed

## Final Product Principle

Do not build a generic medical chatbot.

Build a complete **patient-to-doctor clinical intake pipeline**.

The central value proposition is:

**Collect comprehensive patient history and previous medical information before the consultation, structure it using AI, and give the physician a concise, editable, verifiable clinical summary so consultation time can be spent on examination, reasoning, and patient care.**
