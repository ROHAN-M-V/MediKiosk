import React, { useState, useEffect } from 'react'

export default function IdentityConsentStep({
  patientToken,
  initialPatientData,
  selectedDoctor,
  onStartIntake,
  loading
}) {
  const [formData, setFormData] = useState({
    name: initialPatientData?.name || '',
    age: initialPatientData?.age ? String(initialPatientData.age) : '',
    gender: initialPatientData?.gender || 'Male',
    phone: initialPatientData?.phone || '',
    abha_id: initialPatientData?.abha_id || '',
    department: 'allopathic'
  })

  useEffect(() => {
    if (initialPatientData) {
      setFormData(prev => ({
        ...prev,
        name: initialPatientData.name || prev.name,
        age: initialPatientData.age ? String(initialPatientData.age) : prev.age,
        gender: initialPatientData.gender || prev.gender
      }))
    }
  }, [initialPatientData])

  const [consentGranted, setConsentGranted] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e) {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!formData.name.trim()) {
      setErrorMsg('Please enter the patient full name.')
      return
    }

    if (!formData.age) {
      setErrorMsg('Please enter the patient age.')
      return
    }

    if (!consentGranted) {
      setErrorMsg('Patient digital consent is required to begin clinical intake.')
      return
    }

    onStartIntake({
      patient_token: patientToken,
      ...formData,
      age: parseInt(formData.age, 10),
      consent: {
        granted: true,
        purpose: 'Outpatient Triage & Clinical Intake',
        patient_token: patientToken,
        timestamp: new Date().toISOString()
      }
    })
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

          {selectedDoctor && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 14px', margin: '12px 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 800, color: '#1e40af', letterSpacing: '0.5px' }}>
                  Attending Doctor:
                </span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f2438' }}>
                  {selectedDoctor.name}
                </div>
              </div>
              <span style={{ fontSize: '12.5px', color: '#2563eb', fontWeight: 600, background: '#ffffff', padding: '3px 10px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                {selectedDoctor.specialty || 'General Medicine / OPD'}
              </span>
            </div>
          )}

          <h2>Step 1: Patient Information</h2>
          <p className="card-subtitle">
            {initialPatientData?.isReturning
              ? `Welcome back, ${formData.name}. Please confirm your details and select your clinic for today.`
              : 'Please enter your details to begin your visit.'}
          </p>
        </div>

        {errorMsg && <div className="kiosk-error-alert">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="kiosk-form">
          <div className="checkin-two-col-layout">
            {/* Left Column: Demographics & Department */}
            <div className="checkin-col">
              <h3 className="section-title">Patient Details</h3>
              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="patient-name">Full Name *</label>
                  <input
                    id="patient-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="patient-abha">ABHA Health ID (Optional)</label>
                  <input
                    id="patient-abha"
                    type="text"
                    name="abha_id"
                    value={formData.abha_id}
                    onChange={handleChange}
                    placeholder="e.g. 14-digit ID or name@abdm"
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label htmlFor="patient-age">Age (Years) *</label>
                  <input
                    id="patient-age"
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    placeholder="Age"
                    min="1"
                    max="120"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="patient-gender">Gender *</label>
                  <select id="patient-gender" name="gender" value={formData.gender} onChange={handleChange}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="patient-phone">Mobile Phone (Optional)</label>
                  <input
                    id="patient-phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="10-digit mobile"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Select Clinic Department *</label>
                <div className="dept-toggle-group">
                  <div
                    className={`dept-card ${formData.department === 'allopathic' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, department: 'allopathic' }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFormData(p => ({ ...p, department: 'allopathic' })) }}
                  >
                    <div className="dept-radio">
                      <input
                        type="radio"
                        name="dept"
                        checked={formData.department === 'allopathic'}
                        onChange={() => {}}
                        aria-label="General Medicine"
                      />
                    </div>
                    <div className="dept-info">
                      <div className="dept-title">General Medicine (Allopathy)</div>
                      <div className="dept-desc">General OPD, Internal Medicine, Cardiology, Triage</div>
                    </div>
                  </div>

                  <div
                    className={`dept-card ${formData.department === 'ayush' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, department: 'ayush' }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFormData(p => ({ ...p, department: 'ayush' })) }}
                  >
                    <div className="dept-radio">
                      <input
                        type="radio"
                        name="dept"
                        checked={formData.department === 'ayush'}
                        onChange={() => {}}
                        aria-label="AYUSH Clinic"
                      />
                    </div>
                    <div className="dept-info">
                      <div className="dept-title">AYUSH Clinic</div>
                      <div className="dept-desc">Ayurveda, Yoga, Naturopathy, Homeopathy</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Consent & Confirmation */}
            <div className="checkin-col">
              <h3 className="section-title">Privacy & Consent</h3>
              
              <div className="consent-box-expanded">
                <div className="consent-header">
                  <span className="consent-shield">🔒</span>
                  <div>
                    <strong>Hospital Outpatient Care</strong>
                    <p className="consent-subtext">Confidential Pre-Consultation</p>
                  </div>
                </div>

                <div className="consent-clauses-list">
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>Pre-Visit Questions:</strong> You will answer a few brief questions about your symptoms to help the doctor prepare.</span>
                  </div>
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>Doctor Review:</strong> Your attending physician will review your answers and make all medical decisions.</span>
                  </div>
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>Privacy Protected:</strong> Your information is confidential and accessible only to your medical team.</span>
                  </div>
                </div>

                <label className="consent-checkbox-label" style={{ marginTop: '16px' }}>
                  <input
                    type="checkbox"
                    checked={consentGranted}
                    onChange={(e) => setConsentGranted(e.target.checked)}
                  />
                  <span className="consent-text">
                    I agree to share my symptom information with the attending doctor for my visit today.
                  </span>
                </label>
              </div>

              <div className="checkin-actions-row">
                <button
                  type="submit"
                  className="btn-kiosk-primary btn-start-intake"
                  disabled={loading || !consentGranted}
                >
                  {loading && <span className="btn-spinner"></span>}
                  {loading ? 'Starting Intake Session...' : 'Continue to Questions (Step 2) →'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
