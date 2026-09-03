import React, { useState } from 'react'
import { API_URL } from '../apiConfig'

export default function PatientTokenEntry({
  onPatientVerified,
  onBackToRoleSelect
}) {
  const [screen, setScreen] = useState('input') // 'input' | 'confirm' | 'new_token' | 'mismatch_alert'
  const [tokenInput, setTokenInput] = useState('')
  const [tokenData, setTokenData] = useState(null)
  const [generatedToken, setGeneratedToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // ─── 1. Lookup Existing Token ────────────────────────────────
  async function handleLookupToken(e) {
    if (e) e.preventDefault()
    setErrorMsg('')

    const cleanToken = tokenInput.trim().toUpperCase()
    if (!cleanToken) {
      setErrorMsg('Please enter your Patient Token.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/patient/token-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken })
      })
      const data = await res.json()

      if (data.found && data.confirmation) {
        setTokenData(data.confirmation)
        setScreen('confirm')
      } else {
        setErrorMsg('Token not found. If this is your first visit, please click "Generate New Token" below.')
      }
    } catch (err) {
      console.error('Token lookup failed:', err)
      setErrorMsg('Could not verify token. Please ensure backend is running.')
    } finally {
      setLoading(false)
    }
  }

  // ─── 2. Generate New Token ───────────────────────────────────
  async function handleGenerateNewToken() {
    setErrorMsg('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/patient/token-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      setGeneratedToken(data.token)
      setScreen('new_token')
    } catch (err) {
      console.error('Failed to generate token:', err)
      // Fallback local generator if backend is offline
      const randNum = Math.floor(1000 + Math.random() * 9000)
      const randLetters = 'MK'
      const fallbackToken = `PT-${randNum}-${randLetters}`
      setGeneratedToken(fallbackToken)
      setScreen('new_token')
    } finally {
      setLoading(false)
    }
  }

  // ─── 3. Handle Token Identity Confirmation ("Yes, this is me")
  function handleConfirmIdentity() {
    if (!tokenData) return
    onPatientVerified({
      token: tokenData.token,
      isReturning: true,
      name: tokenData.name,
      age: tokenData.age,
      gender: tokenData.gender || 'Male'
    })
  }

  // ─── 4. Handle Token Mismatch ("No, this is not me") ──────────
  async function handleTokenMismatch() {
    setLoading(true)
    try {
      await fetch(`${API_URL}/patient/token-mismatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenData?.token || tokenInput,
          reason: 'User at kiosk selected: Not My Identity Details'
        })
      })
    } catch (err) {
      console.warn('Failed to send mismatch log:', err)
    } finally {
      setLoading(false)
      setScreen('mismatch_alert')
    }
  }

  // ─── 5. Proceed with Newly Generated Token ──────────────────
  function handleProceedWithNewToken() {
    onPatientVerified({
      token: generatedToken,
      isReturning: false,
      name: '',
      age: '',
      gender: 'Male'
    })
  }

  // ─── Render Screen States ───────────────────────────────────

  return (
    <div className="auth-entry-page">
      <div className="auth-login-card">
        {/* Back Navigation */}
        <button
          type="button"
          className="btn-back-role"
          onClick={onBackToRoleSelect}
        >
          ← Back to Start
        </button>

        {/* ─── SCREEN 1: Token Input Form ─── */}
        {screen === 'input' && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                Patient Check-In
              </span>
              <h2>Enter Your Token</h2>
              <p className="auth-desc">
                Enter your Patient Token from a previous visit, or start as a new patient.
              </p>
            </div>

            {errorMsg && <div className="auth-error-box">{errorMsg}</div>}

            <form onSubmit={handleLookupToken} className="auth-form-body">
              <div className="form-group">
                <label>Patient Token Number</label>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                  placeholder="e.g. PT-4829-MR"
                  className="token-input-field"
                  autoFocus
                />
                <span className="form-subtext" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                  If you have visited before, enter the token code given to you.
                </span>
              </div>

              <button
                type="submit"
                className="btn-auth-submit"
                disabled={loading || !tokenInput.trim()}
              >
                {loading && <span className="btn-spinner"></span>}
                {loading ? 'Checking Token...' : 'Find My Details →'}
              </button>
            </form>

            <div className="auth-or-divider" style={{ margin: '24px 0' }}>
              <span>First time at this clinic?</span>
            </div>

            <button
              type="button"
              className="btn-generate-token-large"
              onClick={handleGenerateNewToken}
              disabled={loading}
            >
              {loading && <span className="btn-spinner"></span>}
              {loading ? 'Generating Patient Token...' : 'Start as New Patient (Generate Token)'}
            </button>
          </div>
        )}

        {/* ─── SCREEN 2: Identity Confirmation ("Is this you?") ─── */}
        {screen === 'confirm' && tokenData && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                Confirm Details
              </span>
              <h2>Is This Information Correct?</h2>
              <p className="auth-desc">
                Please confirm that the name and details below match your identity.
              </p>
            </div>

            <div className="identity-confirmation-card">
              <div className="id-confirm-row">
                <span className="id-confirm-label">Token:</span>
                <strong className="id-confirm-token">{tokenData.token}</strong>
              </div>
              <div className="id-confirm-row">
                <span className="id-confirm-label">Name:</span>
                <strong className="id-confirm-value">{tokenData.name}</strong>
              </div>
              <div className="id-confirm-row">
                <span className="id-confirm-label">Age & Gender:</span>
                <span className="id-confirm-value">{tokenData.age} yrs • {tokenData.gender || 'Patient'}</span>
              </div>
            </div>

            <p className="privacy-guarantee-note">
              <em>Your previous prescriptions and clinical history remain confidential and will only be shared with your attending doctor.</em>
            </p>

            <div className="confirm-actions-stack">
              <button
                type="button"
                className="btn-confirm-yes"
                onClick={handleConfirmIdentity}
                disabled={loading}
              >
                ✓ Yes, this is me (Continue)
              </button>

              <button
                type="button"
                className="btn-confirm-no"
                onClick={handleTokenMismatch}
                disabled={loading}
              >
                {loading && <span className="btn-spinner"></span>}
                {loading ? 'Logging Alert...' : '✕ No, this is not my information'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SCREEN 3: Newly Generated Token ─── */}
        {screen === 'new_token' && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                New Patient
              </span>
              <h2>Your Patient Token</h2>
              <p className="auth-desc">
                Please keep this token for your records. You can use it whenever you visit this hospital.
              </p>
            </div>

            <div className="new-token-display-box">
              <div className="token-display-label">Patient Token Number</div>
              <div className="token-display-number">{generatedToken}</div>
              <p className="token-save-hint">
                You may take a photo or note down this number.
              </p>
            </div>

            <button
              type="button"
              className="btn-auth-submit"
              onClick={handleProceedWithNewToken}
            >
              Continue to Check-In Details →
            </button>
          </div>
        )}

        {/* ─── SCREEN 4: Mismatch Security Alert Logged ─── */}
        {screen === 'mismatch_alert' && (
          <div className="mismatch-notice-screen">
            <div className="mismatch-icon">ℹ️</div>
            <h2>Assistance Requested</h2>
            <p className="mismatch-desc">
              We have noted that this token did not match your information. Please visit the reception desk or generate a new patient token.
            </p>
            <p className="mismatch-sub">
              No personal medical information was shown.
            </p>

            <div className="mismatch-actions">
              <button
                type="button"
                className="btn-auth-submit"
                onClick={handleGenerateNewToken}
              >
                + Generate My Own Token
              </button>
              <button
                type="button"
                className="btn-kiosk-secondary"
                onClick={() => {
                  setTokenInput('')
                  setScreen('input')
                }}
                style={{ width: '100%', marginTop: '10px' }}
              >
                Re-enter Token Number
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
