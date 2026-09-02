# MediKiosk — System & Architecture Summary

**MediKiosk** is an intelligent outpatient check-in, clinical pre-consultation, and triage kiosk designed for hospitals and clinics. Built with a **Bank/ATM kiosk design philosophy**, it delivers a structured, trustworthy, and accessible touchscreen experience that streamlines outpatient department (OPD) check-in for patients while compiling structured clinical intake packets for attending physicians.

---

## 1. Design Direction: Bank/ATM Kiosk Experience

The MediKiosk interface is designed around the familiarity and clarity of an ATM or self-service banking kiosk:

* **High-Contrast, Institutional Color Palette**:
  * **Header**: Deep hospital slate-navy (`#0f2438` / `#132238`) projecting security and trust.
  * **Surfaces**: Crisp white card containers (`#ffffff`) with solid slate borders (`#cbd5e1`) and clean neutral background (`#f4f6f9`).
  * **Primary Buttons**: Large, high-contrast navy touch targets (`#0f3a63`) with bold white text (minimum 48px height) optimized for kiosk touchscreens.
* **Readable, Professional Typography**:
  * Clean sans-serif typography utilizing Google Fonts **Inter** and **Plus Jakarta Sans** with generous line-heights and high legibility for all patient age groups.
* **Minimal & Human-Friendly Language**:
  * Elimination of technical and clinical acronyms (e.g., SOCRATES breakdown converted into plain English: *Main Concern, Location, When it started, How it feels, Other symptoms, Timing, Pain level*).
  * Simplified, reassuring consent language without dense legal jargon.
* **Subtle, Functional Interactions**:
  * All flashy animations, pulsing halos, glowing drop-shadows, and floating effects have been stripped away in favor of clean, immediate micro-transitions.
* **Atm Receipt-Style Queue Slip**:
  * Final check-in screen generates a clean, printable ATM receipt-style ticket displaying the patient's queue number (e.g. `MK-1466`), clinic department, and estimated wait time.

---

## 2. Complete Separation of Patient & Doctor Portals

To maintain strict outpatient security and prevent kiosk confusion:

* **Zero Doctor Login on Patient Screens**:
  * The `Doctor Portal` button and doctor credentials have been **completely removed** from all patient check-in screens, headers, and navigation bars.
  * Patients only interact with patient identification and check-in workflows.
* **Staff & Doctor Authentication**:
  * Medical staff and attending physicians access the **Physician Console** exclusively through the initial role selection screen or authorized hospital login.
  * Supports Google OAuth via Supabase with automatic offline staff fallback.

---

## 3. Top Patient Header Bar (Active Session)

Once a patient checks in or enters their token, an ATM-style session bar is rendered across the top of every screen:

| Component | Description |
| :--- | :--- |
| **Patient Name** | Displays the patient's full name (e.g., `Ramesh Kumar`) or `Check-In In Progress`. |
| **Token ID** | High-contrast token badge (e.g., `PT-9357-CH`) identifying the patient's permanent record. |
| **Demographics** | Clean age and gender indicator (e.g., `42 yrs • Male`). |
| **Clinic Department** | Active department (e.g., `General OPD` or `AYUSH Clinic`). |
| **End Session Action** | Tactile `✕ End Session` button with confirmation prompt to safely exit or restart. |

---

## 4. Patient 4-Step Check-In Flow

```
[Main Entry]
     │
     ▼
[Patient Token Entry] ──(New / Returning)──► [Step 1: Patient Information]
                                                     │
                                                     ▼
                                             [Step 2: Symptoms & Chat]
                                                     │
                                                     ▼
                                             [Step 3: Past Records (Optional)]
                                                     │
                                                     ▼
                                             [Step 4: Confirmation & Queue Ticket]
```

### Step 1: Patient Information & Consent
* Input fields for Full Name, Age, Gender, Mobile Phone, and optional ABHA Health ID.
* Clinic department selection: **General Medicine (Allopathy)** vs. **AYUSH Clinic**.
* Plain-English privacy statement and digital informed consent agreement.

### Step 2: Symptoms & Conversational Intake
* AI-guided conversational interview in **English** and **Hindi**.
* Supports both text typing and microphone voice input (Speech-to-Text / Gemini Live voice mode).
* Quick-answer suggestion chips for rapid touchscreen response.
* **Emergency Triage Alert**: Real-time detection of critical symptoms (e.g. acute coronary syndrome, severe trauma) triggering high-priority triage alerts.
* **Live Symptom Summary**: A human-friendly sidebar summarizing recorded symptoms for the physician.

### Step 3: Past Medical Records (Optional)
* Multi-modal document upload via file browser or camera photo capture.
* Supports prescriptions, blood/lab reports, discharge summaries, and imaging reports.
* Automatic entity extraction (medications, diagnoses, abnormal lab values).
* Clear option to skip if the patient has no documents to upload.

### Step 4: Confirmation & Queue Ticket
* Clean tabular summary of all verified patient demographics, presenting symptoms, and attached documents.
* Generates an official OPD Queue Token ticket (e.g., `MK-1466`) with priority status and instructions to wait for the display announcement.

---

## 5. Doctor Dashboard & OPD Management System

