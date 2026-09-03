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
        <div className="kiosk-card token-card atm-receipt-card">
          <div className="token-header">
            <div className="token-icon">✓</div>
            <h2>Check-In Complete</h2>
            <p>Your details have been submitted. Please take a seat in the waiting area.</p>
          </div>

          {/* ATM-Style Queue Ticket Box */}
          <div className="queue-token-box">
            <div className="token-label">Queue Token Number</div>
            <div className="token-number">{session?.queue_number || 'MK-1024'}</div>
            <div className="token-patient">{patient?.name} {patient?.age ? `(${patient.age} yrs • ${patient.gender || ''})` : ''}</div>
            {patientToken && (
              <div className="token-bound-sub">Patient ID: <strong>{patientToken}</strong></div>
            )}
            
            {session?.assigned_doctor_name && (
              <div className="token-bound-sub" style={{ marginTop: '4px', color: '#1e40af' }}>
                Consulting: <strong>{session.assigned_doctor_name}</strong> {session.assigned_doctor_specialty ? `(${session.assigned_doctor_specialty})` : ''}
              </div>
            )}

            {redFlag?.is_critical && (
              <div className="emergency-token-badge">
                Priority Status: Emergency Triage
              </div>
            )}
          </div>

          <div className="token-meta-grid">
            <div className="meta-card">
              <span className="meta-title">Clinic Department</span>
              <span className="meta-val">{session?.department === 'ayush' ? 'AYUSH Clinic' : 'General Medicine (OPD)'}</span>
            </div>
            <div className="meta-card">
              <span className="meta-title">Documents Attached</span>
              <span className="meta-val">{documents?.length || 0} Records</span>
            </div>
            <div className="meta-card">
              <span className="meta-title">Estimated Wait</span>
              <span className="meta-val">{redFlag?.is_critical ? 'Immediate Attention' : '~10-15 minutes'}</span>
            </div>
          </div>

          <div className="token-actions">
            <button
              type="button"
              className="btn-kiosk-primary btn-done-kiosk"
              onClick={onRestartKiosk}
            >
              Done / Return to Home
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
              <span className="bound-tag">Token ID</span>
              <strong className="bound-token">{patientToken}</strong>
            </div>
          )}
          <h2>Step 4: Confirm Your Details</h2>
          <p className="card-subtitle">
            Please verify your information below before generating your queue token.
          </p>
        </div>

        {redFlag?.is_critical && (
          <div className="red-flag-card">
            <div className="flag-icon">⚠️</div>
            <div className="flag-content">
              <h4>Urgent Triage Alert: {redFlag.severity}</h4>
              <p>{redFlag.reason}</p>
            </div>
          </div>
        )}

        <div className="review-grid">
          {/* Patient Details */}
          <div className="review-section">
            <h3>1. Patient Information</h3>
            <div className="review-table">
              <div><strong>Name:</strong> {patient?.name || '—'}</div>
              <div><strong>Age & Gender:</strong> {patient?.age ? `${patient.age} yrs` : '—'} / {patient?.gender || '—'}</div>
              <div><strong>Phone:</strong> {patient?.phone || 'Not provided'}</div>
              <div><strong>Token ID:</strong> {patientToken || '—'}</div>
              {session?.assigned_doctor_name && (
                <div><strong>Attending Doctor:</strong> <strong>{session.assigned_doctor_name}</strong> {session.assigned_doctor_specialty ? `(${session.assigned_doctor_specialty})` : ''}</div>
              )}
              <div><strong>ABHA ID:</strong> {patient?.abha_id || 'Not linked'}</div>
            </div>
          </div>

          {/* Symptoms Summary */}
          <div className="review-section">
            <h3>2. Symptoms Noted</h3>
            <div className="review-table">
              <div><strong>Main Concern:</strong> {socratesHpi?.chief_complaint || 'General consultation'}</div>
              <div><strong>When it started:</strong> {socratesHpi?.onset || '—'}</div>
              <div><strong>Pain Level:</strong> {socratesHpi?.severity ? `${socratesHpi.severity} / 10` : '—'}</div>
              <div><strong>Other Symptoms:</strong> {Array.isArray(socratesHpi?.associations) && socratesHpi.associations.length > 0 ? socratesHpi.associations.join(', ') : 'None noted'}</div>
            </div>
          </div>

          {/* Attached Records */}
          <div className="review-section full-width">
            <h3>3. Attached Medical Documents ({documents?.length || 0})</h3>
            {documents?.length === 0 ? (
              <p className="kiosk-hint">No past prescriptions or test reports uploaded.</p>
            ) : (
              <div className="docs-mini-list">
                {documents.map((d, i) => (
                  <span key={i} className="doc-mini-tag">
                    📄 {d.file_name} ({d.doc_type?.replace('_', ' ')})
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
            {isLoading && <span className="btn-spinner"></span>}
            {isLoading ? 'Submitting Check-In...' : '✓ Confirm & Get Queue Token'}
          </button>
        </div>
      </div>
    </div>
  )
}
