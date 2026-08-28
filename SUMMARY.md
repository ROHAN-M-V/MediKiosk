# MediKiosk — AI-Powered Clinical Intake & Triage Platform

**MediKiosk** is a clinical-grade outpatient intake, triage, and medical documentation system designed for hospitals and clinics. It bridges the gap between patient walk-in arrival and the doctor's consultation room by performing an intelligent AI-guided clinical interview (following the **SOCRATES** framework), extracting medical data from prior prescriptions and lab reports via multi-modal OCR, detecting red-flag emergency symptoms, and preparing an editable clinical summary draft synchronized to **ABDM (Ayushman Bharat Digital Mission)** and hospital information systems.

---

## 🏛️ System Architecture & Portals

The application implements strict **Role-Based Separation (RBAC)** across two primary user experiences:

```
                                  ┌────────────────────────┐
                                  │   Application Entry    │
                                  └───────────┬────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  👤 Patient Portal      │                       │  🩺 Doctor Portal       │
        │  (Token-Based Auth)     │                       │  (Google OAuth / RBAC)  │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
          ┌──────────┴──────────┐                                      │
          ▼                     ▼                                      ▼
   [ New Patient ]     [ Returning Patient ]               [ Physician Console ]
   Generate Unique      Verify Name & Age                  - Live Triage OPD Queue
   Token (PT-XXXX-YY)   (Zero Medical Leak)                - Red-Flag Priority Triage
          │                     │                          - Editable Clinical Draft
          └──────────┬──────────┘                          - Scanned Prescription OCR
                     ▼                                     - ABDM FHIR R4 Bundle Sync
        ┌─────────────────────────┐                        - Security Mismatch Alerts
        │  4-Step Clinical Kiosk  │
        │  1. Check-In & Consent  │
        │  2. SOCRATES Interview  │
        │  3. OCR Document Scan   │
        │  4. OPD Queue Ticket    │
        └─────────────────────────┘
```

---

## 🔑 Authentication & Security Model

### 1. 👤 Patient Token Identification
- **No Passwords or Emails**: Patients are identified via a permanent, unguessable token format (e.g. `PT-4718-PX`).
- **New Patients**: Generates a persistent token on the spot and links all consultation records.
- **Returning Patients**: Entering a token prompts for a privacy-safe confirmation:
  ```text
  🔒 Confirm Your Identity
  Token: PT-4718-PX
  Name: Ramesh Kumar | Age: 48 yrs • Male
  [ ✓ Yes, this is me ]  [ ✕ No, this is not me ]
  ```
- **Zero-Exposure Privacy Guarantee**: The patient kiosk **never** reveals previous medical diagnoses, past prescriptions, or lab results on the screen.
- **Wrong-Token & Mismatch Detection**: If someone enters someone else's token and clicks *"No, this is not me"*, the system logs a `TOKEN_MISMATCH_ALERT` in `audit_logs` and flags a warning badge in the Doctor Console.

### 2. 🩺 Doctor Google OAuth & Strict RBAC
- Doctors authenticate securely using **Google OAuth** or verified hospital credentials.
- Protected by FastAPI dependencies (`require_doctor_role`). Unauthenticated or non-doctor requests to physician endpoints return **`403 Forbidden`**.

---

## 📋 Patient Kiosk 4-Step Intake Workflow

1. **Step 1 — Identity & Informed Digital Consent**:
   - Patient demographics (Full Name, Age, Gender, Phone, ABHA ID).
   - Department selection: **Modern Medicine (Allopathy)** vs **AYUSH (Ayurveda)**.
   - Digital informed consent agreeing to AI-assisted intake.

2. **Step 2 — Conversational Clinical Interview**:
   - Ultra-fast conversational AI engine (response latency **~1.6 seconds**).
   - Multi-turn clinical interview guided by the **SOCRATES** framework (*Site, Onset, Character, Radiation, Associations, Time course, Exacerbating/Relieving, Severity*).
   - Real-time **SOCRATES Tracker Sidebar** showing clinical entity extraction.
   - **Emergency Red-Flag Detection**: Flags cardiac chest pain, stroke symptoms, acute respiratory failure, or sepsis with warning banners.
   - **Voice Input**: Web Speech API for voice-to-text input.
   - **Suggested Quick Chips**: Dynamic, context-aware quick-response chips.

