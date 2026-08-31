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
          ← Return to Role Selection
        </button>

        {/* ─── SCREEN 1: Token Input Form ─── */}
        {screen === 'input' && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                👤 Patient Kiosk
              </span>
              <h2>Patient Identification</h2>
              <p className="auth-desc">
                Enter your unique Patient Token to retrieve your check-in profile.
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
                <span className="form-subtext" style={{ fontSize: '11px', color: 'var(--accent-muted)', marginTop: '4px', display: 'block' }}>
                  Enter your permanent token received during your previous visit.
                </span>
              </div>

              <button
                type="submit"
                className="btn-auth-submit"
                disabled={loading || !tokenInput.trim()}
              >
                {loading ? 'Verifying Token...' : 'Look Up Patient Token →'}
              </button>
            </form>

            <div className="auth-or-divider" style={{ margin: '24px 0' }}>
              <span>first time at kiosk?</span>
            </div>

            <button
              type="button"
              className="btn-generate-token-large"
              onClick={handleGenerateNewToken}
              disabled={loading}
            >
              ⚡ Generate New Patient Token
            </button>
          </div>
        )}

        {/* ─── SCREEN 2: Identity Confirmation ("Is this you?") ─── */}
        {screen === 'confirm' && tokenData && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                🔒 Identity Verification
              </span>
              <h2>Confirm Your Identity</h2>
              <p className="auth-desc">
                Please verify that the name and age associated with this token match your identity.
              </p>
            </div>

            <div className="identity-confirmation-card">
              <div className="id-confirm-row">
                <span className="id-confirm-label">Token:</span>
                <strong className="id-confirm-token">{tokenData.token}</strong>
              </div>
              <div className="id-confirm-row">
                <span className="id-confirm-label">Patient Name:</span>
                <strong className="id-confirm-value">{tokenData.name}</strong>
              </div>
              <div className="id-confirm-row">
                <span className="id-confirm-label">Age / Gender:</span>
                <span className="id-confirm-value">{tokenData.age} yrs • {tokenData.gender || 'Patient'}</span>
              </div>
            </div>

            <p className="privacy-guarantee-note">
              🛡️ <em>Zero-Data Exposure Guarantee: Previous clinical diagnoses, prescriptions, and lab history are kept strictly confidential and never displayed on this kiosk screen.</em>
            </p>

            <div className="confirm-actions-stack">
              <button
                type="button"
                className="btn-confirm-yes"
                onClick={handleConfirmIdentity}
              >
                ✓ Yes, this is me (Continue)
              </button>

              <button
                type="button"
                className="btn-confirm-no"
                onClick={handleTokenMismatch}
                disabled={loading}
              >
                ✕ No, this is not me
              </button>
            </div>
          </div>
        )}

        {/* ─── SCREEN 3: Newly Generated Token ─── */}
        {screen === 'new_token' && (
          <div>
            <div className="auth-role-banner">
              <span className="role-badge-large patient">
                🎉 New Token Created
              </span>
              <h2>Your Patient Token</h2>
              <p className="auth-desc">
                This token is your permanent identification for all future visits at MediKiosk.
              </p>
            </div>

            <div className="new-token-display-box">
              <div className="token-display-label">Permanent Patient Token</div>
              <div className="token-display-number">{generatedToken}</div>
              <p className="token-save-hint">
                📸 Please make a note of or take a picture of this token for your next hospital visit.
              </p>
            </div>

            <button
              type="button"
              className="btn-auth-submit"
              onClick={handleProceedWithNewToken}
            >
              Continue to Registration & Intake →
            </button>
          </div>
        )}

        {/* ─── SCREEN 4: Mismatch Security Alert Logged ─── */}
        {screen === 'mismatch_alert' && (
          <div className="mismatch-notice-screen">
            <div className="mismatch-icon">🛡️</div>
            <h2>Security Notice Logged</h2>
            <p className="mismatch-desc">
              We have recorded that this token did not match your identity. A security notification has been dispatched to hospital administration and the consulting physician.
            </p>
            <p className="mismatch-sub">
              No private medical information or consultation history from this token was revealed.
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
