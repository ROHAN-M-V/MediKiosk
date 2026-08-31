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
  const [activePacketView, setActivePacketView] = useState('current') // 'current' | 'history'
  const [historySubTab, setHistorySubTab] = useState('timeline') // 'timeline' | 'medications' | 'labs' | 'notes'
  const [expandedVisitId, setExpandedVisitId] = useState(null)

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
    setActivePacketView('current')
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
  const patientHistory = sessionDetail?.patient_history || {}

  // Resolve previous visits from backend or fallback to queue matching
  const token = session?.patient_token || patient?.patient_token
  let previousVisits = patientHistory?.previous_visits || []
  if (previousVisits.length === 0 && token && Array.isArray(queue)) {
    previousVisits = queue.filter(q => q.patient_token === token && q.id !== session?.id)
  }

  const isReturningPatient = previousVisits.length > 0 || Boolean(patientHistory?.is_returning_patient)
  const cumDiagnoses = patientHistory?.cumulative_diagnoses || []
  const cumMedications = patientHistory?.cumulative_medications || []
  const cumLabs = patientHistory?.cumulative_lab_reports || []
  const prevNotes = patientHistory?.previous_doctor_notes || []
  const overallSummary = patientHistory?.overall_health_summary || 
    (isReturningPatient 
      ? `Returning patient with ${previousVisits.length} prior consultation(s) on file under Token ${token}.`
      : `First recorded consultation at MediKiosk for ${patient?.name || 'this patient'}.`)

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
          Patient Queue ({filteredQueue.length})
        </button>
        <button
          type="button"
          className={`mob-tab-btn ${mobileTab === 'detail' ? 'active' : ''}`}
          onClick={() => setMobileTab('detail')}
        >
          Consultation Packet {session ? `(${session.queue_number})` : ''}
        </button>
      </div>

      {/* Left Sidebar: Live OPD Patient Queue */}
      <aside className={`physician-queue-sidebar ${mobileTab === 'queue' ? 'mobile-visible' : 'mobile-hidden'}`}>
        <div className="queue-header">
          <div className="queue-title-row">
            <div className="queue-live-indicator">
              <span className={`live-dot ${autoRefresh ? 'pulsing' : ''}`}></span>
              <h3>OPD Waiting Queue</h3>
            </div>
            <div className="queue-controls">
              <button
                type="button"
                className={`btn-auto-poll ${autoRefresh ? 'active' : ''}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
                title="Toggle 5s live auto-refresh"
              >
                {autoRefresh ? 'LIVE' : 'PAUSED'}
              </button>
              <button className="btn-queue-refresh" onClick={onRefreshQueue} title="Refresh Queue">
                Refresh
              </button>
            </div>
          </div>

          {/* Department Filter Pills */}
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
              General OPD
            </button>
            <button
              type="button"
              className={`filter-tab-pill ${deptFilter === 'ayush' ? 'active' : ''}`}
              onClick={() => setDeptFilter('ayush')}
            >
              AYUSH
            </button>
            <button
              type="button"
              className={`filter-tab-pill urgent ${deptFilter === 'urgent' ? 'active' : ''}`}
              onClick={() => setDeptFilter('urgent')}
            >
              Priority
            </button>
          </div>
        </div>

        <div className="queue-list">
          {filteredQueue.length === 0 ? (
            <div className="queue-empty">
              <p>No patients currently waiting in {deptFilter.toUpperCase()} queue.</p>
              <span className="queue-subhint">Incoming kiosk check-ins will appear here automatically.</span>
            </div>
          ) : (
            filteredQueue.map(item => {
              const isSelected = selectedSessionId === item.id
              const isUrgent = item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
              const hasMismatchAlert = item.security_alerts?.length > 0
              const isRet = item.is_returning_patient || (item.previous_visits_count > 0)
              return (
                <div
                  key={item.id}
                  className={`queue-card ${isSelected ? 'active' : ''} ${isUrgent ? 'urgent' : ''}`}
                  onClick={() => handleSelectPatientMobile(item.id)}
                >
                  <div className="queue-card-top">
                    <span className="queue-token">{item.queue_number}</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {hasMismatchAlert && (
                        <span className="queue-tag security-flag" title="Suspicious token attempt detected">
                          MISMATCH
                        </span>
                      )}
                      {isRet && (
                        <span className="queue-tag returning-badge" title="Returning patient with prior visit records">
                          RETURNING ({item.previous_visits_count})
                        </span>
                      )}
                      {isUrgent ? (
                        <span className="queue-tag urgent">PRIORITY</span>
                      ) : (
                        <span className="queue-tag standard">{item.department === 'ayush' ? 'AYUSH' : 'OPD'}</span>
                      )}
                    </div>
                  </div>

                  <div className="queue-patient-name">{item.patient_name}</div>
                  <div className="queue-token-mini">ID: <strong>{item.patient_token || 'N/A'}</strong></div>
                  <div className="queue-patient-meta">
                    {item.patient_age} yrs • {item.patient_gender} • {item.department === 'ayush' ? 'AYUSH' : 'General'}
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
            <h3>Select a Patient from the Queue</h3>
            <p>Click on any patient in the waiting list to view their pre-consultation summary, prescription history, and symptoms.</p>
            <button
              type="button"
              className="btn-kiosk-primary"
              onClick={() => setMobileTab('queue')}
              style={{ marginTop: '16px' }}
            >
              ← Open Patient Queue
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2>{patient.name || session.patient_name}</h2>
                  {isReturningPatient && (
                    <span className="returning-pill-badge">
                      Returning Patient • {previousVisits.length} Past Visits
                    </span>
                  )}
                </div>
                <div className="identity-tags">
                  <span className="id-badge token-highlight">Patient ID: <strong>{session.patient_token || patient.patient_token}</strong></span>
                  <span className="id-badge">Ticket: <strong>{session.queue_number}</strong></span>
                  <span className="id-badge">{patient.age || session.patient_age} yrs / {patient.gender || session.patient_gender}</span>
                  <span className="id-badge">ABHA: {patient.abha_id || 'Not linked'}</span>
                  <span className="id-badge">Dept: {session.department === 'ayush' ? 'AYUSH' : 'General Medicine'}</span>
                </div>
              </div>

              <div className="packet-header-actions">
                {session.fhir_bundle && Object.keys(session.fhir_bundle).length > 0 && (
                  <button className="btn-fhir-view" onClick={() => onOpenFhir(session.fhir_bundle)}>
                    FHIR R4 Record
                  </button>
                )}
              </div>
            </div>

            {/* Primary Consultation Tab Bar */}
            <div className="packet-main-nav-tabs">
              <button
                type="button"
                className={`packet-main-nav-btn ${activePacketView === 'current' ? 'active' : ''}`}
                onClick={() => setActivePacketView('current')}
              >
                Today's Consultation & Intake
              </button>
              <button
                type="button"
                className={`packet-main-nav-btn ${activePacketView === 'history' ? 'active' : ''}`}
                onClick={() => setActivePacketView('history')}
              >
                Patient Medical History ({previousVisits.length} Past Visits)
              </button>
            </div>

            {/* Security Mismatch Warning Box */}
            {securityAlerts.length > 0 && (
              <div className="security-alert-box">
                <div className="sec-body">
                  <strong>SECURITY NOTICE: Token Mismatch Logged</strong>
                  <p>
                    A patient at the kiosk entered token <strong>{session.patient_token}</strong> but indicated the details were not theirs.
                    No private history was revealed. Please verify patient identity in person.
                  </p>
                </div>
              </div>
            )}

            {/* Red Flag Alert Box (If present) */}
            {redFlag.is_critical && (
              <div className="physician-red-flag-box">
                <div className="p-flag-body">
                  <strong>TRIAGE PRIORITY NOTICE: {redFlag.severity}</strong>
                  <p>{redFlag.reason}</p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
               VIEW 1: TODAY'S CONSULTATION & INTAKE
               ══════════════════════════════════════════════════════════ */}
            {activePacketView === 'current' && (
              <div>
                {/* Returning Patient Quick Banner */}
                {isReturningPatient && (
                  <div className="returning-patient-summary-banner">
                    <div className="ret-banner-left">
                      <span className="ret-badge">RETURNING PATIENT • {previousVisits.length} PRIOR VISITS ON RECORD</span>
                      <p className="ret-summary-text">{overallSummary}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-open-history"
                      onClick={() => setActivePacketView('history')}
                    >
                      View Complete Medical History ({previousVisits.length}) →
                    </button>
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
                        <h3>Clinical Summary Draft (Today)</h3>
                        <div className="card-btn-group">
                          {!isEditing ? (
                            <button className="btn-edit-toggle" onClick={() => setIsEditing(true)}>
                              Edit Summary
                            </button>
                          ) : (
                            <button className="btn-edit-toggle active" onClick={() => setIsEditing(false)}>
                              View Preview
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
                        <label>Attending Physician Notes & Prescription:</label>
                        <input
                          type="text"
                          className="doc-notes-input"
                          placeholder="e.g. Advised ECG; Prescribed Paracetamol 650mg TDS x 3 days."
                          value={doctorNotes}
                          onChange={(e) => setDoctorNotes(e.target.value)}
                        />
                        
                        <button
                          className="btn-confirm-clinical"
                          onClick={handleSaveConfirmation}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Validating...' : '✓ Confirm Summary & Finalize Consultation'}
                        </button>
                      </div>
                    </div>

                    {/* SOCRATES Breakdown */}
                    <div className="clinical-card">
                      <h3>Today's Presenting Symptoms</h3>
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
                      <h3>Attached Documents for Today ({documents.length})</h3>

                      {documents.length === 0 ? (
                        <p className="kiosk-hint">No external reports uploaded by patient for today's visit.</p>
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
                                    <span className="sub-title">Extracted Medications:</span>
                                    {ent.medications.map((m, i) => (
                                      <div key={i} className="p-med-item">
                                        {m.name} — {m.dosage} ({m.frequency})
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
                                    View Uploaded Document
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
                      <h3>Today's Patient Conversation</h3>
                      <div className="transcript-scroll">
                        {messages.map((m, i) => (
                          <div key={i} className={`transcript-row ${m.role}`}>
                            <span className="role-tag">{m.role === 'assistant' ? 'Assistant' : 'Patient'}:</span>
                            <span className="text">{m.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
               VIEW 2: LONGITUDINAL PATIENT MEDICAL HISTORY
               ══════════════════════════════════════════════════════════ */}
            {activePacketView === 'history' && (
              <div className="longitudinal-history-panel">
                {/* Master Health Profile Overview Card */}
                <div className="clinical-card history-overview-card">
                  <div className="card-top-bar">
                    <div>
                      <h3 style={{ fontSize: '16px' }}>Longitudinal Medical Record: {patient.name}</h3>
                      <span className="history-subtitle">
                        Permanent Patient ID: <strong>{session.patient_token}</strong> • {previousVisits.length} Prior Consultations
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-kiosk-secondary"
                      onClick={() => setActivePacketView('current')}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      ← Back to Today's Visit
                    </button>
                  </div>

                  <div className="overall-summary-box">
                    <span className="summary-box-label">Overall Health Background Summary</span>
                    <p className="summary-box-text">{overallSummary}</p>
                  </div>

                  <div className="history-meta-badges-row">
                    <div className="history-meta-pill">
                      <span className="meta-k">Total Consultations:</span>
                      <strong className="meta-v">{previousVisits.length + 1} (Including Today)</strong>
                    </div>
                    {patientHistory.first_visit_date && (
                      <div className="history-meta-pill">
                        <span className="meta-k">First Visit:</span>
                        <strong className="meta-v">{new Date(patientHistory.first_visit_date).toLocaleDateString()}</strong>
                      </div>
                    )}
                    {patientHistory.last_visit_date && (
                      <div className="history-meta-pill">
                        <span className="meta-k">Last Prior Visit:</span>
                        <strong className="meta-v">{new Date(patientHistory.last_visit_date).toLocaleDateString()}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub Navigation for History Sections */}
                <div className="history-tabs-bar">
                  <button
                    type="button"
                    className={`hist-tab-btn ${historySubTab === 'timeline' ? 'active' : ''}`}
                    onClick={() => setHistorySubTab('timeline')}
                  >
                    Past Visits & Consultations ({previousVisits.length})
                  </button>
                  <button
                    type="button"
                    className={`hist-tab-btn ${historySubTab === 'medications' ? 'active' : ''}`}
                    onClick={() => setHistorySubTab('medications')}
                  >
                    Prescribed Medications ({cumMedications.length})
                  </button>
                  <button
                    type="button"
                    className={`hist-tab-btn ${historySubTab === 'labs' ? 'active' : ''}`}
                    onClick={() => setHistorySubTab('labs')}
                  >
                    Test Reports & Lab Values ({cumLabs.length})
                  </button>
                  <button
                    type="button"
                    className={`hist-tab-btn ${historySubTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setHistorySubTab('notes')}
                  >
                    Previous Doctor Notes ({prevNotes.length})
                  </button>
                </div>

                {/* Sub Tab 1: Past Visits Timeline */}
                {historySubTab === 'timeline' && (
                  <div className="history-section-content">
                    {previousVisits.length === 0 ? (
                      <div className="no-history-box">
                        <h4>No Previous Visits Recorded</h4>
                        <p>This is the patient's first recorded consultation at MediKiosk. Details from today will be permanently added to their history once confirmed.</p>
                      </div>
                    ) : (
                      <div className="previous-visits-list">
                        {previousVisits.map((v, idx) => {
                          const isExpanded = expandedVisitId === v.id
                          const vDate = v.created_at ? new Date(v.created_at).toLocaleString() : 'Past Visit'
                          const vDisp = v.clinician_disposition || {}
                          const vSoc = v.socrates_hpi || {}
                          const vDocs = v.documents || []

                          return (
                            <div key={v.id || idx} className="visit-history-card">
                              <div
                                className="visit-card-header"
                                onClick={() => setExpandedVisitId(isExpanded ? null : v.id)}
                              >
                                <div className="visit-header-left">
                                  <span className="visit-date-badge">{vDate}</span>
                                  <span className="visit-dept-badge">{v.department === 'ayush' ? 'AYUSH' : 'General Medicine'}</span>
                                  <span className="visit-ticket-badge">Ticket: {v.queue_number}</span>
                                  {v.status === 'physician_reviewed' && (
                                    <span className="visit-status-badge reviewed">✓ Physician Verified</span>
                                  )}
                                </div>
                                <div className="visit-header-right">
                                  <span className="visit-expand-indicator">{isExpanded ? '▲ Collapse' : '▼ View Details'}</span>
                                </div>
                              </div>

                              <div className="visit-summary-preview">
                                <strong>Chief Concern:</strong> {vSoc.chief_complaint || 'General consultation'}
                                {vDisp.notes && (
                                  <span className="visit-rx-snippet">
                                    • <strong>Doctor Rx/Notes:</strong> {vDisp.notes}
                                  </span>
                                )}
                              </div>

                              {/* Expanded Full Visit Content */}
                              {isExpanded && (
                                <div className="visit-expanded-body">
                                  <div className="visit-detail-grid">
                                    <div className="visit-sub-box">
                                      <h5>Presenting Symptoms (SOCRATES)</h5>
                                      <ul className="visit-bullet-list">
                                        <li><strong>Chief Complaint:</strong> {vSoc.chief_complaint || '—'}</li>
                                        <li><strong>Site / Location:</strong> {vSoc.site || '—'}</li>
                                        <li><strong>Onset & Duration:</strong> {vSoc.onset || '—'}</li>
                                        <li><strong>Character / Quality:</strong> {vSoc.character || '—'}</li>
                                        <li><strong>Severity:</strong> {vSoc.severity ? `${vSoc.severity} / 10` : '—'}</li>
                                        <li><strong>Associated Symptoms:</strong> {Array.isArray(vSoc.associations) ? vSoc.associations.join(', ') : '—'}</li>
                                      </ul>
                                    </div>

                                    <div className="visit-sub-box">
                                      <h5>Physician Disposition & Treatment</h5>
                                      <p style={{ fontSize: '12.5px', color: '#e4e4e7', marginBottom: '8px' }}>
                                        <strong>Attending Doctor:</strong> {vDisp.assigned_doctor || 'Attending Physician'}
                                      </p>
                                      <div className="past-notes-quote">
                                        {vDisp.notes || 'Consultation verified and signed off.'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Past Attached Documents */}
                                  {vDocs.length > 0 && (
                                    <div className="visit-docs-sub-box">
                                      <h5>Prescriptions & Lab Reports from this Visit ({vDocs.length})</h5>
                                      <div className="doc-mini-cards-row">
                                        {vDocs.map((d, dIdx) => (
                                          <div key={dIdx} className="doc-mini-card">
                                            <span className="doc-mini-name">{d.file_name}</span>
                                            <span className="doc-mini-type">{d.doc_type?.toUpperCase()}</span>
                                            {d.file_path && (
                                              <a
                                                href={`${BASE_SERVER_URL}/uploads/${d.file_path.split(/[\/\\]/).pop()}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn-view-doc-small"
                                              >
                                                View Document
                                              </a>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab 2: Cumulative Medications */}
                {historySubTab === 'medications' && (
                  <div className="history-section-content">
                    {cumMedications.length === 0 ? (
                      <div className="no-history-box">
                        <h4>No Historical Medications on Record</h4>
                        <p>No active or past medications have been recorded for this patient yet.</p>
                      </div>
                    ) : (
                      <div className="history-table-wrapper">
                        <table className="history-data-table">
                          <thead>
                            <tr>
                              <th>Medication Name</th>
                              <th>Dosage</th>
                              <th>Frequency</th>
                              <th>Source / Record</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cumMedications.map((m, idx) => (
                              <tr key={idx}>
                                <td><strong>{m.name}</strong></td>
                                <td>{m.dosage || '—'}</td>
                                <td>{m.frequency || '—'}</td>
                                <td><span className="table-source-tag">{m.source}</span></td>
                                <td>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab 3: Historical Lab Reports */}
                {historySubTab === 'labs' && (
                  <div className="history-section-content">
                    {cumLabs.length === 0 ? (
                      <div className="no-history-box">
                        <h4>No Previous Lab Tests on File</h4>
                        <p>No historical blood tests or lab reports have been scanned for this patient.</p>
                      </div>
                    ) : (
                      <div className="history-table-wrapper">
                        <table className="history-data-table">
                          <thead>
                            <tr>
                              <th>Test Name</th>
                              <th>Result Value</th>
                              <th>Reference Range</th>
                              <th>Status</th>
                              <th>Source Document</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cumLabs.map((l, idx) => (
                              <tr key={idx} className={l.is_abnormal ? 'row-abnormal' : ''}>
                                <td><strong>{l.test_name}</strong></td>
                                <td><strong style={{ color: l.is_abnormal ? 'var(--alert-red)' : '#ffffff' }}>{l.value} {l.unit}</strong></td>
                                <td>{l.reference_range || 'Standard'}</td>
                                <td>
                                  {l.is_abnormal ? (
                                    <span className="table-flag-badge danger">ABNORMAL ({l.flag || 'HIGH'})</span>
                                  ) : (
                                    <span className="table-flag-badge normal">NORMAL</span>
                                  )}
                                </td>
                                <td>{l.file_name || 'Lab Report'}</td>
                                <td>{l.visit_date ? new Date(l.visit_date).toLocaleDateString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab 4: Previous Doctor Notes */}
                {historySubTab === 'notes' && (
                  <div className="history-section-content">
                    {prevNotes.length === 0 ? (
                      <div className="no-history-box">
                        <h4>No Previous Doctor Notes</h4>
                        <p>No physician notes have been recorded from prior visits yet.</p>
                      </div>
                    ) : (
                      <div className="doctor-notes-history-list">
                        {prevNotes.map((n, idx) => (
                          <div key={idx} className="doc-note-history-item">
                            <div className="note-item-header">
                              <strong>{n.doctor_name || 'Attending Physician'}</strong>
                              <span className="note-date">Ticket {n.queue_number} • {n.date ? new Date(n.date).toLocaleString() : 'Past Visit'}</span>
                            </div>
                            <div className="note-item-body">
                              {n.notes}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
