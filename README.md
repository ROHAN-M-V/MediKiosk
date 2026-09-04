the website is live at https://frontend-delta-ecru.vercel.app/ 


  # MediKiosk — System & Architecture Summary

  **MediKiosk** is a clinical-grade outpatient check-in, pre-consultation, and triage platform designed for hospitals and clinics. Built with a **Bank/ATM kiosk design philosophy** and clean modern aesthetics, it delivers a structured, trustworthy touchscreen experience for walk-in patients while compiling validated clinical intake packets and longitudinal summaries for attending physicians.

  ---

  ## 1. Design Direction: Bank/ATM Kiosk Experience

  The MediKiosk interface is designed around the familiar, accessible clarity of an ATM or self-service banking terminal:

  * **High-Contrast, Institutional Color Palette**:
    * **Header**: Deep hospital slate-navy (`#0f2438` / `#132238`) projecting security and clinical authority.
    * **Surfaces**: Crisp white card containers (`#ffffff`) with solid slate borders (`#cbd5e1`) and clean neutral background (`#f4f6f9`).
    * **Primary Buttons**: Large, high-contrast navy touch targets (`#0f3a63`) with bold white text (minimum 48px height) optimized for touchscreen taps.
  * **Readable, Professional Typography**:
    * Clean sans-serif typography utilizing Google Fonts **Inter** and **Plus Jakarta Sans** with high legibility across all patient age groups.
  * **Plain, Reassuring Language**:
    * Clinical SOCRATES entities presented in plain human terms (*Main Concern, Location, When it started, How it feels, Other symptoms, Timing, Pain level*).
    * Clear, non-intimidating informed consent language.
  * **Zero Visual Clutter**:
    * Distracting animations and floating effects removed in favor of clean, immediate micro-transitions and reliable status indicators.
  * **ATM Receipt-Style Queue Slip**:
    * Successful submission produces a printable ATM-style queue ticket displaying the patient's token ID, assigned queue number (e.g. `MK-1024`), assigned attending physician, and estimated wait time.

  ---

  ## 2. Complete Separation of Patient & Doctor Portals

  To prevent kiosk confusion and maintain strict outpatient security:

  * **Zero Doctor Login on Patient Screens**:
    * The patient check-in interface is completely isolated from doctor controls.
  * **Role Selection**:
    * Initial entry screen cleanly divides between **Patient Check-In** and **Physician Portal**.
  * **Doctor Authentication & RBAC**:
    * Doctors authenticate securely via **Direct Email/Password** or **Google OAuth** (Supabase).
    * Protected by FastAPI backend dependencies (`require_doctor_role`). Unauthenticated or non-doctor requests receive `403 Forbidden`.

  ---

  ## 3. Strict Doctor-Patient Access Control (Backend & Database Level)

  Security is enforced at the database and authorization level, **not merely by hiding items on the frontend**:

  ### Authorization Model: `Authenticated Doctor → Own Doctor ID → Assigned OPD Records Only`

  ```
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
    Accesses /session/{id} -> 200 OK      Accesses /session/{id} -> 403 Forbidden!
  ```

  ### Key Security Safeguards
  1. **Queue Isolation**:
    In `backend/database.py`, `list_physician_queue` strictly filters:
    ```sql
    WHERE s.assigned_doctor_id = ?
    ```
  2. **Tamper-Proof API Enforcement**:
    In `backend/main.py`, every clinical session endpoint validates that `session["assigned_doctor_id"] == doctor["user_id"]`:
    - `GET /api/physician/session/{session_id}` $\rightarrow$ Returns `403 Forbidden` if Doctor B attempts to view Doctor A's patient.
    - `POST /api/physician/confirm` $\rightarrow$ Rejects unassigned doctors attempting to finalize or verify consultations.
    - `POST /api/physician/update-status` $\rightarrow$ Rejects status tampering.
    - `GET /api/physician/fhir/{session_id}` $\rightarrow$ Rejects unauthorized FHIR R4 medical exports.
    - `GET /api/physician/patient-history/{token}` $\rightarrow$ Verifies the requesting doctor has at least one active or historical session with the patient token.

  ---

  ## 4. Patient 4-Step Check-In Flow with Symmetrical Back / Next Navigation

  The patient workflow follows a consistent, reversible 4-step sequence:

  ```
  [Main Entry]
      │
      ▼
  [Patient Token Entry] ──(New / Returning)──► [Dynamic Doctor Selection]
                                                          │
                                                          ▼
                                                  [Step 1: Patient Information]
                                                          ▲ ▼
                                                  [Step 2: Symptoms & Query Chat]
                                                          ▲ ▼
                                                  [Step 3: Past Medical Records]
                                                          ▲ ▼
                                                  [Step 4: Confirmation & Submit]
                                                          │
                                                          ▼
                                                  [ATM Queue Ticket Receipt]
  ```

  ### Symmetrical Navigation Bar Across All Steps
  Old section-specific buttons (`Continue to Questions`, `Continue to Document Upload`, `Skip to Confirmation`) have been replaced with a unified navigation bar:

  | Step | Back Button | Forward / Action Button | Notes |
  | :--- | :--- | :--- | :--- |
  | **Step 1: Patient Information** | `[ ← Back: Select Doctor ]` | `[ Next: Symptoms & Query → ]` | Validates required Name, Age, and Consent before proceeding. |
  | **Step 2: Symptoms & Query** | `[ ← Back: Patient Information ]` | `[ Next: Medical Records → ]` | Retains full chat history and symptom summary. |
  | **Step 3: Past Medical Records** | `[ ← Back: Symptoms & Query ]` | `[ Next: Review & Submit → ]` | Upload is optional; retains uploaded document records. |
  | **Step 4: Confirmation** | `[ ← Back: Medical Records ]` | `[ ✓ Submit Check-In ]` | Submits check-in and transitions to official queue ticket. |

  ### Zero Data Loss on Back Navigation
  * `patientFormData` is managed in top-level state in `App.jsx` and continuously synchronized with `localStorage`.
  * Navigating forward to Step 2 and clicking `← Back: Patient Information` **keeps all entered fields intact** (Full Name, Age, Gender, Phone, ABHA ID, Department, Consent).
  * Navigating between Step 2 and Step 3 preserves the live conversation and extracted medical entities.

  ---

  ## 5. Dynamic Doctor Selection & Profile Setup

  ### Dynamic Doctor Accounts
  * Doctors register dynamically via **Email/Password** (`POST /api/doctors/register`) or **Google OAuth** (`POST /api/doctors/sync-google`). No manual email verification links required.
  * First-time doctors complete their profile with **Full Name** and **Field/Specialization** (`POST /api/doctors/profile`).

  ### Patient Doctor Selection
  * Immediately following token verification or generation, patients select from active registered hospital physicians (`GET /api/doctors`).
  * Displays:
    * `Dr. [Name]`
    * `[Field / Specialization]` (e.g. *Cardiology*, *General Medicine / OPD*, *Emergency & Triage*)
    * Availability badge (`● Available for OPD`).
  * The selected doctor's unique user ID (`assigned_doctor_id`) is permanently attached to the intake session.

  ---

  ## 6. Multi-State Voice Model & Touch UX

  The voice interaction has been upgraded from a basic toggle into a dependable, multi-state speech engine:

  ### Voice State Machine
  $$\text{idle} \longrightarrow \text{listening} \longrightarrow \text{processing} \longrightarrow \text{success} \longrightarrow \text{idle}$$

  * **`idle`**: Displays `🎙️ Speak`.
  * **`listening`**:
    * Button transforms to `🔴 Stop`.
    * Renders active status banner with pulsing waveform indicator and real-time interim speech preview.
    * Provides a dedicated `Done Speaking ✓` button.
  * **`processing`**: Displays `⏳ Converting speech to text...` with `.btn-spinner`.
  * **`success`**: Displays `✓ Message added to input box!` and smoothly populates the text area.
  * **`error`**: Displays friendly fallback notification if microphone permission was denied or speech recognition is unsupported.
  * **Dual-Language Support**: Automatically configures recognition for **English (`en-IN`)** or **Hindi (`hi-IN`)** based on session language.

  ---

  ## 7. Mobile-Specific Experience & Mobile Chatbot

  The entire application is optimized for mobile screens ($\le 768\text{px}$) with an intentionally responsive architecture:

  * **Mobile Chat Interface**:
    * Chat input bar is sticky-pinned to the bottom of the viewport above safe-area insets (`env(safe-area-inset-bottom)`).
    * Chat stream uses smooth touch momentum scrolling (`-webkit-overflow-scrolling: touch`) and flexes to fill available vertical space.
    * Off-canvas symptom summary drawer toggled via `📋 View Symptom Summary` so the summary never squashes the conversation on small screens.
  * **Touch Target Optimization**:
    * Minimum 48px touch targets on all buttons, selectors, and navigation triggers.
    * Minimum 16px font size on inputs to prevent iOS Safari auto-zooming.
  * **Zero Horizontal Overflow**:
    * Body and container shells enforce `overflow-x: hidden` and `max-width: 100vw`.
  * **Mobile Doctor Selection**:
    * Doctor selection cards format as clean, full-width touch cards in a single column.

  ---

  ## 8. Doctor Dashboard: Ongoing vs. Completed OPD System

  The **Physician Console** organizes clinical workload around the outpatient lifecycle:

  ### Workload Metrics Banner
  * **Total OPD Today**: Total patient check-ins across the hospital.
  * **Ongoing Queue**: Active patients awaiting doctor consultation and verification.
  * **In Examination**: Patients actively being consulted.
  * **Priority / Triage**: Count of urgent red-flag alerts.
  * **Completed**: Verified and finalized patient consultations.

  ### Ongoing vs. Completed Queues
  1. **Ongoing Queue**:
    * Active consultation queue.
    * Doctor opens packet, reviews AI summaries, edits diagnosis, uses the **interactive prescription composer** (Medication Name, Dosage, Frequency, Duration), and finalizes the visit.
  2. **Completed Queue**:
    * Read-only archive of verified visits with `🔒 Consultation finalized & verified` banner.
    * Preserves doctor notes, finalized prescription table, diagnosis, and audit timestamps.
    * Prevents accidental re-verification.

  ### 3 Concise Clinical Summaries
  Replaces raw chat logs with high-yield clinical overviews:
  1. **Current Query Summary**: Chief complaint, onset, pain level, location, and symptoms.
  2. **Longitudinal History Summary**: Multi-visit history linked to patient Token ID, prior diagnoses, and cumulative medications.
  3. **Uploaded Documents Summary**: Abnormal lab flags (highlighted in red/amber) and extracted prescriptions.
  4. **Collapsible Chat**: Raw multi-turn transcript accessible via expandable accordion (`▸ View Current Conversation`).

  ---

  ## 9. Global Loading State Standard

  Every button triggering an asynchronous backend request adheres to a universal loading pattern:
  * Instantly disabled on click to prevent duplicate submissions.
  * Displays a `.btn-spinner` and dynamic state label:
    * `Checking Token...` / `Generating Patient Token...`
    * `Assigning Doctor...`
    * `Starting Intake...`
    * `Processing...` / `Converting speech to text...`
    * `Processing Document...`
    * `Submitting Check-In...`
    * `Signing In...` / `Creating Doctor Account...`
    * `Saving Profile...`
    * `Verifying Consultation...`
  * Automatically re-enables on completion with error alerting and retry availability.

  ---

  ## 10. Technology Stack

  | Layer | Technology | Purpose |
  | :--- | :--- | :--- |
  | **Frontend UI** | React 18, Vite | Reactive single-page application |
  | **Styling** | Vanilla CSS Design System | High-contrast Bank/ATM kiosk styling, touch tokens, mobile media queries |
  | **Typography** | Google Fonts (Inter, Plus Jakarta Sans) | Institutional legibility across kiosks and mobile devices |
  | **Backend API** | FastAPI (Python 3.10+) | Asynchronous REST API with RBAC headers (`X-User-Role`, `X-User-Id`) |
  | **Database** | SQLite with `aiosqlite` | Async persistence for tokens, patients, doctors, OPD sessions, docs & audit logs |
  | **AI / NLP Engine** | Google GenAI SDK (`gemini-2.5-flash`) | Clinical entity extraction (SOCRATES), OCR document extraction, and FHIR R4 bundling |
  | **Doctor Auth** | Direct BCrypt & Supabase Google OAuth | Multi-provider physician authentication with role enforcement |
  | **Interoperability** | HL7 FHIR R4 (ABDM / NDHM) | National health record standards compliance |

  ---

  ## 11. Complete API Endpoint Reference

  ### Patient & Token Endpoints
  * `POST /api/patient/token-lookup`: Verify patient identity by token (Name, Age, Gender).
  * `POST /api/patient/token-generate`: Generate a permanent, collision-resistant Token ID (e.g. `PT-9357-CH`).
  * `POST /api/patient/token-mismatch`: Log privacy security alert if patient reports token does not match.

  ### Doctor Account & Directory Endpoints
  * `GET /api/doctors`: Dynamically retrieve registered doctors for patient selection.
  * `POST /api/doctors/register`: Register doctor account with email, password, name, and specialty.
  * `POST /api/doctors/login`: Authenticate doctor with email and password.
  * `POST /api/doctors/profile`: Complete doctor profile (name & specialty).
  * `POST /api/doctors/sync-google`: Synchronize Supabase Google OAuth session with doctor records.

  ### Clinical Intake Endpoints
  * `POST /api/intake/start`: Initialize intake session linked to patient token and assigned doctor ID.
  * `GET /api/intake/{session_id}`: Retrieve session state for kiosk re-hydration.
  * `POST /api/intake/chat`: Multi-turn conversational interview with SOCRATES entity extraction.
  * `POST /api/intake/upload-document`: Multi-modal document upload with automated OCR and entity extraction.
  * `POST /api/intake/submit`: Finalize kiosk intake and assign OPD queue ticket number.

  ### Physician Endpoints (Strict Doctor RBAC Required)
  * `GET /api/physician/queue`: Retrieve live queue filtered strictly by authenticated doctor ID (`assigned_doctor_id == doctor["user_id"]`).
  * `GET /api/physician/session/{session_id}`: Retrieve full intake packet (Rejects unassigned doctors with `403 Forbidden`).
  * `GET /api/physician/patient-history/{token}`: Retrieve longitudinal medical history for patient token.
  * `POST /api/physician/confirm`: Confirm diagnosis, prescriptions, and move session from Ongoing to Completed (`403 Forbidden` if unassigned).
  * `POST /api/physician/update-status`: Update consultation status (`waiting` $\rightarrow$ `in_consultation` $\rightarrow$ `completed`).
  * `GET /api/physician/fhir/{session_id}`: Export validated ABDM HL7 FHIR R4 Bundle.


