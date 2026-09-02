import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { BASE_SERVER_URL } from '../apiConfig'

export default function PhysicianConsole({
  queue = [],
  selectedSessionId,
  onSelectSession,
  sessionDetail,
  onConfirmSummary,
  onUpdateStatus,
  doctorUser,
  onOpenFhir,
  isLoading,
  onRefreshQueue
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [prescriptions, setPrescriptions] = useState([
    { id: 1, name: '', dosage: '', frequency: '', duration: '' }
  ])
  const [doctorNotes, setDoctorNotes] = useState('')
  const [followUp, setFollowUp] = useState('5 days')

  const [opdSection, setOpdSection] = useState('ongoing') // 'ongoing' | 'completed'
  const [searchQuery, setSearchQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState('all') // 'all' | 'allopathic' | 'ayush' | 'urgent'
  const [mobileTab, setMobileTab] = useState('queue') // 'queue' | 'detail'
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activePacketView, setActivePacketView] = useState('current') // 'current' | 'history'
  const [historySubTab, setHistorySubTab] = useState('timeline') // 'timeline' | 'medications' | 'labs' | 'notes'
  const [expandedVisitId, setExpandedVisitId] = useState(null)
  const [verificationToast, setVerificationToast] = useState(null)

  const session = sessionDetail?.session
  const patient = sessionDetail?.patient || {}
  const documents = sessionDetail?.documents || []
  const messages = sessionDetail?.messages || []
  const redFlag = session?.red_flag_alert || {}
  const securityAlerts = sessionDetail?.security_alerts || []
  const patientHistory = sessionDetail?.patient_history || {}

  // Submission & verification time formatting helpers
  function formatSubmissionTime(timestamp) {
    if (!timestamp) return 'Today'
    try {
      let isoStr = timestamp
      if (typeof timestamp === 'string' && timestamp.includes(' ') && !timestamp.includes('T')) {
        isoStr = timestamp.replace(' ', 'T') + 'Z'
      }
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return 'Today'
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Today'
    }
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return 'Recently'
    try {
      let isoStr = timestamp
      if (typeof timestamp === 'string' && timestamp.includes(' ') && !timestamp.includes('T')) {
        isoStr = timestamp.replace(' ', 'T') + 'Z'
      }
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return 'Recently'
      const isToday = new Date().toDateString() === d.toDateString()
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return isToday ? `Today at ${timeStr}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`
    } catch {
      return 'Recently'
    }
  }

  // Sync session state when selected session changes
  useEffect(() => {
    if (session) {
      setEditedSummary(session.structured_summary || '')
      const disp = session.clinician_disposition || {}
      setDiagnosis(disp.diagnosis || '')
      setDoctorNotes(disp.notes || '')
      setFollowUp(disp.follow_up || '5 days')
      if (Array.isArray(disp.prescriptions) && disp.prescriptions.length > 0) {
        setPrescriptions(disp.prescriptions.map((p, idx) => ({ id: idx + 1, ...p })))
      } else {
        setPrescriptions([{ id: 1, name: '', dosage: '', frequency: '', duration: '' }])
      }
    }
  }, [session?.id])

  // Multi-user real-time polling: Refresh queue every 6s if enabled
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      onRefreshQueue()
    }, 6000)
    return () => clearInterval(interval)
  }, [autoRefresh, onRefreshQueue])

  // OPD Statistics: Ongoing (Awaiting Doctor Verification) vs Completed (Verified)
  const completedList = queue.filter(
    item => item.status === 'completed' || item.status === 'physician_reviewed'
  )
  const ongoingList = queue.filter(
    item => item.status !== 'completed' && item.status !== 'physician_reviewed'
  )
  const waitingCount = ongoingList.filter(
    item => item.status === 'waiting' || !item.status || item.status === 'urgent_triage'
  ).length
  const inConsultationCount = ongoingList.filter(item => item.status === 'in_consultation').length
  const urgentCount = ongoingList.filter(
    item => item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
  ).length
  const totalToday = queue.length

  // Filter list based on active OPD section, search query, and department filter
  const activeBaseList = opdSection === 'ongoing' ? ongoingList : completedList
  const filteredList = activeBaseList.filter(item => {
    // Dept filter
    if (deptFilter === 'urgent') {
      const isUrgent = item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
      if (!isUrgent) return false
    } else if (deptFilter === 'allopathic') {
      if (item.department !== 'allopathic') return false
    } else if (deptFilter === 'ayush') {
      if (item.department !== 'ayush') return false
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchName = item.patient_name?.toLowerCase().includes(q)
      const matchToken = item.patient_token?.toLowerCase().includes(q)
      const matchTicket = item.queue_number?.toLowerCase().includes(q)
      const matchComplaint = item.socrates_hpi?.chief_complaint?.toLowerCase().includes(q)
      if (!matchName && !matchToken && !matchTicket && !matchComplaint) return false
    }

    return true
  })

  function handleSelectPatient(id) {
    onSelectSession(id)
    setMobileTab('detail')
    setActivePacketView('current')
  }

  function handleStartExamination() {
    if (!session?.id) return
    if (onUpdateStatus) {
      onUpdateStatus(session.id, 'in_consultation')
    }
  }

  function handleVerifyAndComplete() {
    if (!session?.id) return
    const cleanedRx = prescriptions.filter(p => p.name && p.name.trim())
    onConfirmSummary(session.id, editedSummary, doctorNotes, diagnosis, cleanedRx, followUp)
    setIsEditing(false)
    setVerificationToast(`✓ Patient ${session.patient_name || ''} (${session.queue_number}) verified and moved to Completed.`)
    setTimeout(() => setVerificationToast(null), 6000)
  }

  // Prescription builder helpers
  function addPrescriptionRow() {
    setPrescriptions(prev => [
      ...prev,
      { id: Date.now(), name: '', dosage: '', frequency: '', duration: '' }
    ])
  }

  function removePrescriptionRow(id) {
    setPrescriptions(prev => {
      const updated = prev.filter(p => p.id !== id)
      return updated.length > 0 ? updated : [{ id: 1, name: '', dosage: '', frequency: '', duration: '' }]
    })
  }

  function updatePrescriptionField(id, field, val) {
    setPrescriptions(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: val } : p))
    )
  }

  // Longitudinal history helpers
  const token = session?.patient_token || patient?.patient_token
  let previousVisits = patientHistory?.previous_visits || []
  if (previousVisits.length === 0 && token && Array.isArray(queue)) {
    previousVisits = queue.filter(q => q.patient_token === token && q.id !== session?.id)
  }
  const isReturningPatient = previousVisits.length > 0 || Boolean(patientHistory?.is_returning_patient)
  const cumMedications = patientHistory?.cumulative_medications || []
  const cumLabs = patientHistory?.cumulative_lab_reports || []
  const prevNotes = patientHistory?.previous_doctor_notes || []
  const overallSummary = patientHistory?.overall_health_summary ||
    (isReturningPatient
      ? `Returning patient with ${previousVisits.length} prior consultation(s) on file under Token ${token}.`
      : `First recorded consultation at MediKiosk for ${patient?.name || 'this patient'}.`)

  const isSessionCompleted = session?.status === 'completed' || session?.status === 'physician_reviewed'

  return (
    <div className="physician-dashboard-layout">
      {/* ─── Top Dashboard Statistics Bar ────────────────────────── */}
      <div className="physician-stats-banner">
        <div className="stats-banner-inner">
          <div className="stat-card total">
            <span className="stat-label">Total OPD Today</span>
            <span className="stat-value">{totalToday}</span>
          </div>
          <div className="stat-card waiting">
            <span className="stat-label">Ongoing Queue</span>
            <span className="stat-value">{ongoingList.length}</span>
          </div>
          <div className="stat-card examining">
            <span className="stat-label">In Examination</span>
            <span className="stat-value">{inConsultationCount}</span>
          </div>
          <div className="stat-card urgent">
            <span className="stat-label">Priority / Triage</span>
            <span className="stat-value">{urgentCount}</span>
          </div>
          <div className="stat-card completed">
            <span className="stat-label">Completed</span>
            <span className="stat-value">{completedList.length}</span>
          </div>
        </div>
      </div>

      {/* ─── Mobile View Switcher ─────────────────────────────────── */}
      <div className="physician-mobile-tabs">
        <button
          type="button"
          className={`btn-phys-mobile-tab ${mobileTab === 'queue' ? 'active' : ''}`}
          onClick={() => setMobileTab('queue')}
        >
          📋 OPD Queue ({filteredList.length})
        </button>
        <button
          type="button"
          className={`btn-phys-mobile-tab ${mobileTab === 'detail' ? 'active' : ''}`}
          onClick={() => setMobileTab('detail')}
        >
          🩺 Patient Details {session ? `(${session.queue_number})` : ''}
        </button>
      </div>

      <div className="physician-dashboard-body">
        {/* ══════════════════════════════════════════════════════════
           LEFT SIDEBAR: OPD CURRENT VS COMPLETED
           ══════════════════════════════════════════════════════════ */}
        <aside className={`physician-queue-sidebar ${mobileTab === 'queue' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <div className="queue-sidebar-header">
            <div>
              <h2>OPD Consultations</h2>
              <span className="queue-doctor-badge">
                {doctorUser?.name || 'Attending Physician'}
              </span>
            </div>
            <div className="queue-top-actions">
              <button
                type="button"
                className={`btn-auto-poll ${autoRefresh ? 'active' : ''}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
                title="Toggle live queue polling"
              >
                {autoRefresh ? '● LIVE' : '○ PAUSED'}
              </button>
              <button
                type="button"
                className="btn-queue-refresh"
                onClick={onRefreshQueue}
                title="Refresh queue now"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* OPD Section Divider: Ongoing vs Completed */}
          <div className="opd-section-toggle-bar">
            <button
              type="button"
              className={`opd-section-btn ${opdSection === 'ongoing' ? 'active' : ''}`}
              onClick={() => setOpdSection('ongoing')}
              title="Patients with submitted forms awaiting verification"
            >
              <span className="sec-title">Ongoing</span>
              <span className="sec-badge ongoing">{ongoingList.length}</span>
            </button>
            <button
              type="button"
              className={`opd-section-btn ${opdSection === 'completed' ? 'active' : ''}`}
              onClick={() => setOpdSection('completed')}
              title="Verified consultations (read-only history)"
            >
              <span className="sec-title">Completed</span>
              <span className="sec-badge completed">{completedList.length}</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="queue-search-container">
            <input
              type="text"
              className="queue-search-input"
              placeholder="Search name, token (PT-...), ticket..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter Tabs */}
          <div className="queue-filter-tabs">
            <button
              type="button"
              className={`filter-tab ${deptFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDeptFilter('all')}
            >
              All ({activeBaseList.length})
            </button>
            <button
              type="button"
              className={`filter-tab ${deptFilter === 'allopathic' ? 'active' : ''}`}
              onClick={() => setDeptFilter('allopathic')}
            >
              General OPD
            </button>
            <button
              type="button"
              className={`filter-tab ${deptFilter === 'ayush' ? 'active' : ''}`}
              onClick={() => setDeptFilter('ayush')}
            >
              AYUSH
            </button>
            <button
              type="button"
              className={`filter-tab ${deptFilter === 'urgent' ? 'active' : ''}`}
              onClick={() => setDeptFilter('urgent')}
            >
              Priority
            </button>
          </div>

          {/* Queue Patient Cards Stream */}
          <div className="queue-items-list">
            {filteredList.length === 0 ? (
              <div className="queue-empty-state">
                {opdSection === 'ongoing' ? (
                  <>
                    <div className="empty-icon">✓</div>
                    <h4>No Ongoing Submissions</h4>
                    <p>All submitted OPD forms have been reviewed and verified by the doctor.</p>
                  </>
                ) : (
                  <>
                    <div className="empty-icon">📋</div>
                    <h4>No Completed Records</h4>
                    <p>Verified consultations will appear here as read-only summaries.</p>
                  </>
                )}
                {searchQuery && (
                  <button
                    type="button"
                    className="btn-reset-filter"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear Search Filter
                  </button>
                )}
              </div>
            ) : (
              filteredList.map(item => {
                const isSelected = selectedSessionId === item.id
                const isUrgent = item.red_flag_alert?.is_critical || item.status === 'urgent_triage'
                const isExamining = item.status === 'in_consultation'
                const isItemCompleted = item.status === 'completed' || item.status === 'physician_reviewed'
                const isRet = item.is_returning_patient || item.previous_visits_count > 0

                let statusLabel = '⏳ AWAITING VERIFICATION'
                let statusClass = 'waiting'
                if (isItemCompleted) {
                  statusLabel = '✓ VERIFIED'
                  statusClass = 'completed'
                } else if (isExamining) {
                  statusLabel = '🩺 IN EXAMINATION'
                  statusClass = 'in_consultation'
                } else if (isUrgent) {
                  statusLabel = '⚡ PRIORITY'
                  statusClass = 'urgent'
                }

                return (
                  <div
                    key={item.id}
                    className={`queue-card ${isSelected ? 'selected' : ''} ${isUrgent && !isItemCompleted ? 'card-urgent' : ''}`}
                    onClick={() => handleSelectPatient(item.id)}
                  >
                    <div className="queue-card-top">
                      <span className="queue-token-text">{item.queue_number}</span>
                      <div className="queue-tags-cluster">
                        {isRet && (
                          <span className="queue-tag-ret">
                            RETURNING ({item.previous_visits_count})
                          </span>
                        )}
                        <span className={`queue-status-tag ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    <div className="queue-patient-name">{item.patient_name}</div>
                    <div className="queue-patient-token">
                      Token ID: <strong>{item.patient_token || 'N/A'}</strong>
                    </div>

                    <div className="queue-patient-meta">
                      {item.patient_age} yrs • {item.patient_gender} • {item.department === 'ayush' ? 'AYUSH' : 'General OPD'}
                    </div>

                    <div className="queue-submission-time">
                      🕒 Submitted: {formatSubmissionTime(item.created_at)}
                    </div>

                    <div className="queue-complaint-snippet">
                      {isItemCompleted ? (
                        item.clinician_disposition?.diagnosis ? (
                          <>Verified Dx: <strong>{item.clinician_disposition.diagnosis}</strong></>
                        ) : (
                          <><em>Verified consultation record</em></>
                        )
                      ) : (
                        item.socrates_hpi?.chief_complaint ? (
                          <>Complaint: <em>{item.socrates_hpi.chief_complaint}</em></>
                        ) : 'Submitted intake'
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════════
           RIGHT MAIN AREA: CLINICAL PACKET & CONSULTATION WORKFLOW
           ══════════════════════════════════════════════════════════ */}
        <main className={`physician-detail-area ${mobileTab === 'detail' ? 'mobile-visible' : 'mobile-hidden'}`}>
          {!session ? (
            <div className="no-patient-selected">
              <div className="no-patient-icon">🩺</div>
              <h3>Select a Patient from the Queue</h3>
              <p>Click on any patient in the OPD queue to review their symptoms, medical records, and manage their consultation.</p>
              <button
                type="button"
                className="btn-kiosk-primary"
                onClick={() => setMobileTab('queue')}
                style={{ marginTop: '16px', maxWidth: '240px' }}
              >
                ← Open OPD Queue
              </button>
            </div>
          ) : (
            <div className="patient-packet-scroll">
              {/* Mobile Back to Queue Bar */}
              <div className="mobile-packet-back-bar">
                <button
                  type="button"
                  className="btn-mobile-back"
                  onClick={() => setMobileTab('queue')}
                >
                  ← Back to Patient Queue
                </button>
              </div>

              {/* Patient Identity Bar with Live Status & Quick Action */}
              <div className="patient-packet-header">
                <div className="packet-identity">
                  <div className="patient-name-row">
                    <h2>{patient.name || session.patient_name}</h2>
                    {isReturningPatient && (
                      <span className="returning-pill-badge">
                        Returning Patient • {previousVisits.length} Past Visits
                      </span>
                    )}
                    <span className={`status-pill ${session.status}`}>
                      {isSessionCompleted
                        ? '✓ Verified & Completed'
                        : session.status === 'in_consultation'
                        ? '🩺 In Examination'
                        : session.status === 'urgent_triage'
                        ? '⚡ Priority Triage'
                        : '⏳ Awaiting Verification'}
                    </span>
                  </div>

                  <div className="identity-tags">
                    <span className="id-badge token-highlight">
                      Token ID: <strong>{session.patient_token || patient.patient_token}</strong>
                    </span>
                    <span className="id-badge">
                      Ticket: <strong>{session.queue_number}</strong>
                    </span>
                    <span className="id-badge">
                      {patient.age || session.patient_age} yrs / {patient.gender || session.patient_gender}
                    </span>
                    <span className="id-badge">
                      ABHA: {patient.abha_id || 'Not linked'}
                    </span>
                    <span className="id-badge">
                      Dept: {session.department === 'ayush' ? 'AYUSH' : 'General Medicine (OPD)'}
                    </span>
                  </div>
                </div>

                {/* Status Action Controls */}
                <div className="packet-header-actions">
                  {!isSessionCompleted && (
                    session.status !== 'in_consultation' ? (
                      <button
                        type="button"
                        className="btn-status-action start"
                        onClick={handleStartExamination}
                      >
                        ▶ Start Examination
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-status-action pause"
                        onClick={() => onUpdateStatus(session.id, 'waiting')}
                        title="Put back on waiting list if needed"
                      >
                        ⏸ Put On Hold
                      </button>
                    )
                  )}

                  {session.fhir_bundle && Object.keys(session.fhir_bundle).length > 0 && (
                    <button
                      type="button"
                      className="btn-fhir-view"
                      onClick={() => onOpenFhir(session.fhir_bundle)}
                    >
                      FHIR R4 Record
                    </button>
                  )}
                </div>
              </div>

              {/* Consultation vs History Nav Tabs */}
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
                  Medical History ({previousVisits.length} Past Visits)
                </button>
              </div>

              {/* Toast banner after successful verification */}
              {verificationToast && (
                <div className="verified-success-banner">
                  <div>
                    <strong>{verificationToast}</strong>
                  </div>
                  {ongoingList.length > 0 && (
                    <button
                      type="button"
                      className="btn-next-patient"
                      onClick={() => {
                        onSelectSession(ongoingList[0].id)
                        setVerificationToast(null)
                      }}
                    >
                      Next Ongoing Patient ({ongoingList.length}) →
                    </button>
                  )}
                </div>
              )}

              {/* Security Mismatch Warning Box */}
              {securityAlerts.length > 0 && (
                <div className="security-alert-box">
                  <strong>SECURITY NOTICE: Token Mismatch Logged</strong>
                  <p>
                    A patient at the kiosk entered token <strong>{session.patient_token}</strong> but indicated details were not theirs. Please verify identity in person.
                  </p>
                </div>
              )}

              {/* Emergency Red Flag Notice */}
              {redFlag.is_critical && (
                <div className="physician-red-flag-box">
                  <strong>PRIORITY TRIAGE NOTICE: {redFlag.severity || 'HIGH EMERGENCY'}</strong>
                  <p>{redFlag.reason}</p>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────
                 VIEW 1: TODAY'S CONSULTATION & WORKFLOW
                 ────────────────────────────────────────────────────────── */}
              {activePacketView === 'current' && (
                <div>
                  {/* Returning Patient Notice */}
                  {isReturningPatient && (
                    <div className="returning-patient-summary-banner">
                      <div className="ret-banner-left">
                        <span className="ret-badge">
                          RETURNING PATIENT • {previousVisits.length} PRIOR VISITS ON RECORD
                        </span>
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

                  {/* Completed / Verified Banner */}
                  {isSessionCompleted && (
                    <div className="mock-sync-banner">
                      <span className="sync-item">✓ <strong>Status:</strong> Verified Consultation</span>
                      <span className="sync-item">🔒 <strong>Read-Only Record</strong></span>
                      <span className="sync-item">🕒 <strong>Verified:</strong> {formatDateTime(session.updated_at || session.created_at)}</span>
                      <span className="sync-item">🩺 <strong>Doctor:</strong> Dr. {session.clinician_disposition?.physician_name || doctorUser?.name?.replace(/^Dr\.\s*/i, '') || 'Attending'}</span>
                    </div>
                  )}

                  <div className="packet-main-grid">
                    {/* Left Column: Clinical Summary + Doctor Disposition */}
                    <div className="packet-left-col">
                      {/* Clinical Summary Draft Card */}
                      <div className="clinical-card">
                        <div className="card-top-bar">
                          <h3>AI Clinical Intake Summary</h3>
                          {!isSessionCompleted && (
                            <button
                              type="button"
                              className="btn-edit-toggle"
                              onClick={() => setIsEditing(!isEditing)}
                            >
                              {isEditing ? 'View Formatted Preview' : 'Edit Summary Text'}
                            </button>
                          )}
                        </div>

                        {isEditing && !isSessionCompleted ? (
                          <textarea
                            className="summary-edit-textarea"
                            rows={12}
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                          />
                        ) : (
                          <div className="summary-markdown-view">
                            <ReactMarkdown>
                              {editedSummary || '*Clinical summary draft generating...*'}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* Doctor Consultation Card: READ-ONLY IF COMPLETED vs ACTIVE VERIFICATION IF ONGOING */}
                      {isSessionCompleted ? (
                        /* READ-ONLY COMPLETED CONSULTATION SUMMARY */
                        <div className="clinical-card consultation-outcome-card">
                          <div className="card-top-bar">
                            <h3>Verified Consultation & Prescription Details</h3>
                            <span className="doctor-assigned-tag">
                              Verified by Dr. {session.clinician_disposition?.physician_name || doctorUser?.name?.replace(/^Dr\.\s*/i, '') || 'Attending'}
                            </span>
                          </div>

                          {/* Verified Diagnosis */}
                          <div className="consult-readonly-field">
                            <span className="readonly-label">Working / Final Diagnosis</span>
                            <div className="readonly-value-box highlight-dx">
                              {session.clinician_disposition?.diagnosis || diagnosis || 'No specific diagnosis recorded.'}
                            </div>
                          </div>

                          {/* Verified Prescriptions */}
                          <div className="consult-readonly-field">
                            <span className="readonly-label">Verified Prescriptions</span>
                            {prescriptions.filter(p => p.name && p.name.trim()).length > 0 ? (
                              <div className="readonly-rx-table">
                                <div className="readonly-rx-head">
                                  <span>Medicine Name</span>
                                  <span>Dosage</span>
                                  <span>Frequency</span>
                                  <span>Duration</span>
                                </div>
                                {prescriptions.filter(p => p.name && p.name.trim()).map((rx, idx) => (
                                  <div key={idx} className="readonly-rx-row">
                                    <strong>{rx.name}</strong>
                                    <span>{rx.dosage || '—'}</span>
                                    <span>{rx.frequency || '—'}</span>
                                    <span>{rx.duration || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="readonly-empty-text">No medications prescribed for this visit.</div>
                            )}
                          </div>

                          {/* Doctor Notes */}
                          <div className="consult-readonly-field">
                            <span className="readonly-label">Doctor Notes & Advice to Patient</span>
                            <div className="readonly-value-box">
                              {session.clinician_disposition?.notes || doctorNotes || 'No additional advice recorded.'}
                            </div>
                          </div>

                          {/* Follow-Up */}
                          <div className="consult-readonly-field">
                            <span className="readonly-label">Recommended Follow-up</span>
                            <div className="readonly-value-inline">
                              <strong>{session.clinician_disposition?.follow_up || followUp || 'As needed / SOS'}</strong>
                            </div>
                          </div>

                          {/* Read-Only Lock Footer */}
                          <div className="consult-completed-footer">
                            <span className="lock-tag">🔒 Read-Only Record</span>
                            <span className="completed-subtext">
                              This OPD consultation has been verified and permanently locked in hospital records. It cannot be re-verified or modified.
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* ACTIVE ONGOING CONSULTATION & VERIFICATION FORM */
                        <div className="clinical-card consultation-outcome-card">
                          <div className="card-top-bar">
                            <h3>Attending Physician Consultation</h3>
                            <span className="doctor-assigned-tag">
                              Dr. {doctorUser?.name?.replace(/^Dr\.\s*/i, '') || 'Attending'}
                            </span>
                          </div>

                          {/* Working / Final Diagnosis */}
                          <div className="consult-form-group">
                            <label>Working / Final Diagnosis *</label>
                            <input
                              type="text"
                              className="consult-input"
                              placeholder="e.g. Acute Bronchitis, Costochondritis, Hypertension Stage 1"
                              value={diagnosis}
                              onChange={(e) => setDiagnosis(e.target.value)}
                            />
                          </div>

                          {/* Prescriptions Builder */}
                          <div className="consult-form-group">
                            <div className="rx-header-row">
                              <label>Prescriptions & Medications</label>
                              <button
                                type="button"
                                className="btn-add-rx"
                                onClick={addPrescriptionRow}
                              >
                                + Add Medicine
                              </button>
                            </div>

                            <div className="rx-table-container">
                              <div className="rx-table-header">
                                <span>Medicine Name</span>
                                <span>Dosage</span>
                                <span>Frequency</span>
                                <span>Duration</span>
                                <span></span>
                              </div>
                              {prescriptions.map((rx) => (
                                <div key={rx.id} className="rx-table-row">
                                  <input
                                    type="text"
                                    placeholder="e.g. Paracetamol"
                                    value={rx.name}
                                    onChange={(e) => updatePrescriptionField(rx.id, 'name', e.target.value)}
                                    className="rx-input"
                                  />
                                  <input
                                    type="text"
                                    placeholder="650mg"
                                    value={rx.dosage}
                                    onChange={(e) => updatePrescriptionField(rx.id, 'dosage', e.target.value)}
                                    className="rx-input"
                                  />
                                  <input
                                    type="text"
                                    placeholder="1-0-1 after food"
                                    value={rx.frequency}
                                    onChange={(e) => updatePrescriptionField(rx.id, 'frequency', e.target.value)}
                                    className="rx-input"
                                  />
                                  <input
                                    type="text"
                                    placeholder="5 days"
                                    value={rx.duration}
                                    onChange={(e) => updatePrescriptionField(rx.id, 'duration', e.target.value)}
                                    className="rx-input"
                                  />
                                  <button
                                    type="button"
                                    className="btn-remove-rx"
                                    onClick={() => removePrescriptionRow(rx.id)}
                                    title="Remove medication"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Doctor Notes & Clinical Advice */}
                          <div className="consult-form-group">
                            <label>Doctor Notes & Advice to Patient</label>
                            <textarea
                              className="consult-textarea"
                              rows={3}
                              placeholder="e.g. Advised rest and warm fluids. Return immediately if chest tightness worsens or dyspnea occurs."
                              value={doctorNotes}
                              onChange={(e) => setDoctorNotes(e.target.value)}
                            />
                          </div>

                          {/* Follow-up Timeline */}
                          <div className="consult-form-group">
                            <label>Recommended Follow-Up</label>
                            <input
                              type="text"
                              className="consult-input"
                              placeholder="e.g. 5 days, or SOS if fever persists"
                              value={followUp}
                              onChange={(e) => setFollowUp(e.target.value)}
                            />
                          </div>

                          {/* Verify & Complete Button */}
                          <div className="consult-action-footer">
                            <button
                              type="button"
                              className="btn-finalize-consultation"
                              onClick={handleVerifyAndComplete}
                              disabled={isLoading}
                            >
                              {isLoading ? 'Verifying...' : '✓ Verify & Complete Consultation'}
                            </button>
                            <span className="finalize-subtext">
                              Verifies submitted details, records diagnosis & prescriptions, and automatically moves instance to Completed.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Presenting Symptoms Breakdown */}
                      <div className="clinical-card">
                        <h3>Presenting Symptoms Breakdown</h3>
                        <div className="socrates-detail-grid">
                          <div><strong>Main Concern:</strong> {session.socrates_hpi?.chief_complaint || '—'}</div>
                          <div><strong>Location / Site:</strong> {session.socrates_hpi?.site || '—'}</div>
                          <div><strong>Onset:</strong> {session.socrates_hpi?.onset || '—'}</div>
                          <div><strong>Character:</strong> {session.socrates_hpi?.character || '—'}</div>
                          <div><strong>Radiation:</strong> {session.socrates_hpi?.radiation || '—'}</div>
                          <div><strong>Associations:</strong> {Array.isArray(session.socrates_hpi?.associations) ? session.socrates_hpi.associations.join(', ') : '—'}</div>
                          <div><strong>Timing:</strong> {session.socrates_hpi?.timing || '—'}</div>
                          <div><strong>Severity:</strong> {session.socrates_hpi?.severity || '—'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Scanned Documents & Conversation */}
                    <div className="packet-right-col">
                      {/* Attached Documents */}
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

                                  {/* Extracted medications */}
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

                                  {doc.file_path && (
                                    <a
                                      href={`${BASE_SERVER_URL}/uploads/${doc.file_path.split(/[\/\\]/).pop()}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="btn-view-orig-doc"
                                    >
                                      View Uploaded Document ↗
                                    </a>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Patient Kiosk Conversation */}
                      <div className="clinical-card">
                        <h3>Patient Kiosk Conversation ({messages.length} messages)</h3>
                        <div className="transcript-scroll">
                          {messages.length === 0 ? (
                            <p className="kiosk-hint">No messages recorded.</p>
                          ) : (
                            messages.map((m, i) => (
                              <div key={i} className={`transcript-row ${m.role}`}>
                                <span className="role-tag">
                                  {m.role === 'assistant' ? 'Kiosk' : 'Patient'}:
                                </span>
                                <span className="text">{m.content}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────
                 VIEW 2: LONGITUDINAL PATIENT HISTORY
                 ────────────────────────────────────────────────────────── */}
              {activePacketView === 'history' && (
                <div className="longitudinal-history-panel">
                  <div className="clinical-card history-overview-card">
                    <div className="card-top-bar">
                      <div>
                        <h3>Longitudinal Medical Record: {patient.name}</h3>
                        <span className="history-subtitle">
                          Patient ID: <strong>{session.patient_token}</strong> • {previousVisits.length} Prior Consultations
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-kiosk-secondary"
                        onClick={() => setActivePacketView('current')}
                      >
                        ← Back to Today's Visit
                      </button>
                    </div>

                    <div className="overall-summary-box">
                      <span className="summary-box-label">Cumulative Health History Summary</span>
                      <p className="summary-box-text">{overallSummary}</p>
                    </div>
                  </div>

                  {/* Sub Navigation for History */}
                  <div className="history-tabs-bar">
                    <button
                      type="button"
                      className={`hist-tab-btn ${historySubTab === 'timeline' ? 'active' : ''}`}
                      onClick={() => setHistorySubTab('timeline')}
                    >
                      Past Consultations ({previousVisits.length})
                    </button>
                    <button
                      type="button"
                      className={`hist-tab-btn ${historySubTab === 'medications' ? 'active' : ''}`}
                      onClick={() => setHistorySubTab('medications')}
                    >
                      Past Medications ({cumMedications.length})
                    </button>
                    <button
                      type="button"
                      className={`hist-tab-btn ${historySubTab === 'labs' ? 'active' : ''}`}
                      onClick={() => setHistorySubTab('labs')}
                    >
                      Past Lab Tests ({cumLabs.length})
                    </button>
                    <button
                      type="button"
                      className={`hist-tab-btn ${historySubTab === 'notes' ? 'active' : ''}`}
                      onClick={() => setHistorySubTab('notes')}
                    >
                      Past Doctor Notes ({prevNotes.length})
                    </button>
                  </div>

                  {/* Timeline Tab */}
                  {historySubTab === 'timeline' && (
                    <div className="history-section-content">
                      {previousVisits.length === 0 ? (
                        <div className="no-history-box">
                          <h4>First Recorded Consultation</h4>
                          <p>This is the patient's first recorded visit at MediKiosk. Records from today will become part of their permanent history.</p>
                        </div>
                      ) : (
                        <div className="previous-visits-list">
                          {previousVisits.map((v, idx) => {
                            const isExpanded = expandedVisitId === v.id
                            const vDate = v.created_at ? new Date(v.created_at).toLocaleString() : 'Past Visit'
                            const vDisp = v.clinician_disposition || {}
                            return (
                              <div key={v.id || idx} className="visit-history-card">
                                <div
                                  className="visit-card-header"
                                  onClick={() => setExpandedVisitId(isExpanded ? null : v.id)}
                                >
                                  <div className="visit-header-left">
                                    <span className="visit-date-badge">{vDate}</span>
                                    <span className="visit-dept-badge">
                                      {v.department === 'ayush' ? 'AYUSH' : 'General OPD'}
                                    </span>
                                    {vDisp.diagnosis && (
                                      <strong className="visit-dx">Dx: {vDisp.diagnosis}</strong>
                                    )}
                                  </div>
                                  <span className="btn-expand-arrow">{isExpanded ? '▲ Hide' : '▼ View'}</span>
                                </div>

                                {isExpanded && (
                                  <div className="visit-card-expanded">
                                    {vDisp.notes && (
                                      <div className="history-detail-block">
                                        <strong>Attending Doctor Notes:</strong>
                                        <p>{vDisp.notes}</p>
                                      </div>
                                    )}
                                    {v.structured_summary && (
                                      <div className="history-detail-block">
                                        <strong>Intake Summary:</strong>
                                        <ReactMarkdown>{v.structured_summary}</ReactMarkdown>
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

                  {/* Medications Tab */}
                  {historySubTab === 'medications' && (
                    <div className="history-section-content">
                      {cumMedications.length === 0 ? (
                        <div className="no-history-box">
                          <h4>No Prior Prescriptions on File</h4>
                        </div>
                      ) : (
                        <div className="meds-list-grid">
                          {cumMedications.map((m, i) => (
                            <div key={i} className="history-item-card">
                              <strong>{m.name || m}</strong>
                              {m.dosage && <span>Dosage: {m.dosage}</span>}
                              {m.frequency && <span>Frequency: {m.frequency}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Labs Tab */}
                  {historySubTab === 'labs' && (
                    <div className="history-section-content">
                      {cumLabs.length === 0 ? (
                        <div className="no-history-box">
                          <h4>No Prior Lab Results on File</h4>
                        </div>
                      ) : (
                        <div className="labs-list-grid">
                          {cumLabs.map((l, i) => (
                            <div key={i} className={`history-item-card ${l.is_abnormal ? 'danger' : ''}`}>
                              <strong>{l.test_name}</strong>
                              <span>{l.value} {l.unit}</span>
                              {l.is_abnormal && <span className="p-flag-badge">ABNORMAL ({l.flag})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes Tab */}
                  {historySubTab === 'notes' && (
                    <div className="history-section-content">
                      {prevNotes.length === 0 ? (
                        <div className="no-history-box">
                          <h4>No Previous Physician Notes on File</h4>
                        </div>
                      ) : (
                        <div className="notes-list-stack">
                          {prevNotes.map((n, i) => (
                            <div key={i} className="history-item-card">
                              <p>{typeof n === 'string' ? n : JSON.stringify(n)}</p>
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
    </div>
  )
}
