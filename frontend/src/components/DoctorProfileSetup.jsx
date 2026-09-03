import React, { useState } from 'react'
import { API_URL } from '../apiConfig'

export default function DoctorProfileSetup({
  doctorUser,
  onProfileSaved,
  onSignOut
}) {
  const defaultName = doctorUser?.name?.startsWith('Dr.') ? doctorUser.name : `Dr. ${doctorUser?.name || doctorUser?.email?.split('@')[0] || ''}`
  const [name, setName] = useState(defaultName)
  const [specialty, setSpecialty] = useState(doctorUser?.specialty || 'General Medicine / OPD')
  const [customSpecialty, setCustomSpecialty] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const standardSpecialties = [
    'General Medicine / OPD',
    'Emergency & Triage',
    'Cardiology',
    'Pediatrics & Child Health',
    'Pulmonology & Chest',
    'Orthopedics',
    'Dermatology',
    'AYUSH / Ayurveda',
    'Other Specialization'
  ]

  async function handleSaveProfile(e) {
    e.preventDefault()
    setErrorMsg('')

    const finalName = name.trim()
    const finalSpec = (specialty === 'Other Specialization' ? customSpecialty : specialty).trim()

    if (!finalName) {
      setErrorMsg('Please enter your doctor full name.')
      return
    }
    if (!finalSpec) {
      setErrorMsg('Please select or specify your field/specialization.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/doctors/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': doctorUser?.id || 'doctor',
          'X-User-Role': 'doctor'
        },
        body: JSON.stringify({
          doctor_id: doctorUser?.id,
          name: finalName,
          specialty: finalSpec
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save doctor profile.')
      }

      const updatedUser = {
        ...doctorUser,
        name: data.doctor?.name || finalName,
        specialty: data.doctor?.specialty || finalSpec,
        profile_completed: true
      }

      localStorage.setItem('medikiosk_doctor_user', JSON.stringify(updatedUser))
      onProfileSaved(updatedUser)
    } catch (err) {
      console.error('Doctor profile setup failed:', err)
      setErrorMsg(err.message || 'Could not save profile. Please check server connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-entry-page">
      <div className="doctor-setup-card">
        <div className="setup-header-banner">
          <span className="role-badge-large doctor" style={{ display: 'inline-block', marginBottom: '10px' }}>
            Doctor Profile Setup
          </span>
          <h2>Welcome to MediKiosk</h2>
          <p>
            Please complete your professional credentials. Patients at the kiosk will see this information when selecting their attending doctor.
          </p>
        </div>

        {errorMsg && <div className="auth-error-box">{errorMsg}</div>}

        <form onSubmit={handleSaveProfile} className="auth-form-body">
          <div className="form-group">
            <label>Physician Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Sneha Kulkarni"
              required
              disabled={loading}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Format: Dr. [First Name] [Last Name]
            </span>
          </div>

          <div className="form-group">
            <label>Field / Specialization</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              disabled={loading}
            >
              {standardSpecialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {specialty === 'Other Specialization' && (
            <div className="form-group">
              <label>Specify Your Field / Department</label>
              <input
                type="text"
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                placeholder="e.g. Neurology & Stroke Care"
                required
                disabled={loading}
              />
            </div>
          )}

          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '18px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
              Preview on Patient Kiosk:
            </span>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {name.trim() || 'Dr. Attending Physician'}
            </div>
            <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: 600 }}>
              {specialty === 'Other Specialization' ? (customSpecialty || 'Specialist') : specialty}
            </div>
          </div>

          <button
            type="submit"
            className="btn-auth-submit"
            disabled={loading}
          >
            {loading && <span className="btn-spinner"></span>}
            {loading ? 'Saving Profile...' : 'Save Profile & Open Dashboard →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-toggle-signup"
            onClick={onSignOut}
            disabled={loading}
            style={{ fontSize: '12.5px' }}
          >
            Sign out of this account
          </button>
        </div>
      </div>
    </div>
  )
}
