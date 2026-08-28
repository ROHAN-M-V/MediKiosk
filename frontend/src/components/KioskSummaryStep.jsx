import React, { useState } from 'react'

export default function KioskSummaryStep({
  session,
  patient,
  socratesHpi,
  documents,
  redFlag,
  onSubmitIntake,
  onRestartKiosk,
  isLoading
}) {
  const [isSubmitted, setIsSubmitted] = useState(
    session?.status === 'completed' || session?.status === 'urgent_triage' || session?.status === 'physician_reviewed'
  )

  function handleSubmit() {
    onSubmitIntake()
    setIsSubmitted(true)
  }

  const patientToken = session?.patient_token || patient?.patient_token

  if (isSubmitted) {
    return (
      <div className="kiosk-step-container">
        <div className="kiosk-card token-card">
          <div className="token-header">
            <div className="token-icon">✅</div>
            <h2>Clinical Intake Packet Submitted</h2>
            <p>Your history and scanned records have been compiled and sent to the attending physician.</p>
          </div>

          {/* Token Display Box */}
          <div className="queue-token-box">
            <div className="token-label">OPD Queue Token</div>
            <div className="token-number">{session?.queue_number || 'MK-1024'}</div>
            <div className="token-patient">{patient?.name} ({patient?.age} yrs • {patient?.gender})</div>
            {patientToken && (
              <div className="token-bound-sub">Permanent Patient ID: <strong>{patientToken}</strong></div>
            )}
            
            {redFlag?.is_critical && (
              <div className="emergency-token-badge">
                🚨 RED-FLAG TRIAGE: Emergency Priority Queue
              </div>
            )}
          </div>

          <div className="token-meta-grid">
            <div className="meta-card">
              <span className="meta-title">Department</span>
              <span className="meta-val">{session?.department?.toUpperCase() || 'ALLOPATHIC'}</span>
            </div>
            <div className="meta-card">
              <span className="meta-title">Documents Attached</span>
              <span className="meta-val">{documents?.length || 0} Records</span>
            </div>
            <div className="meta-card">
              <span className="meta-title">Estimated Wait</span>
              <span className="meta-val">{redFlag?.is_critical ? 'Immediate (Priority)' : '~10-15 mins'}</span>
            </div>
          </div>

          <div className="token-actions">
            <button
              type="button"
              className="btn-kiosk-primary"
              onClick={onRestartKiosk}
            >
              + Start Next Patient Intake
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="kiosk-step-container">
      <div className="kiosk-card wide">
        <div className="card-header">
          {patientToken && (
            <div className="token-bound-badge">
              <span className="bound-tag">PERMANENT PATIENT TOKEN</span>
              <strong className="bound-token">{patientToken}</strong>
            </div>
          )}
          <h2>Review Your Clinical Intake Packet</h2>
          <p className="card-subtitle">
            Please verify the information collected by MediKiosk before submitting to the doctor's queue.
          </p>
        </div>

        {redFlag?.is_critical && (
          <div className="red-flag-card">
            <div className="flag-icon">⚠️</div>
            <div className="flag-content">
              <h4>URGENT TRIAGE FLAGGED: {redFlag.severity}</h4>
              <p>{redFlag.reason}</p>
            </div>
          </div>
        )}

        <div className="review-grid">
          {/* Patient Details */}
          <div className="review-section">
            <h3>1. Patient Demographics</h3>
            <div className="review-table">
              <div><strong>Name:</strong> {patient?.name}</div>
              <div><strong>Age / Gender:</strong> {patient?.age} yrs / {patient?.gender}</div>
              <div><strong>Phone:</strong> {patient?.phone || 'N/A'}</div>
              <div><strong>Patient Token:</strong> {patientToken || 'N/A'}</div>
              <div><strong>ABHA Health ID:</strong> {patient?.abha_id || 'Not linked'}</div>
            </div>
          </div>

          {/* SOCRATES Summary */}
          <div className="review-section">
            <h3>2. Presenting Illness (SOCRATES)</h3>
            <div className="review-table">
              <div><strong>Chief Complaint:</strong> {socratesHpi?.chief_complaint || 'General symptom consultation'}</div>
              <div><strong>Onset / Duration:</strong> {socratesHpi?.onset || '—'}</div>
              <div><strong>Pain Severity:</strong> {socratesHpi?.severity || '—'}</div>
              <div><strong>Associated Symptoms:</strong> {Array.isArray(socratesHpi?.associations) ? socratesHpi.associations.join(', ') : '—'}</div>
            </div>
          </div>

          {/* Attached Records */}
          <div className="review-section full-width">
            <h3>3. Attached Medical Records ({documents?.length || 0})</h3>
            {documents?.length === 0 ? (
              <p className="kiosk-hint">No external prescriptions or lab reports uploaded.</p>
            ) : (
              <div className="docs-mini-list">
                {documents.map((d, i) => (
                  <span key={i} className="doc-mini-tag">
                    📄 {d.file_name} ({d.doc_type})
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-actions-right" style={{ marginTop: '28px' }}>
          <button
            type="button"
            className="btn-kiosk-primary submit-intake"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Compiling Physician Summary...' : '✓ Submit Clinical Intake to Doctor'}
          </button>
        </div>
      </div>
    </div>
  )
}
