import React, { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { API_URL } from '../apiConfig'

export default function Auth({
  onSelectPatient,
  onDoctorLoginSuccess
}) {
  const [selectedRole, setSelectedRole] = useState(null) // null | 'doctor'
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('General Medicine / OPD')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')

  // ─── Google OAuth Login for Doctors ─────────────────────────
  async function handleDoctorGoogleLogin() {
    setErrorMsg('')
    setInfoMsg('')

    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg('Supabase credentials not configured in frontend/.env. Please use hospital email or doctor sign-in.')
      return
    }

    setLoading(true)
    try {
      localStorage.setItem('medx_pending_role', 'doctor')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      setErrorMsg(err.message || 'Google sign-in failed. Please use email login.')
      setLoading(false)
    }
  }

  // ─── Email & Password Authentication for Doctors (No Email Verification Link Required) ───
  async function handleDoctorEmailAuth(e) {
    e.preventDefault()
    setErrorMsg('')
    setInfoMsg('')

    const cleanEmail = email.trim().toLowerCase()
    const cleanPass = password.trim()

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Please enter both physician email and password.')
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        // Frictionless signup via backend — doctor is authenticated immediately!
        const res = await fetch(`${API_URL}/doctors/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password: cleanPass,
            name: name.trim() || `Dr. ${cleanEmail.split('@')[0]}`,
            specialty: specialty || 'General Medicine / OPD'
          })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Registration failed. Please try again.')
        }

        // Background sync with Supabase if configured
        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.auth.signUp({
              email: cleanEmail,
              password: cleanPass,
              options: {
                data: {
                  name: data.doctor?.name,
                  role: 'doctor',
                  specialty: data.doctor?.specialty
                }
              }
            })
          } catch {}
        }

        onDoctorLoginSuccess(data.doctor)
      } else {
        // Authenticate doctor
        const res = await fetch(`${API_URL}/doctors/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password: cleanPass
          })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Invalid email or password.')
        }

        // Background session with Supabase if configured
        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: cleanPass
            })
          } catch {}
        }

        onDoctorLoginSuccess(data.doctor)
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ─── SCREEN 1: Role Selection Entry Screen ──────────────────
  if (!selectedRole) {
    return (
      <div className="auth-entry-page">
        <div className="auth-entry-card">
          <div className="entry-header">
            <h1>MediKiosk</h1>
            <span className="entry-tagline">Hospital Outpatient Check-In</span>
            <div className="entry-divider-line"></div>
            <h2 className="entry-question">Please Select an Option</h2>
            <p className="entry-subtitle">Touch a card below to begin</p>
          </div>

          <div className="role-selection-grid">
            {/* Option 1: Patient Check-In */}
            <div
              className="role-card-select patient-card"
              onClick={onSelectPatient}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectPatient() }}
            >
              <div className="role-icon-circle">👤</div>
              <div className="role-card-body">
                <h3>Patient Check-In</h3>
                <p className="role-tag-quote">Check in for your visit</p>
                <p className="role-desc">
                  Check in with your token number or register as a new patient. Quick, simple, and private.
                </p>
                <button
                  type="button"
                  className="btn-select-role patient"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectPatient()
                  }}
                >
                  Start Patient Check-In →
                </button>
              </div>
            </div>

            {/* Option 2: Doctor & Staff Login */}
            <div
              className="role-card-select doctor-card"
              onClick={() => setSelectedRole('doctor')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedRole('doctor') }}
            >
              <div className="role-icon-circle doctor">🩺</div>
              <div className="role-card-body">
                <h3>Doctor & Staff</h3>
                <p className="role-tag-quote">Authorized access only</p>
                <p className="role-desc">
                  Sign in with your hospital account to review patient check-ins and medical summaries.
                </p>
                <button
                  type="button"
                  className="btn-select-role doctor"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedRole('doctor')
                  }}
                >
                  Doctor Sign In →
                </button>
              </div>
            </div>
          </div>

          <div className="entry-footer-notes">
            <span>Hospital Outpatient Department • Secure & Confidential</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── SCREEN 2: Doctor Google OAuth & Secure Login ───────────
  return (
    <div className="auth-entry-page">
      <div className="auth-login-card">
        <button
          type="button"
          className="btn-back-role"
          onClick={() => {
            setSelectedRole(null)
            setErrorMsg('')
            setInfoMsg('')
          }}
        >
          ← Return to Main Menu
        </button>

        <div className="auth-role-banner">
          <span className="role-badge-large doctor">
            Staff Access
          </span>
          <h2>{isSignUp ? 'Create Doctor Account' : 'Doctor Sign In'}</h2>
          <p className="auth-desc">
            Sign in with your hospital credentials to view patient check-ins.
          </p>
        </div>

        {errorMsg && <div className="auth-error-box">{errorMsg}</div>}
        {infoMsg && <div className="auth-info-box">{infoMsg}</div>}

        {/* Google OAuth Button */}
        <button
          type="button"
          className="btn-auth-google"
          onClick={handleDoctorGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="btn-spinner"></span>
              <span>Connecting to Google...</span>
            </>
          ) : (
            <>
              <svg className="google-svg" viewBox="0 0 24 24" width="18" height="18">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                />
              </svg>
              <span>Sign In with Google</span>
            </>
          )}
        </button>

        <div className="auth-or-divider">
          <span>or continue with email</span>
        </div>

        <form onSubmit={handleDoctorEmailAuth} className="auth-form-body">
          {isSignUp && (
            <div className="form-group">
              <label>Doctor Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. S. Kulkarni"
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="form-group">
            <label>Hospital Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.org"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label>Specialty</label>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                disabled={loading}
              >
                <option value="General Medicine / OPD">General Medicine / OPD</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Emergency & Triage">Emergency & Triage</option>
                <option value="Pulmonology">Pulmonology</option>
                <option value="AYUSH / Ayurveda">AYUSH / Ayurveda</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            className="btn-auth-submit"
            disabled={loading}
          >
            {loading && <span className="btn-spinner"></span>}
            {loading ? (isSignUp ? 'Creating Doctor Account...' : 'Signing In...') : (isSignUp ? 'Create Doctor Account' : 'Sign In as Doctor')}
          </button>
        </form>

        <div className="auth-footer-bar">
          <button
            type="button"
            className="btn-toggle-signup"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErrorMsg('')
              setInfoMsg('')
            }}
          >
            {isSignUp ? 'Already registered? Doctor Sign In' : 'New Doctor? Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
