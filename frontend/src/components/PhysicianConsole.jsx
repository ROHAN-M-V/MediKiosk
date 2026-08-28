import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { BASE_SERVER_URL } from '../apiConfig'

export default function PhysicianConsole({
  queue,
  selectedSessionId,
  onSelectSession,
  sessionDetail,
  onConfirmSummary,
  onOpenFhir,
  isLoading,
  onRefreshQueue
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState('')
  const [doctorNotes, setDoctorNotes] = useState('')
  const [mobileTab, setMobileTab] = useState('queue') // 'queue' | 'detail'
  const [deptFilter, setDeptFilter] = useState('all') // 'all' | 'allopathic' | 'ayush' | 'urgent'
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    if (sessionDetail?.session?.structured_summary) {
      setEditedSummary(sessionDetail.session.structured_summary)
    }
  }, [sessionDetail])

  // Multi-user real-time polling: Refresh queue every 5s if enabled
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      onRefreshQueue()
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, onRefreshQueue])

  function handleSelectPatientMobile(id) {
    onSelectSession(id)
    setMobileTab('detail')
  }

  function handleSaveConfirmation() {
    onConfirmSummary(sessionDetail.session.id, editedSummary, doctorNotes)
    setIsEditing(false)
  }

  const session = sessionDetail?.session
  const patient = sessionDetail?.patient || {}
  const documents = sessionDetail?.documents || []
  const messages = sessionDetail?.messages || []
  const redFlag = session?.red_flag_alert || {}
  const securityAlerts = sessionDetail?.security_alerts || []

  // Filter queue by department / urgency
  const filteredQueue = queue.filter(item => {
    if (deptFilter === 'urgent') return item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
    if (deptFilter === 'allopathic') return item.department === 'allopathic'
    if (deptFilter === 'ayush') return item.department === 'ayush'
    return true
  })

  return (
    <div className="physician-dashboard-layout">
      {/* Mobile Top Navigation Switcher */}
      <div className="physician-mobile-tabs">
        <button
          type="button"
          className={`mob-tab-btn ${mobileTab === 'queue' ? 'active' : ''}`}
          onClick={() => setMobileTab('queue')}
        >
          📋 Queue ({filteredQueue.length})
        </button>
        <button
          type="button"
          className={`mob-tab-btn ${mobileTab === 'detail' ? 'active' : ''}`}
          onClick={() => setMobileTab('detail')}
        >
          📄 Patient Packet {session ? `(${session.queue_number})` : ''}
        </button>
      </div>

      {/* Left Sidebar: Live OPD Patient Queue */}
      <aside className={`physician-queue-sidebar ${mobileTab === 'queue' ? 'mobile-visible' : 'mobile-hidden'}`}>
        <div className="queue-header">
          <div className="queue-title-row">
            <div className="queue-live-indicator">
              <span className={`live-dot ${autoRefresh ? 'pulsing' : ''}`}></span>
              <h3>OPD Live Queue</h3>
            </div>
            <div className="queue-controls">
              <button
                type="button"
                className={`btn-auto-poll ${autoRefresh ? 'active' : ''}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
                title="Toggle 5s live auto-refresh"
              >
                {autoRefresh ? '● LIVE' : '○ PAUSED'}
              </button>
              <button className="btn-queue-refresh" onClick={onRefreshQueue} title="Refresh Queue">
                🔄
              </button>
            </div>
          </div>

          {/* Department Filter Pills (Multi-Doctor Concurrency) */}
          <div className="queue-filter-tabs">
            <button
              type="button"
              className={`filter-tab-pill ${deptFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDeptFilter('all')}
            >
              All ({queue.length})
            </button>
            <button
              type="button"
              className={`filter-tab-pill ${deptFilter === 'allopathic' ? 'active' : ''}`}
              onClick={() => setDeptFilter('allopathic')}
            >
              🏥 Allopathy
            </button>
            <button
              type="button"
              className={`filter-tab-pill ${deptFilter === 'ayush' ? 'active' : ''}`}
              onClick={() => setDeptFilter('ayush')}
            >
              🌿 AYUSH
            </button>
            <button
              type="button"
              className={`filter-tab-pill urgent ${deptFilter === 'urgent' ? 'active' : ''}`}
              onClick={() => setDeptFilter('urgent')}
            >
              🚨 Red Flag
            </button>
          </div>
        </div>

        <div className="queue-list">
          {filteredQueue.length === 0 ? (
            <div className="queue-empty">
              <p>No patients in {deptFilter.toUpperCase()} queue.</p>
              <span className="queue-subhint">Incoming kiosk submissions appear here in real-time.</span>
            </div>
          ) : (
            filteredQueue.map(item => {
              const isSelected = selectedSessionId === item.id
              const isUrgent = item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
              const hasMismatchAlert = item.security_alerts?.length > 0
              return (
                <div
                  key={item.id}
                  className={`queue-card ${isSelected ? 'active' : ''} ${isUrgent ? 'urgent' : ''}`}
                  onClick={() => handleSelectPatientMobile(item.id)}
                >
                  <div className="queue-card-top">
                    <span className="queue-token">{item.queue_number}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {hasMismatchAlert && (
                        <span className="queue-tag security-flag" title="Suspicious token attempt detected">
                          ⚠️ MISMATCH
                        </span>
                      )}
                      {isUrgent ? (
                        <span className="queue-tag urgent">🚨 RED FLAG</span>
                      ) : (
                        <span className="queue-tag standard">{item.department?.toUpperCase() || 'OPD'}</span>
                      )}
                    </div>
                  </div>

                  <div className="queue-patient-name">{item.patient_name}</div>
                  <div className="queue-token-mini">Token: <strong>{item.patient_token || 'N/A'}</strong></div>
                  <div className="queue-patient-meta">
                    {item.patient_age} yrs • {item.patient_gender} • {item.department?.toUpperCase()}
                  </div>

                  <div className="queue-symptom-preview">
                    {item.socrates_hpi?.chief_complaint || 'General intake'}
                  </div>

                  <div className="queue-card-footer">
                    <span className="queue-status-tag">{item.status?.replace('_', ' ').toUpperCase()}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Area: Selected Patient Clinical Packet */}
      <main className={`physician-detail-area ${mobileTab === 'detail' ? 'mobile-visible' : 'mobile-hidden'}`}>
        {!session ? (
          <div className="no-patient-selected">
            <div className="empty-icon">📋</div>
            <h3>Select a Patient from the Queue</h3>
            <p>Click on any patient in the queue to review their AI-structured intake packet, OCR documents, and clinical history.</p>
            <button
              type="button"
              className="btn-kiosk-primary"
              onClick={() => setMobileTab('queue')}
              style={{ marginTop: '16px' }}
            >
              ← Go to Patient Queue
            </button>
          </div>
        ) : (
          <div className="patient-packet-scroll">
            {/* Mobile Back Button */}
            <div className="mobile-packet-back-bar">
              <button
                type="button"
                className="btn-mobile-back"
                onClick={() => setMobileTab('queue')}
              >
                ← Back to Queue List
              </button>
            </div>

            {/* Top Patient Header Bar */}
            <div className="patient-packet-header">
              <div className="packet-identity">
                <h2>{patient.name || session.patient_name}</h2>
                <div className="identity-tags">
                  <span className="id-badge token-highlight">🔑 Token: <strong>{session.patient_token || patient.patient_token}</strong></span>
                  <span className="id-badge">Queue: <strong>{session.queue_number}</strong></span>
                  <span className="id-badge">{patient.age || session.patient_age} yrs / {patient.gender || session.patient_gender}</span>
                  <span className="id-badge">ABHA: {patient.abha_id || 'Not linked'}</span>
                  <span className="id-badge">Dept: {session.department?.toUpperCase()}</span>
                </div>
              </div>

              <div className="packet-header-actions">
                {session.fhir_bundle && Object.keys(session.fhir_bundle).length > 0 && (
                  <button className="btn-fhir-view" onClick={() => onOpenFhir(session.fhir_bundle)}>
                    🌐 View FHIR R4 Bundle
                  </button>
                )}
              </div>
            </div>

            {/* Security Mismatch Warning Box */}
            {securityAlerts.length > 0 && (
              <div className="security-alert-box">
                <div className="sec-icon">⚠️</div>
                <div className="sec-body">
                  <strong>SECURITY ALERT: Token Mismatch Event Recorded</strong>
                  <p>
                    A user entered token <strong>{session.patient_token}</strong> at the kiosk but selected <em>"No, this is not my name/age"</em>.
                    No private history was revealed. Please verify patient identity in person.
                  </p>
                </div>
              </div>
            )}

            {/* Red Flag Alert Box (If present) */}
            {redFlag.is_critical && (
              <div className="physician-red-flag-box">
                <div className="p-flag-icon">🚨</div>
                <div className="p-flag-body">
                  <strong>TRIAGE RED FLAG: {redFlag.severity}</strong>
                  <p>{redFlag.reason}</p>
                </div>
              </div>
            )}

            {/* Mock Integration Status Banner (If Confirmed) */}
            {session.status === 'physician_reviewed' && (
              <div className="mock-sync-banner">
                <span className="sync-item">✓ <strong>HIS:</strong> Record Saved (#HIS-88291)</span>
                <span className="sync-item">✓ <strong>ABHA:</strong> Profile Linked</span>
                <span className="sync-item">✓ <strong>FHIR R4:</strong> Composition Validated</span>
              </div>
            )}

            <div className="packet-main-grid">
              {/* Left Column: AI Clinical Summary & SOCRATES HPI */}
              <div className="packet-left-col">
                {/* Editable Clinical Summary Card */}
                <div className="clinical-card">
                  <div className="card-top-bar">
                    <h3>📝 AI Clinical Summary Draft</h3>
                    <div className="card-btn-group">
                      {!isEditing ? (
                        <button className="btn-edit-toggle" onClick={() => setIsEditing(true)}>
                          ✏️ Edit Summary
                        </button>
                      ) : (
                        <button className="btn-edit-toggle active" onClick={() => setIsEditing(false)}>
                          👁️ View Preview
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <textarea
                      className="summary-edit-textarea"
                      rows={14}
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                    />
                  ) : (
                    <div className="summary-markdown-view">
                      <ReactMarkdown>{editedSummary || '*Clinical summary draft generating...*'}</ReactMarkdown>
                    </div>
                  )}

                  {/* Doctor Verification & Confirmation Action */}
                  <div className="doctor-disposition-box">
                    <label>Attending Physician Disposition Notes & Rx:</label>
                    <input
                      type="text"
                      className="doc-notes-input"
                      placeholder="e.g. Advised urgent ECG + Troponin I; Start Aspirin 300mg stat."
                      value={doctorNotes}
                      onChange={(e) => setDoctorNotes(e.target.value)}
                    />
                    
                    <button
                      className="btn-confirm-clinical"
                      onClick={handleSaveConfirmation}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Validating FHIR...' : '✓ Confirm Summary & Sync Record'}
                    </button>
                  </div>
                </div>

                {/* SOCRATES Breakdown */}
                <div className="clinical-card">
                  <h3>🩺 Structured SOCRATES HPI</h3>
                  <div className="socrates-detail-grid">
                    <div><strong>Site:</strong> {session.socrates_hpi?.site || '—'}</div>
                    <div><strong>Onset:</strong> {session.socrates_hpi?.onset || '—'}</div>
                    <div><strong>Character:</strong> {session.socrates_hpi?.character || '—'}</div>
                    <div><strong>Radiation:</strong> {session.socrates_hpi?.radiation || '—'}</div>
                    <div><strong>Associations:</strong> {Array.isArray(session.socrates_hpi?.associations) ? session.socrates_hpi.associations.join(', ') : '—'}</div>
                    <div><strong>Severity:</strong> {session.socrates_hpi?.severity || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Right Column: Scanned OCR Documents & Abnormal Labs */}
              <div className="packet-right-col">
                <div className="clinical-card">
                  <h3>📄 Scanned Records & OCR Data ({documents.length})</h3>

                  {documents.length === 0 ? (
                    <p className="kiosk-hint">No external reports uploaded by patient.</p>
                  ) : (
                    <div className="doctor-doc-list">
                      {documents.map((doc, idx) => {
                        const ent = doc.extracted_entities || {}
                        return (
                          <div key={idx} className="doc-detail-card">
                            <div className="doc-detail-header">
                              <span className="doc-type-pill">{doc.doc_type?.toUpperCase()}</span>
                              <span className="doc-title">{doc.file_name}</span>
                            </div>

                            {/* Lab tests with abnormal flags */}
                            {ent.lab_results?.length > 0 && (
                              <div className="doc-sub-section">
                                <span className="sub-title">Lab Results:</span>
                                {ent.lab_results.map((l, i) => (
                                  <div key={i} className={`p-lab-item ${l.is_abnormal ? 'danger' : ''}`}>
                                    <span>{l.test_name}: <strong>{l.value} {l.unit}</strong></span>
                                    {l.is_abnormal && <span className="p-flag-badge">ABNORMAL ({l.flag})</span>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Medications */}
                            {ent.medications?.length > 0 && (
                              <div className="doc-sub-section">
                                <span className="sub-title">Medications:</span>
                                {ent.medications.map((m, i) => (
                                  <div key={i} className="p-med-item">
                                    💊 {m.name} — {m.dosage} ({m.frequency})
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Original Document Preview Link */}
                            {doc.file_path && (
                              <a
                                href={`${BASE_SERVER_URL}/uploads/${doc.file_path.split(/[\/\\]/).pop()}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-view-orig-doc"
                              >
                                🔍 View Original Scanned File
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Patient Transcript Snippet */}
                <div className="clinical-card">
                  <h3>💬 Patient Intake Transcript</h3>
                  <div className="transcript-scroll">
                    {messages.map((m, i) => (
                      <div key={i} className={`transcript-row ${m.role}`}>
                        <span className="role-tag">{m.role === 'assistant' ? 'AI' : 'Patient'}:</span>
                        <span className="text">{m.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