The **Physician Console** has been completely upgraded into a modern, professional, bank/healthcare-kiosk-styled dashboard tailored for fast, clear outpatient workflow management:

### At-a-Glance Dashboard Metrics Banner
Positioned persistently across the top of the dashboard, displaying real-time OPD workload counts:
* **Total OPD Today**: Total patient volume registered today across all clinics.
* **Ongoing Queue**: Count of submitted OPD forms currently awaiting doctor review and verification.
* **In Examination**: Patients actively undergoing physical examination/consultation with the attending physician.
* **Priority / Triage**: Count of urgent emergency-triage alerts requiring immediate priority care.
* **Completed**: Consultations verified, locked, and finalized by the physician.

### Two-Section OPD Navigation (Ongoing vs. Completed)
The left navigation sidebar is divided into two distinct sections via a segmented toggle bar based on the clinical verification lifecycle:
1. **Ongoing (`N`)**:
   * **Active Queue**: Shows patients who have **submitted their OPD forms** at the kiosk but have **not yet been verified by the doctor**.
   * **Useful Card Information**:
     * Patient Name
     * OPD Queue Ticket (`MK-XXXX`)
     * Permanent Patient Token ID (`PT-XXXX-YY`)
     * Demographics & Department (`Age`, `Gender`, `General OPD` / `AYUSH`)
     * **Submission Time**: e.g. `🕒 Submitted: 10:45 AM`
     * Status indicator: `⏳ AWAITING VERIFICATION`, `🩺 IN EXAMINATION`, `⚡ PRIORITY`.
   * **Examination & Review Workflow**:
     * Doctor can review the AI clinical intake summary (with optional draft editing).
     * Action "▶ Start Examination" transitions the patient to active consultation (`🩺 In Examination`).
     * Attending Physician Consultation form allows entering Working / Final Diagnosis, Prescriptions with dynamic `+ Add Medicine` table, Doctor Notes & Advice, and Recommended Follow-up.
     * High-visibility **"✓ Verify & Complete Consultation"** button validates details, synchronizes records, and **automatically moves the patient from Ongoing to Completed**.
2. **Completed (`M`)**:
   * **Read-Only Records & Medical History**: Shows OPD instances that have already been **verified by the doctor**.
   * **Strictly Read-Only Interface**:
     * Serves as a clinical summary and patient consultation history.
     * Displays `✓ Verified & Completed` status pill and verified timestamp with attending physician credentials.
     * **Verified Working / Final Diagnosis** presented in a clean, highlighted read-only box.
     * **Verified Prescriptions & Medications** displayed in a structured read-only table (Medicine Name, Dosage, Frequency, Duration) with no edit or delete buttons.
     * **Doctor Notes & Advice** and **Recommended Follow-up** rendered in clear read-only blocks.
     * Sealed with a **`🔒 Read-Only Record`** footer banner confirming that the record is locked in the hospital database and cannot be accidentally modified or re-verified.
* **Instant Search & Filter Bar**:
   * Real-time search across active queue by Patient Name, Token ID (`PT-...`), Queue Ticket (`MK-...`), or chief complaint.
   * Department filter pills: `All`, `General OPD`, `AYUSH Clinic`, and `Priority Triage`.
   * Clear contextual empty states with informative copy when all submissions are reviewed.

### The Key Workflow Lifecycle
```
Patient submits form at Kiosk → Ongoing Queue (Awaiting Verification) → Doctor reviews & starts exam → Doctor verifies consultation → Completed Queue (Read-Only Summary & Medical History)
```

### Longitudinal Patient History & FHIR Records
* **Returning Patient Detection**: Automatically links returning patient tokens with prior visit history, past prescriptions, prior abnormal lab tests, and previous physician notes.
* **FHIR R4 Composition**: Validates and previews FHIR R4 JSON bundles for ABDM interoperability.

### Full Mobile & Tablet Responsiveness
* Dedicated mobile view switcher (`📋 OPD Queue` / `🩺 Patient Details`) allowing seamless one-tap switching on phones and small tablets.
* Zero horizontal scrolling, touch-optimized card targets, and automatic collapsible tables.

---

## 6. Backend API Endpoints (Physician Management)

* `GET /api/physician/queue`: Retrieves all OPD intake sessions with patient info, department, urgency, and clinical packet summaries.
* `POST /api/physician/update-status`: Allows physician to update session status (`waiting`, `in_consultation`, `urgent_triage`, `completed`) with audit logging.
* `POST /api/physician/confirm`: Saves doctor disposition, working diagnosis, structured prescriptions, clinical advice, follow-up, and updates session status to `completed`.
* `POST /api/physician/export-fhir`: Exports clinical intake bundle into compliant FHIR R4 JSON.

---

## 7. Technical Stack

* **Frontend**: React 18, Vite, Vanilla CSS Design System with custom design tokens, Google Fonts (`Inter` & `Plus Jakarta Sans`).
* **Backend**: FastAPI (Python 3.10+), SQLite Database with JSON serialization, Google Gemini multi-modal AI APIs.
* **Authentication**: Supabase Auth (Google OAuth & Email/Password) with secure role verification (`require_doctor_role`) and offline local staff fallback.
* **State & Persistence**: Browser LocalStorage session preservation across refreshes with real-time optimistic UI updates.

