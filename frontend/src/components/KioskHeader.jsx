import React from 'react'

export default function KioskHeader({
  doctorUser,
  isDoctorMode,
  onSignOutDoctor,
  onRestartKiosk,
  patient,
  patientToken,
  verifiedPatientData,
  session,
  currentStep,
  language,
  onLanguageChange,
  redFlag
}) {
  const steps = [
    { id: 1, label: 'Details' },
    { id: 2, label: 'Symptoms' },
    { id: 3, label: 'Records' },
    { id: 4, label: 'Confirmation' }
  ]

  const displayName = patient?.name || verifiedPatientData?.name || ''
  const displayToken = patientToken || session?.patient_token || verifiedPatientData?.token || ''
  const age = patient?.age || verifiedPatientData?.age
  const gender = patient?.gender || verifiedPatientData?.gender
  const demographicsText = age && gender ? `${age} yrs • ${gender}` : age ? `${age} yrs` : gender || ''
  const dept = session?.department || verifiedPatientData?.department
  const deptText = dept === 'ayush' ? 'AYUSH Clinic' : dept === 'allopathic' ? 'General OPD' : ''

  const showPatientBar = !isDoctorMode && (displayName || displayToken)

  return (
    <header className="kiosk-header">
      <div className="header-top">
        <div className="brand-group">
          <div className="brand-logo">
            <h1>MediKiosk</h1>
            <span className="platform-tag">
              {isDoctorMode ? 'Physician Review Console' : 'Hospital Check-In Kiosk'}
            </span>
          </div>
          <div className="role-pill">
            <span className={`pill-badge ${isDoctorMode ? 'doctor' : 'patient'}`}>
              {isDoctorMode ? 'Physician Console' : 'Patient Check-In'}
            </span>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="header-actions">
          {redFlag?.is_critical && !isDoctorMode && (
            <div className="emergency-alert-banner">
              Urgent Attention Required
            </div>
          )}

          {/* Language Selector (Only for Patient Kiosk) */}
          {!isDoctorMode && (
            <div className="lang-select-wrapper">
              <label htmlFor="kiosk-lang-select" className="sr-only">Select Language</label>
              <select
                id="kiosk-lang-select"
                className="lang-select"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="bn">বাংলা (Bengali)</option>
                <option value="te">తెలుగు (Telugu)</option>
                <option value="ta">தமிழ் (Tamil)</option>
                <option value="mr">मराठी (Marathi)</option>
              </select>
            </div>
          )}

          {/* Doctor Sign Out (ONLY displayed in Doctor Console) */}
          {isDoctorMode && doctorUser && (
            <div className="user-nav-badge">
              <span className="user-nav-email" title={doctorUser.email || doctorUser.name}>
                {doctorUser.name || doctorUser.email}
              </span>
              <button
                type="button"
                className="btn-signout-kiosk"
                onClick={onSignOutDoctor}
                title="Sign out"
              >
                Sign Out
              </button>
            </div>
          )}
          {/* Note: Completely removed Doctor Portal button on patient page */}
        </div>
      </div>

      {/* Patient Details Bar (ATM style active session bar) */}
      {showPatientBar && (
        <div className="kiosk-patient-banner">
          <div className="patient-banner-left">
            <div className="patient-banner-item patient-banner-name">
              <span className="banner-item-label">Patient</span>
              <strong className="banner-item-value">{displayName || 'Check-In In Progress'}</strong>
            </div>
            {displayToken && (
              <div className="patient-banner-item">
                <span className="banner-item-label">Token ID</span>
                <span className="banner-item-value banner-token-badge">{displayToken}</span>
              </div>
            )}
            {demographicsText && (
              <div className="patient-banner-item">
                <span className="banner-item-label">Details</span>
                <span className="banner-item-value">{demographicsText}</span>
              </div>
            )}
            {deptText && (
              <div className="patient-banner-item">
                <span className="banner-item-label">Clinic</span>
                <span className="banner-item-value">{deptText}</span>
              </div>
            )}
          </div>
          {onRestartKiosk && (
            <div className="patient-banner-right">
              <button
                type="button"
                className="btn-exit-kiosk"
                onClick={() => {
                  if (window.confirm('End this check-in session and return to start?')) {
                    onRestartKiosk()
                  }
                }}
                title="End current session"
              >
                ✕ End Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* Patient Stepper (Only in patient kiosk mode) */}
      {!isDoctorMode && (
        <div className="kiosk-stepper" role="navigation" aria-label="Check-in progress">
          {steps.map((s, idx) => (
            <div
              key={s.id}
              className={`step-item ${currentStep === s.id ? 'active' : ''} ${currentStep > s.id ? 'completed' : ''}`}
            >
              <div className="step-circle">
                {currentStep > s.id ? '✓' : s.id}
              </div>
              <span className="step-label">{s.label}</span>
              {idx < steps.length - 1 && <div className="step-divider" />}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
