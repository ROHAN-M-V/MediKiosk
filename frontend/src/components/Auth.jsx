import React, { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

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
      setErrorMsg('Supabase credentials not configured in frontend/.env. Please use email or local doctor sign-in.')
      return
    }

    setLoading(true)
    try {
      localStorage.setItem('medx_pending_role', 'doctor')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { role: 'doctor' }
        }
      })
      if (error) throw error
    } catch (err) {
      setErrorMsg(err.message || 'Google sign-in failed. Please use email login.')
      setLoading(false)
    }
  }

  // ─── Email & Password Authentication for Doctors ───────────
  async function handleDoctorEmailAuth(e) {
    e.preventDefault()
    setErrorMsg('')
    setInfoMsg('')

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both physician email and password.')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      // Fallback local doctor session
      const docUser = {
        id: 'doc_' + Date.now().toString().slice(-4),
        email: email.trim(),
        name: name.trim() || (email.split('@')[0].startsWith('dr') ? email.split('@')[0] : `Dr. ${email.split('@')[0]}`),
        role: 'doctor',
        specialty
      }
      onDoctorLoginSuccess(docUser)
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              name: name.trim() || `Dr. ${email.split('@')[0]}`,
              role: 'doctor',
              specialty
            }
          }
        })
        if (error) throw error
        if (data.session) {
          onDoctorLoginSuccess({
            ...data.session.user,
            name: name.trim() || `Dr. ${email.split('@')[0]}`,
            role: 'doctor',
            specialty
          })
        } else {
          setInfoMsg('Check your email for the confirmation link to complete registration!')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim()
        })
        if (error) throw error
        if (data.user) {
          const docName = data.user.user_metadata?.name || `Dr. ${data.user.email?.split('@')[0]}`
          onDoctorLoginSuccess({
            ...data.user,
            name: docName,
            role: 'doctor',
            specialty: data.user.user_metadata?.specialty || 'Attending Physician'
          })
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please check credentials.')
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
            <span className="entry-tagline">AI-Powered Clinical Intake & Triage Platform</span>
            <div className="entry-divider-line"></div>
            <h2 className="entry-question">How would you like to continue?</h2>
            <p className="entry-subtitle">Please select your portal to proceed</p>
          </div>

          <div className="role-selection-grid">
            {/* Option 1: Patient Token System */}
            <div
              className="role-card-select patient-card"
              onClick={onSelectPatient}
            >
              <div className="role-icon-circle">👤</div>
              <div className="role-card-body">
                <h3>Patient</h3>
                <p className="role-tag-quote">"Start your medical intake"</p>
                <p className="role-desc">
                  Token-based identification. No passwords or emails required. Look up existing token or generate a new one.
                </p>
                <button
                  type="button"
                  className="btn-select-role patient"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectPatient()
                  }}
                >
                  Continue with Patient Token →
                </button>
              </div>
            </div>

            {/* Option 2: Doctor (Google OAuth) */}
            <div
              className="role-card-select doctor-card"
              onClick={() => setSelectedRole('doctor')}
            >
              <div className="role-icon-circle doctor">🩺</div>
              <div className="role-card-body">
                <h3>Doctor</h3>
                <p className="role-tag-quote">"View patient information"</p>
                <p className="role-desc">
                  Google OAuth secure login for attending physicians to review incoming intake packets, red-flags, and summaries.
                </p>
                <button
                  type="button"
                  className="btn-select-role doctor"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedRole('doctor')
                  }}
                >
                  Doctor Sign In (Google OAuth) →
                </button>
              </div>
            </div>
          </div>

          <div className="entry-footer-notes">
            <span>🔒 Patient Token Privacy & Doctor Google OAuth RBAC Enforced</span>
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
          ← Choose a different role
        </button>

        <div className="auth-role-banner">
          <span className="role-badge-large doctor">
            🩺 Doctor Portal
          </span>
          <h2>{isSignUp ? 'Doctor Registration' : 'Physician Secure Login'}</h2>
          <p className="auth-desc">
            Authenticate via Google OAuth or hospital credentials to access triage records.
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
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label>Specialty</label>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
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
            {loading ? 'Authenticating...' : isSignUp ? 'Create Doctor Account' : 'Sign In as Doctor'}
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
