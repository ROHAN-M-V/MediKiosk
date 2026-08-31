import React, { useState, useEffect } from 'react'

export default function IdentityConsentStep({
  patientToken,
  initialPatientData,
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
          <div className="token-bound-badge">
            <span className="bound-tag">LINKED TOKEN</span>
            <strong className="bound-token">{patientToken || 'PT-PENDING'}</strong>
          </div>
          <h2>Step 1: Patient Check-In & Consent</h2>
          <p className="card-subtitle">
            {initialPatientData?.isReturning
              ? `Welcome back, ${formData.name}. Please confirm your OPD department and consent for today's visit.`
              : 'Please enter your check-in details. This information will be permanently tied to your token.'}
          </p>
        </div>

        {errorMsg && <div className="kiosk-error-alert">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="kiosk-form">
          <div className="checkin-two-col-layout">
            {/* Left Column: Demographics & Department */}
            <div className="checkin-col">
              <h3 className="section-title">👤 Patient Information</h3>
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Full Patient Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter patient full name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>ABHA Health ID (Optional)</label>
                  <input
                    type="text"
                    name="abha_id"
                    value={formData.abha_id}
                    onChange={handleChange}
                    placeholder="e.g. 14-digit ABHA or name@abdm"
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label>Age *</label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    placeholder="Age in years"
                    min="1"
                    max="120"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Gender *</label>
                  <select name="gender" value={formData.gender} onChange={handleChange}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Phone (Optional)</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="10-digit mobile"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>Select OPD Care Department *</label>
                <div className="dept-toggle-group">
                  <div
                    className={`dept-card ${formData.department === 'allopathic' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, department: 'allopathic' }))}
                  >
                    <div className="dept-radio">
                      <input
                        type="radio"
                        name="dept"
                        checked={formData.department === 'allopathic'}
                        onChange={() => {}}
                      />
                    </div>
                    <div className="dept-info">
                      <div className="dept-title">🏥 Modern Medicine (Allopathy)</div>
                      <div className="dept-desc">General OPD, Internal Medicine, Cardiology, Triage</div>
                    </div>
                  </div>

                  <div
                    className={`dept-card ${formData.department === 'ayush' ? 'selected' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, department: 'ayush' }))}
                  >
                    <div className="dept-radio">
                      <input
                        type="radio"
                        name="dept"
                        checked={formData.department === 'ayush'}
                        onChange={() => {}}
                      />
                    </div>
                    <div className="dept-info">
                      <div className="dept-title">🌿 AYUSH Department</div>
                      <div className="dept-desc">Ayurveda, Yoga, Naturopathy, Unani, Siddha, Homeopathy</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Digital Informed Consent & Privacy Security */}
            <div className="checkin-col">
              <h3 className="section-title">🔒 Digital Informed Consent & Privacy</h3>
              
              <div className="consent-box-expanded">
                <div className="consent-header">
                  <span className="consent-shield">🛡️</span>
                  <div>
                    <strong>Ayushman Bharat & DPDP Compliant Intake</strong>
                    <p className="consent-subtext">Purpose: Clinical Outpatient Triage & Documentation</p>
                  </div>
                </div>

                <div className="consent-clauses-list">
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>AI-Assisted Pre-Consultation:</strong> You will complete a brief conversational interview to help the doctor review your symptoms faster.</span>
                  </div>
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>Doctor Review & Final Authority:</strong> The AI provides documentation assistance; attending doctors verify all diagnoses and prescriptions.</span>
                  </div>
                  <div className="clause-item">
                    <span className="clause-check">✓</span>
                    <span><strong>Token Security:</strong> Your health records remain encrypted and inaccessible to other kiosk users.</span>
                  </div>
                </div>

                <label className="consent-checkbox-label" style={{ marginTop: '16px' }}>
                  <input
                    type="checkbox"
                    checked={consentGranted}
                    onChange={(e) => setConsentGranted(e.target.checked)}
                  />
                  <span className="consent-text">
                    I grant informed consent to proceed with AI-assisted clinical intake and share summary data with my attending doctor.
                  </span>
                </label>
              </div>

              <div className="checkin-actions-row">
                <button
                  type="submit"
                  className="btn-kiosk-primary btn-start-intake"
                  disabled={loading || !consentGranted}
                >
                  {loading ? 'Initializing Session...' : 'Start Conversational Intake (Step 2) →'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
