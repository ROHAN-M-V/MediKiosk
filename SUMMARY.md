# MediKiosk — AI-Powered Clinical Intake & Triage Platform

> 🌐 **Live Demo**: [frontend-delta-ecru.vercel.app](https://frontend-delta-ecru.vercel.app/)

**MediKiosk** is a clinical-grade outpatient intake, triage, and medical documentation platform designed for hospitals and clinics. Built with a **Bank/ATM kiosk design philosophy** and modern responsive ergonomics, it bridges the gap between patient walk-in arrival and the doctor's consultation room. It guides patients through an intelligent conversational interview (following the clinical SOCRATES framework), extracts data from prior prescriptions and lab reports via multi-modal OCR, detects emergency red-flag symptoms, and compiles structured clinical summaries and longitudinal records for attending physicians.

---

## 🏛️ System Architecture & Portals

The application enforces strict Role-Based Separation (RBAC) across two primary user experiences:

```text
                                  ┌────────────────────────┐
                                  │   Application Entry    │
                                  └───────────┬────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  👤 Patient Portal      │                       │  🩺 Doctor Portal       │
        │  (Token-Based Auth)     │                       │  (Email/Pass & OAuth)   │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
          ┌──────────┴──────────┐                                      │
          ▼                     ▼                                      ▼
   [ New Patient ]     [ Returning Patient ]               [ Physician Console ]
   Generate Token       Verify Name & Age                  - Dashboard OPD Metrics
   (PT-XXXX-YY)         (Zero Medical Leak)                - Ongoing Active Queue
          │                     │                          - Completed Read-Only Queue
          └──────────┬──────────┘                          - 3 Concise Clinical Summaries
                     ▼                                     - Interactive Rx Composer
        ┌─────────────────────────┐                        - Longitudinal Token History
        │ 🩺 Doctor Selection     │                        - Strict Assigned OPD RBAC
        │ Dynamic Active Doctors  │                        - ABDM FHIR R4 Export
        └────────────┬────────────┘
                     ▼
        ┌─────────────────────────┐
        │ 📋 4-Step Kiosk Flow    │
        │ Step 1: Info & Consent  │
        │   ▲ ▼                   │
        │ Step 2: Symptoms & Chat │
        │   ▲ ▼                   │
        │ Step 3: Doc Upload(Opt) │
        │   ▲ ▼                   │
        │ Step 4: Confirm & Ticket│
        └────────────┬────────────┘
                     ▼
        [ ATM Queue Token Slip ]
```

---

## 🔑 Authentication & Security Model

### 1. 👤 Patient Token Identification
* **No Passwords or Emails**: Patients are identified via a permanent, unguessable token format (e.g. `PT-4718-PX`).
* **New Patients**: Generates a persistent token on the spot and links all future consultation records.
* **Returning Patients**: Entering a token prompts for a privacy-safe confirmation:
  ```text
  🔒 Confirm Your Identity
  Token: PT-4718-PX
  Name: Ramesh Kumar | Age: 48 yrs • Male
  [ ✓ Yes, this is me ]    [ ✕ No, this is not me ]
  ```
* **Zero-Exposure Privacy Guarantee**: The patient kiosk never reveals previous medical diagnoses, past prescriptions, or lab results on screen.
* **Mismatch Detection**: If someone enters another patient's token and selects "No, this is not me", the system logs an audit alert and flags a warning badge in the Doctor Console.

### 2. 🩺 Doctor Authentication & Profile Setup
* **Direct Signup & Login**: Handled via backend endpoints (`POST /api/doctors/register` and `POST /api/doctors/login`) with BCrypt password hashing. No manual email verification links required.
* **Google OAuth**: Supported with automatic backend sync (`POST /api/doctors/sync-google`).
* **Profile Setup**: Newly registered physicians complete a clean initial setup screen capturing Full Name and Medical Specialty (`POST /api/doctors/profile`).

### 3. 🛡️ Strict Doctor-Patient Access Control (Backend & Database Level)

Security is enforced at the database and authorization level, **not merely by filtering on the frontend**:

**Authorization Model**: `Authenticated Doctor → Own Doctor ID → Assigned OPD Records Only`

```text
                      [ Patient Selects Doctor A ]
                                   │
                                   ▼
                      [ OPD Session Assigned To ]
                         Doctor A User ID
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
      [ Doctor A Logs In ]                  [ Doctor B Logs In ]
      Requests /api/physician/queue         Requests /api/physician/queue
                │                                     │
                ▼                                     ▼
        Sees Patient in Queue                0 Records (Zero Leakage)
                │                                     │
                ▼                                     ▼
   Accesses /session/{id} → 200 OK       Accesses /session/{id} → 403 Forbidden!
```

#### Enforcement Rules:
1. **Queue Isolation**: In `backend/database.py`, `list_physician_queue` strictly queries:
   ```sql
   WHERE s.assigned_doctor_id = ?
   ```
2. **API Tamper Protection**: In `backend/main.py`, all physician endpoints verify `session.assigned_doctor_id == doctor["user_id"]`:
   * `GET /api/physician/session/{id}` → Returns `403 Forbidden` if an unauthorized doctor attempts to view another doctor's patient.
   * `POST /api/physician/confirm` → Blocks unauthorized doctors from verifying consultations.
   * `POST /api/physician/update-status` → Blocks unauthorized status tampering.
   * `GET /api/physician/fhir/{id}` → Rejects unauthorized medical record exports.
   * `GET /api/physician/patient-history/{token}` → Verifies requesting physician has an assigned OPD record for that patient.

---

## 📋 Patient 4-Step Intake Workflow

The patient flow features consistent **Back and Next navigation** across all steps, with complete form data preservation.

```text
[Main Entry] → [Token Screen] → [Doctor Selection] → [Step 1] ⇄ [Step 2] ⇄ [Step 3] ⇄ [Step 4] → [Queue Ticket]
```

### Symmetrical Navigation Bar Across All Steps

All section-specific continuation buttons (`Continue to Questions`, `Continue to Document Upload`, `Skip to Confirmation`) have been replaced with a unified navigation bar:

| Step | Back Button | Forward / Action Button | Notes |
| :--- | :--- | :--- | :--- |
| **Step 1: Patient Information** | `[ ← Back: Select Doctor ]` | `[ Next: Symptoms & Query → ]` | Validates Name, Age, and Consent before proceeding. |
| **Step 2: Symptoms & Chat** | `[ ← Back: Patient Information ]` | `[ Next: Medical Records → ]` | Retains full chat history and symptom summary. |
| **Step 3: Document Upload** | `[ ← Back: Symptoms & Query ]` | `[ Next: Review & Submit → ]` | Upload is optional; retains uploaded files. |
| **Step 4: Review & Submit** | `[ ← Back: Medical Records ]` | `[ ✓ Submit Check-In ]` | Submits intake and generates official queue token. |

### Zero Data Loss on Back Navigation
* `patientFormData` is managed in top-level state in `App.jsx` and synchronized with `localStorage`.
* When moving forward to Step 2 and clicking `← Back: Patient Information`, **all entered form fields remain intact** (Full Name, Age, Gender, Phone, ABHA ID, Department, Consent).
* Navigating between Step 2, Step 3, and Step 4 preserves conversational messages, SOCRATES entities, and uploaded files.

---

## 🔍 Detailed Patient Step Breakdown

### Step 0 — Dynamic Doctor Selection
* Immediately following token registration/lookup, patients choose from active registered physicians (`GET /api/doctors`).
* Doctor cards display name, medical specialization (*Cardiology*, *General Medicine / OPD*, *Emergency & Triage*), and availability status.
* Saves `assigned_doctor_id`, `assigned_doctor_name`, and `assigned_doctor_specialty` directly with the OPD instance.

### Step 1 — Identity & Digital Informed Consent
* Patient demographics (Full Name, Age, Gender, Mobile Phone, ABHA ID).
* Clinic Department selection: **General Medicine (Allopathy)** vs. **AYUSH Clinic**.
* Plain-language informed consent statement agreeing to AI-assisted pre-consultation intake.

### Step 2 — Conversational Clinical Interview & Multi-State Voice
* Ultra-fast AI interview engine powered by Google GenAI (response latency ~1.6s).
* Multi-turn clinical interview guided by the **SOCRATES** framework (Site, Onset, Character, Radiation, Associations, Time course, Exacerbating/Relieving, Severity).
* **Emergency Red-Flag Detection**: Flags cardiac chest pain, stroke signs, acute respiratory distress, or sepsis with triage warning banners.
* **Suggested Quick Chips**: Context-aware response chips for fast touchscreen interaction.
* **Multi-State Voice Engine**:
  ```text
  Tap to speak (🎙️) → Listening (🔴 Live waveform preview) → Processing (⏳) → Message added (✓)
  ```
  * Dual-language speech recognition supporting **English (`en-IN`)** and **Hindi (`hi-IN`)**.
  * Live interim transcript preview with dedicated `Done Speaking ✓` button.
  * Browser permission and capability error handling.

### Step 3 — Past Medical Records & Multi-Modal OCR (Optional)
* Drag-and-drop file upload and camera capture for prior prescriptions, lab reports, discharge summaries, and scans.
* Multi-modal OCR extracts active medications (name, dosage, frequency), clinical diagnoses, and lab test values.
* Highlights **Abnormal Lab Results** with prominent visual flags (HIGH / LOW).

### Step 4 — Final Review & ATM Queue Token
* Structured review displaying patient demographics, attending physician, symptom summary, and attached documents.
* Submitting check-in locks the intake packet, submits it to the selected physician's ongoing queue, and prints an ATM-style queue ticket (e.g. `MK-1024`).

---

## 📱 Mobile-Specific Experience & Mobile Chatbot

The application is engineered for mobile screens (≤ 768px) rather than simply scaling down the desktop view:

* **Mobile Chat Interface**:
  * Chat input bar is sticky-pinned to the bottom of the viewport above safe-area insets (`env(safe-area-inset-bottom)`).
  * Chat stream utilizes smooth touch momentum scrolling (`-webkit-overflow-scrolling: touch`) and flexes to fill available vertical space.
  * Off-canvas symptom summary drawer toggled via `📋 View Symptom Summary` to prevent compressing the chat messages on small displays.
* **Touch Target Optimization**:
  * Minimum 48px touch targets on all buttons, form fields, and navigation triggers.
  * Minimum 16px font size on inputs to eliminate iOS Safari viewport auto-zooming.
* **Zero Horizontal Overflow**:
  * Body and container shells enforce `overflow-x: hidden` and `max-width: 100vw`.
* **Mobile Doctor Selection**:
  * Doctor selection cards format as clean, full-width touch cards in a single column.

---

## 🩺 Physician Console Features

The Doctor Dashboard organizes clinical workflows around the outpatient lifecycle:

### Real-Time Metrics Banner
* **Total OPD Today**: Total patient volume registered across the clinic.
* **Ongoing Queue**: Active submitted check-ins awaiting physician review and verification.
* **In Examination**: Patients currently undergoing physical consultation.
* **Priority / Triage**: Count of urgent red-flag alerts requiring immediate care.
* **Completed**: Verified and finalized patient consultations.

### Ongoing vs. Completed OPD Queues
1. **Ongoing Queue**: Active consultation queue. The doctor reviews the intake packet, refines diagnosis, prescribes medications, and verifies the record.
2. **Completed Queue**: Read-only historical consultation records sealed with a `🔒 Consultation finalized & verified` banner, preserving finalized prescriptions, diagnosis, and notes.

### Concise Primary Summaries
Replaces raw multi-turn chat transcripts with high-yield clinical overviews:
1. **Current Query Summary**: Chief complaint, onset, pain level, location, and presenting symptoms.
2. **Longitudinal History Summary**: Multi-visit history linked to patient Token ID, prior diagnoses, and cumulative medications.
3. **Uploaded Documents Summary**: Abnormal lab flags (highlighted in red/amber) and extracted prescriptions.
4. **Collapsible Chat Accordion**: Full multi-turn transcript accessible on demand (`▸ View Current Conversation`).

### Interactive Prescription Composer
Multi-row medication table allowing physicians to add, remove, and edit:
* **Medicine Name** (e.g., *Amoxicillin 500mg*)
* **Dosage** (e.g., *1 tablet*)
* **Frequency** (e.g., *TDS (3 times/day)*)
* **Duration** (e.g., *5 days*)

### Interoperability & Mock Health Records
* **ABDM FHIR R4 Bundle Export**: Generates validated HL7 FHIR R4 JSON compositions compliant with India's National Digital Health Mission (NDHM).
* **Mock Sync**: Simulates hospital EMR/HIS record synchronization and ABHA health locker linking upon doctor verification.

---

## ⚡ Global Loading State Standard

Every button triggering an asynchronous backend request implements a universal loading pattern:
* Instantly disabled on click to prevent duplicate submissions.
* Displays a compact `.btn-spinner` and dynamic state label:
  * `Checking Token...` / `Generating Patient Token...`
  * `Assigning Doctor...`
  * `Starting Intake...`
  * `Processing...` / `Converting speech to text...`
  * `Processing Document...`
  * `Submitting Check-In...`
  * `Signing In...` / `Creating Doctor Account...`
  * `Saving Profile...`
  * `Verifying Consultation...`
* Automatically restores upon request resolution with clear error reporting and retry availability.

---

## 💻 Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | React 18, Vite | Reactive single-page application |
| **Styling** | Vanilla CSS Design System | High-contrast Bank/ATM kiosk styling, touch tokens, mobile media queries |
| **Typography** | Google Fonts (Inter, Plus Jakarta Sans) | Institutional legibility across kiosks, tablets, and mobile phones |
| **Backend API** | FastAPI (Python 3.10+) | Asynchronous REST API with RBAC headers (`X-User-Role`, `X-User-Id`) |
| **Database** | SQLite with `aiosqlite` | Async persistence for tokens, patients, doctors, OPD sessions, documents & audit logs |
| **AI / NLP Engine** | Google GenAI SDK (`gemini-2.5-flash`) | Clinical entity extraction (SOCRATES), OCR document extraction, and FHIR R4 bundling |
| **Doctor Auth** | Direct BCrypt & Supabase Google OAuth | Multi-provider physician authentication with role enforcement |
| **Interoperability** | HL7 FHIR R4 (ABDM / NDHM) | National health record standards compliance |

---

## 🗂️ Project Directory Structure

```text
medx_1/
├── backend/
│   ├── agent.py               # Google GenAI engine (SOCRATES, OCR, summaries, FHIR R4)
│   ├── database.py            # SQLite async schema, patient tokens, assigned doctor RBAC, CRUD & audit logs
│   ├── main.py                # FastAPI endpoints, RBAC dependencies & static file server
│   ├── requirements.txt       # Python dependencies (fastapi, uvicorn, google-genai, aiosqlite)
│   ├── .env                   # GOOGLE_API_KEY configuration
│   └── uploads/               # Storage directory for scanned medical documents
│
├── frontend/
│   ├── index.html             # HTML5 root with Google Inter font
│   ├── package.json           # Vite & React dependencies
│   ├── vite.config.js         # Vite configuration
│   ├── .env                   # Supabase credentials (VITE_SUPABASE_URL, ANON_KEY)
│   └── src/
│       ├── App.jsx            # Master app controller, view mode router & top-level state machine
│       ├── index.css          # Bank/ATM design system styles, mobile media queries & voice animations
│       ├── apiConfig.js       # Centralized backend API base URL
│       ├── supabaseClient.js  # Supabase client initialization
│       └── components/
│           ├── Auth.jsx                   # Role selection & doctor login
│           ├── DoctorSelectStep.jsx       # Dynamic doctor selection step
│           ├── DoctorProfileSetup.jsx     # First-login physician name & specialty setup
│           ├── PatientTokenEntry.jsx      # Token lookup, confirmation & generation
│           ├── KioskHeader.jsx            # Session header with token badge & stepper
│           ├── IdentityConsentStep.jsx    # Step 1: Demographics, department & informed consent
│           ├── ConversationalIntakeStep.jsx # Step 2: SOCRATES interview, multi-state voice & triage
│           ├── LiveVoiceOverlay.jsx       # Real-time speech overlay
│           ├── DocumentScannerStep.jsx    # Step 3: Document upload & multi-modal OCR
│           ├── KioskSummaryStep.jsx       # Step 4: Final packet review & ATM queue ticket
│           ├── PhysicianConsole.jsx       # Doctor dashboard, ongoing/completed queues & summary editor
│           └── FhirModal.jsx              # HL7 FHIR R4 Bundle JSON modal viewer
│
├── SUMMARY.md                 # Complete system documentation and architectural summary
└── README.md                  # Quickstart setup guide and architectural summary
```

---

## 📡 Complete API Endpoint Reference

### Patient & Token Endpoints
* `POST /api/patient/token-lookup` — Verify patient identity by token (Name, Age, Gender).
* `POST /api/patient/token-generate` — Generate a permanent, collision-resistant Token ID (e.g. `PT-9357-CH`).
* `POST /api/patient/token-mismatch` — Log privacy security alert if patient reports token does not match.

### Doctor Account & Directory Endpoints
* `GET /api/doctors` — Dynamically retrieve registered doctors for patient selection.
* `POST /api/doctors/register` — Register doctor account with email, password, name, and specialty.
* `POST /api/doctors/login` — Authenticate doctor with email and password.
* `POST /api/doctors/profile` — Complete doctor profile (name & specialty).
* `POST /api/doctors/sync-google` — Synchronize Supabase Google OAuth session with doctor records.

### Clinical Intake Endpoints
* `POST /api/intake/start` — Initialize intake session linked to patient token and assigned doctor ID.
* `GET /api/intake/{session_id}` — Retrieve session state for kiosk re-hydration.
* `POST /api/intake/chat` — Multi-turn conversational interview with SOCRATES entity extraction.
* `POST /api/intake/upload-document` — Multi-modal document upload with automated OCR and entity extraction.
* `POST /api/intake/submit` — Finalize kiosk intake and assign OPD queue ticket number.

### Physician Endpoints (Strict Doctor RBAC Required)
* `GET /api/physician/queue` — Retrieve live queue filtered strictly by authenticated doctor ID (`assigned_doctor_id == doctor["user_id"]`).
* `GET /api/physician/session/{session_id}` — Retrieve full intake packet (Rejects unassigned doctors with `403 Forbidden`).
* `GET /api/physician/patient-history/{token}` — Retrieve longitudinal medical history for patient token.
* `POST /api/physician/confirm` — Confirm diagnosis, prescriptions, and move session from Ongoing to Completed (`403 Forbidden` if unassigned).
* `POST /api/physician/update-status` — Update consultation status (`waiting` → `in_consultation` → `completed`).
* `GET /api/physician/fhir/{session_id}` — Export validated ABDM HL7 FHIR R4 Bundle.
