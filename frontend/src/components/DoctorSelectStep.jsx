import React, { useState, useEffect } from 'react'
import { API_URL } from '../apiConfig'

export default function DoctorSelectStep({
  patientToken,
  patientData,
  onDoctorSelected,
  onBackToToken
}) {
  const [doctors, setDoctors] = useState([])
  const [selectedDoctorId, setSelectedDoctorId] = useState(null)
  const [fetchingDocs, setFetchingDocs] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadDoctors() {
      setFetchingDocs(true)
      setErrorMsg('')
      try {
        const res = await fetch(`${API_URL}/doctors`)
        if (!res.ok) throw new Error('Failed to load doctors list')
        const data = await res.json()
        if (isMounted) {
          const list = data.doctors || []
          setDoctors(list)
          if (list.length > 0) {
            // Pre-select first doctor by default
            setSelectedDoctorId(list[0].id)
          }
        }
      } catch (err) {
        console.error('Error fetching doctors:', err)
        if (isMounted) {
          setErrorMsg('Could not fetch available doctors. Make sure backend is running.')
        }
      } finally {
        if (isMounted) {
          setFetchingDocs(false)
        }
      }
    }

    loadDoctors()
    return () => { isMounted = false }
  }, [])

  function handleConfirmDoctor() {
    if (!selectedDoctorId) {
      setErrorMsg('Please select a doctor to continue.')
      return
    }

    const doc = doctors.find(d => d.id === selectedDoctorId)
    if (!doc) return

    setSubmitting(true)
    setTimeout(() => {
      onDoctorSelected({
        id: doc.id,
        name: doc.name,
        specialty: doc.specialty || 'General Medicine / OPD'
      })
      setSubmitting(false)
    }, 250)
  }

  return (
    <div className="auth-entry-page">
      <div className="auth-login-card" style={{ maxWidth: '780px' }}>
        <button
          type="button"
          className="btn-back-role"
          onClick={onBackToToken}
          disabled={submitting}
        >
          ← Back to Token Screen
        </button>

        <div className="doctor-select-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="role-badge-large patient">Step: Choose Physician</span>
            {patientToken && (
              <span style={{ fontSize: '12.5px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                Token: {patientToken}
              </span>
            )}
          </div>
          <h2>Select Your Attending Doctor</h2>
          <p>
            Please choose the available doctor you wish to consult with today. Your symptoms and intake form will be sent directly to their queue.
          </p>
        </div>

        {errorMsg && <div className="auth-error-box">{errorMsg}</div>}

        {fetchingDocs ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <span className="btn-spinner" style={{ width: '22px', height: '22px', borderWidth: '3px', marginRight: '10px' }}></span>
            <span>Loading active hospital physicians...</span>
          </div>
        ) : doctors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-strong)' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              No doctors are currently registered in the hospital system.
            </p>
            <button
              type="button"
              className="btn-kiosk-primary"
              onClick={() => onDoctorSelected({ id: 'doc_default', name: 'Dr. Attending Physician', specialty: 'General Medicine / OPD' })}
              disabled={submitting}
            >
              Continue with General OPD Physician →
            </button>
          </div>
        ) : (
          <div>
            <div className="doctor-selection-grid">
              {doctors.map((doc) => {
                const isSelected = doc.id === selectedDoctorId
                return (
                  <div
                    key={doc.id}
                    className={`doctor-select-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (!submitting) setSelectedDoctorId(doc.id)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedDoctorId(doc.id)
                    }}
                  >
                    <div className="doctor-avatar-circle">🩺</div>
                    <div className="doctor-card-name">{doc.name}</div>
                    <div className="doctor-card-spec">{doc.specialty || 'General Medicine / OPD'}</div>
                    <div className="doctor-card-status">● Available for OPD</div>
                  </div>
                )
              })}
            </div>

            <div className="doctor-select-footer">
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Selected: <strong>{doctors.find(d => d.id === selectedDoctorId)?.name || 'None'}</strong> ({doctors.find(d => d.id === selectedDoctorId)?.specialty || 'General OPD'})
              </span>
              <button
                type="button"
                className="btn-kiosk-primary btn-select-doctor-confirm"
                onClick={handleConfirmDoctor}
                disabled={submitting || !selectedDoctorId}
                style={{ padding: '12px 24px', fontSize: '14px' }}
              >
                {submitting && <span className="btn-spinner"></span>}
                {submitting ? 'Assigning Doctor...' : 'Confirm Doctor & Continue →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
