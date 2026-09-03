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

---

## 5. Doctor Selection & Patient Intake Flow

```
[Main Entry]
     │
     ▼
[Patient Token Entry] ──(New / Returning)──► [Doctor Selection Step]
                                                      │
                                                      ▼
                                              [Step 1: Patient Information]
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

### Dynamic Doctor Selection Step
* Immediately after receiving or verifying a token, patients are presented with a dedicated **"Select Your Attending Doctor"** screen.
* Available doctors are dynamically populated from active hospital doctor accounts (`GET /api/doctors`).
* Doctor cards display the physician's full name, medical field/specialization, and OPD availability.
* The selected doctor is saved against the patient's token and intake session (`assigned_doctor_id`, `assigned_doctor_name`, `assigned_doctor_specialty`).
* Displayed clearly in Step 1 (Attending Doctor banner), Step 4 review table, and on the ATM queue ticket receipt.

---

## 6. Doctor Authentication & Profile Setup

### Direct Authentication (Zero Email Verification Required)
* Doctors can sign up and log in immediately without opening an external email inbox or clicking verification links.
* **Direct Signup & Login**: Handled via backend endpoints `POST /api/doctors/register` and `POST /api/doctors/login` with BCrypt password hashing.
* **Google OAuth**: Supported with automatic backend sync via `POST /api/doctors/sync-google`.
* Protected endpoints enforce role-based access control (`X-User-Role: doctor`).

### First-Time Doctor Profile Setup
* When a newly registered doctor logs in for the first time, a clean profile setup screen is presented if `profile_completed` is `false`.
* Collects:
  * **Doctor's Full Name** (e.g., `Dr. Rohan Vernekar`)
  * **Field / Specialization** (e.g., `Cardiology`, `General Medicine / OPD`, `Pediatrics`)
* Profile is committed to the database via `POST /api/doctors/profile` and `profile_completed` is marked `true`.
* Subsequent logins bypass this screen and navigate directly into the Physician Review Console.

---

## 7. Doctor Dashboard & OPD Management System

The **Physician Console** has been upgraded into a modern, professional, bank/healthcare-kiosk-styled dashboard tailored for fast, clear outpatient workflow management:

### At-a-Glance Dashboard Metrics Banner
Positioned persistently across the top of the dashboard, displaying real-time OPD workload counts:
* **Total OPD Today**: Total patient volume registered today across all clinics.
* **Ongoing Queue**: Count of submitted OPD forms currently awaiting doctor review and verification.
* **In Examination**: Patients actively undergoing physical examination/consultation with the attending physician.
* **Priority / Triage**: Count of urgent emergency-triage alerts requiring immediate priority care.
* **Completed**: Consultations verified, locked, and finalized by the physician.

### Two-Section OPD Navigation (Ongoing vs. Completed)
The left navigation sidebar is divided into two distinct sections via a segmented toggle bar based on the clinical verification lifecycle:
1. **Ongoing**:
   * Shows patients who have submitted their OPD forms at the kiosk but have not yet been verified.
   * Cards display Ticket Number, Patient Name, Permanent Token ID, Submission Timestamp, and status pills.
2. **Completed**:
   * Shows OPD instances that have already been verified by the doctor.
   * Sealed in **strict read-only format** with `🔒 Consultation finalized & verified` banner.

### 3 Concise Primary Summaries (Replaced Raw Chat View)
The primary packet view for attending doctors presents 3 high-priority clinical summaries:
1. **Current Query Summary (Most Prominent)**:
   * AI clinical summary of chief complaint, onset, pain/severity, location, timing, and associated symptoms.
   * Clear tag showing assigned doctor and department.
2. **Patient History Summary**:
   * Longitudinal background: chronic conditions, active medications, known drug allergies (NKDA), and count of prior visits.
3. **Uploaded Documents Summary**:
   * Document count, abnormal lab flags highlighted in amber, and extracted medications.

### Secondary Expandable Chat History
* The raw conversational interview is no longer the primary view.
* Structured as a collapsible accordion: **`▸ View Current Conversation ({N} messages)`**.
* Defaulted to collapsed; smoothly toggles open for deep audit when needed.

---

## 8. Global Loading State Standard

To prevent duplicate requests and provide clear tactile feedback:
* Every button triggering a backend operation disables immediately upon click.
* Displays a compact, professional `.btn-spinner` and dynamic loading label:
  * `Checking Token...` / `Generating Patient Token...`
  * `Assigning Doctor...`
  * `Starting Intake Session...`
  * `Processing...`
  * `Submitting Check-In...`
  * `Signing In...` / `Creating Doctor Account...`
  * `Saving Profile...`
  * `Verifying Consultation...`
  * `Loading FHIR...`
* Buttons re-enable automatically upon request resolution, with proper error handling and retry support.

---

## 9. Backend API Endpoints

* `GET /api/doctors`: Retrieves active doctors for patient selection.
* `POST /api/doctors/register`: Registers a doctor with email, password, name, and specialty without email verification.
* `POST /api/doctors/login`: Authenticates doctor with email and password.
* `POST /api/doctors/profile`: Updates doctor profile (name & specialty) after first login.
* `POST /api/doctors/sync-google`: Syncs doctor Google OAuth session with backend doctors table.
* `POST /api/intake/start`: Initializes intake session with assigned doctor metadata.
* `GET /api/physician/queue`: Retrieves all OPD intake sessions with department and urgency filters.
* `GET /api/physician/session/{id}`: Returns full session packet including 3 synthesized concise summaries.
* `POST /api/physician/confirm`: Verifies diagnosis, prescriptions, and moves session from Ongoing to Completed.
* `GET /api/physician/fhir/{id}`: Exports clinical intake bundle into compliant FHIR R4 JSON.

---

## 10. Technical Stack

* **Frontend**: React 18, Vite, Vanilla CSS Design System with custom design tokens, Google Fonts (`Inter` & `Plus Jakarta Sans`).
* **Backend**: FastAPI (Python 3.10+), SQLite Database with JSON serialization, Google Gemini multi-modal AI APIs.
* **Authentication**: Direct Email/Password authentication & Supabase Google OAuth with role verification (`require_doctor_role`).
* **State & Persistence**: Browser LocalStorage session preservation across refreshes with real-time optimistic UI updates.


