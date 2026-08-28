import React from 'react'

export default function KioskHeader({
  doctorUser,
  isDoctorMode,
  onOpenDoctorPortal,
  onSignOutDoctor,
  currentStep,
  language,
  onLanguageChange,
  redFlag
}) {
  const steps = [
    { id: 1, label: 'Identity & Consent' },
    { id: 2, label: 'Clinical Intake' },
    { id: 3, label: 'Medical Documents' },
    { id: 4, label: 'Review & Queue' }
  ]

  return (
    <header className="kiosk-header">
      <div className="header-top">
        <div className="brand-group">
          <div className="brand-logo">
            <h1>MediKiosk</h1>
            <span className="platform-tag">AI Clinical Intake & Triage Platform</span>
          </div>
          <div className="role-pill">
            <span className={`pill-badge ${isDoctorMode ? 'doctor' : 'patient'}`}>
              {isDoctorMode ? '🩺 Physician Console' : '🏥 Outpatient Kiosk'}
            </span>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="header-actions">
          {redFlag?.is_critical && !isDoctorMode && (
            <div className="emergency-alert-banner">
              ⚠️ HIGH PRIORITY TRIAGE FLAGGED
            </div>
          )}

          {/* Language Selector (Only for Patient Kiosk) */}
          {!isDoctorMode && (
            <select
              className="lang-select"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
            >
              <option value="en">English (EN)</option>
              <option value="hi">हिंदी (Hindi)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="mr">मराठी (Marathi)</option>
            </select>
          )}

          {/* Doctor Portal Entry or Sign Out */}
          {isDoctorMode && doctorUser ? (
            <div className="user-nav-badge">
              <span className="user-nav-email" title={doctorUser.email || doctorUser.name}>
                👨‍⚕️ {doctorUser.name || doctorUser.email}
              </span>
              <button
                type="button"
                className="btn-signout-kiosk"
                onClick={onSignOutDoctor}
                title="Sign out of doctor console"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-doctor-portal-entry"
              onClick={onOpenDoctorPortal}
              title="Restricted access for medical staff and physicians"
            >
              🩺 Doctor Portal 🔐
            </button>
          )}
        </div>
      </div>

      {/* Patient Stepper (Only in patient kiosk mode) */}
      {!isDoctorMode && (
        <div className="kiosk-stepper">
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