3. **Step 3 — Medical Document Scanner & Multi-Modal OCR**:
   - Drag-and-drop file upload for prior prescriptions, lab reports, and discharge summaries.
   - AI extracts diagnoses, active medications (drug name, dosage, frequency), and lab values.
   - Highlights **Abnormal Lab Results** with red visual flags (`HIGH` / `LOW`).

4. **Step 4 — Review & OPD Queue Token Generation**:
   - Full summary review of demographic, clinical, and attached documents.
   - Submits intake packet and generates official **OPD Queue Token** (e.g. `MK-3891`).
   - Clean reset button (`+ Start Next Patient Intake`) for the next patient.

---

## 🩺 Physician Console Features

- **Live Triage OPD Queue**: Prioritizes urgent red-flag cases to the top of the queue.
- **Patient Token & Security Badges**: Highlights patient tokens and flags any suspicious mismatch attempts.
- **Editable Clinical Summary Draft**: AI-generated structured Markdown summary that doctors can edit (`[ ✏️ Edit Summary ]`) and finalize (`[ ✓ Confirm Summary ]`).
- **Original Document Viewer**: Direct links to view high-resolution uploaded scans and prescriptions.
- **ABDM FHIR R4 Bundle Export**: Generates validated HL7 FHIR R4 JSON composition compliant with India's National Digital Health Mission (NDHM).
- **Mock HIS / ABHA Synchronization**: Simulates hospital EMR/HIS record synchronization upon doctor confirmation.

---

## 💻 Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | **React (Vite)** | Reactive single-page application |
| **Styling** | **Vanilla CSS** | Obsidian Monochrome Dark & White Design System |
| **Backend API** | **FastAPI (Python 3.14)** | Asynchronous REST API with RBAC dependencies |
| **AI / LLM Engine** | **Google GenAI SDK (`gemini-3.1-flash-lite`)** | Low-latency (~1.6s) conversational triage & entity extraction |
| **Database** | **SQLite with `aiosqlite`** | Async persistence for tokens, intake sessions, docs & audit logs |
| **Doctor Auth** | **Supabase (Google OAuth)** | Doctor authentication and session token management |
| **Interoperability** | **HL7 FHIR R4 (ABDM)** | National health record standards compliance |

---

## 🗂️ Project Directory Structure

```text
medx_1/
├── backend/
│   ├── agent.py               # Google GenAI Async Engine (SOCRATES, OCR, Summaries, FHIR)
│   ├── database.py            # SQLite async schema, patient tokens, CRUD & audit logs
│   ├── main.py                # FastAPI endpoints, RBAC dependencies & static file server
│   ├── requirements.txt       # Python dependencies (fastapi, uvicorn, google-genai, aiosqlite)
│   ├── .env                   # GOOGLE_API_KEY configuration
│   └── uploads/               # Storage directory for scanned medical documents
│
├── frontend/
│   ├── index.html             # HTML5 root with Google Inter font
│   ├── package.json           # Vite & React dependencies
│   ├── vite.config.js         # Vite dev and build configuration
│   ├── .env                   # Supabase credentials (VITE_SUPABASE_URL, ANON_KEY)
│   └── src/
│       ├── App.jsx            # Master app controller, view mode router & state machine
│       ├── index.css          # Monochrome Dark & White design system styles
│       ├── supabaseClient.js  # Supabase client initialization
│       └── components/
│           ├── Auth.jsx                   # Role selection & Doctor Google OAuth login
│           ├── PatientTokenEntry.jsx      # Token lookup, confirmation & generation
│           ├── KioskHeader.jsx            # Header with role pill, stepper, language & doctor portal
│           ├── IdentityConsentStep.jsx    # Step 1: Demographics, department & consent
│           ├── ConversationalIntakeStep.jsx # Step 2: SOCRATES interview, voice & triage
│           ├── DocumentScannerStep.jsx    # Step 3: Document upload & multi-modal OCR
│           ├── KioskSummaryStep.jsx       # Step 4: Final packet review & OPD queue ticket
│           ├── PhysicianConsole.jsx       # Doctor dashboard, live queue & summary editor
│           └── FhirModal.jsx              # HL7 FHIR R4 Bundle JSON modal viewer
│
├── SUMMARY.md                 # Complete project documentation and architectural summary
└── README.md                  # Quickstart guide
```

---

## 🚀 Running the Project Locally

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # On Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The application will be live at **`http://localhost:5173`**.
