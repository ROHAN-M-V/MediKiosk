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

## 5. Physician Console (Doctor Portal)

* **OPD Waiting Queue**: Real-time list of checked-in patients categorized by department, waiting time, and urgency (`URGENT TRIAGE`, `PRIORITY`, `RETURNING`).
* **Patient Packet Header**: Clear identity badges with Patient ID, queue ticket number, demographics, ABHA link status, and department.
* **Clinical Summary Draft**: AI-compiled clinical summary with editable fields for the attending physician to modify and finalize.
* **Physician Disposition & Notes**: Quick input for clinical notes and prescriptions with instant mock HIS & ABDM synchronization.
* **Longitudinal Patient History**: Automatically matches returning patient tokens to previous visit records, medication history, and past notes.
* **FHIR R4 Validation**: Integrated FHIR R4 composition export and modal viewer.

---

## 6. Technical Stack

* **Frontend**: React 18, Vite, Vanilla CSS Design System with custom design tokens, Google Fonts (`Inter` & `Plus Jakarta Sans`).
* **Backend**: FastAPI (Python 3.10+), Google Gemini multi-modal AI APIs.
* **Authentication**: Supabase Auth (Google OAuth & Email/Password) with offline local staff fallback.
* **State & Persistence**: Browser LocalStorage session preservation across refreshes.
