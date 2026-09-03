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
  const [isConversationOpen, setIsConversationOpen] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fhirLoading, setFhirLoading] = useState(false)

  const session = sessionDetail?.session
  const patient = sessionDetail?.patient || {}
  const documents = sessionDetail?.documents || []
  const messages = sessionDetail?.messages || []
  const redFlag = session?.red_flag_alert || {}
  const securityAlerts = sessionDetail?.security_alerts || []
  const patientHistory = sessionDetail?.patient_history || {}
  const currentQuerySummary = sessionDetail?.current_query_summary
  const patientHistorySummary = sessionDetail?.patient_history_summary
  const uploadedDocumentsSummary = sessionDetail?.uploaded_documents_summary

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

  async function handleStartExamination() {
    if (!session?.id) return
    setStatusUpdating(true)
    try {
      if (onUpdateStatus) {
        await onUpdateStatus(session.id, 'in_consultation')
      }
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handlePutOnHold() {
    if (!session?.id) return
    setStatusUpdating(true)
    try {
      if (onUpdateStatus) {
        await onUpdateStatus(session.id, 'waiting')
      }
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handleVerifyAndComplete() {
    if (!session?.id) return
    if (!diagnosis.trim()) {
      alert('Please enter a Working or Final Diagnosis before verifying consultation.')
      return
    }
    setIsVerifying(true)
    try {
      const cleanedRx = prescriptions.filter(p => p.name && p.name.trim())
      await onConfirmSummary(session.id, editedSummary, doctorNotes, diagnosis, cleanedRx, followUp)
      setIsEditing(false)
      setVerificationToast(`✓ Patient ${session.patient_name || ''} (${session.queue_number}) verified and moved to Completed.`)
      setTimeout(() => setVerificationToast(null), 6000)
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleRefreshQueueAction() {
    setIsRefreshing(true)
    try {
      if (onRefreshQueue) {
        await onRefreshQueue()
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleViewFhirAction() {
    setFhirLoading(true)
    try {
      if (onOpenFhir) {
        await onOpenFhir(session.fhir_bundle, session.id)
      }
    } finally {
      setFhirLoading(false)
    }
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
  const cumulativeMeds = cumMedications
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
                onClick={handleRefreshQueueAction}
                disabled={isRefreshing}
                title="Refresh queue now"
              >
                {isRefreshing && <span className="btn-spinner"></span>}
                {isRefreshing ? 'Refreshing...' : '↻ Refresh'}
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
                        disabled={statusUpdating}
                      >
                        {statusUpdating && <span className="btn-spinner"></span>}
                        {statusUpdating ? 'Starting Exam...' : '▶ Start Examination'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-status-action pause"
                        onClick={handlePutOnHold}
                        disabled={statusUpdating}
                        title="Put back on waiting list if needed"
                      >
                        {statusUpdating && <span className="btn-spinner"></span>}
                        {statusUpdating ? 'Updating...' : '⏸ Put On Hold'}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    className="btn-fhir-view"
                    onClick={handleViewFhirAction}
                    disabled={fhirLoading}
                  >
                    {fhirLoading && <span className="btn-spinner"></span>}
                    {fhirLoading ? 'Loading FHIR...' : 'FHIR R4 Record'}
                  </button>
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

                  {/* ────────────────────────────────────────────────────────
                     CLINICAL OVERVIEW: 3 CONCISE SUMMARIES STACK
                     ──────────────────────────────────────────────────────── */}
                  <div className="clinical-overview-stack">
                    {/* SUMMARY 1: Current Query Summary (Most Prominent) */}
                    <div className="clinical-card query-summary-card">
                      <div className="card-top-bar">
                        <div className="summary-title-group">
                          <span className="summary-type-pill current">Current Query Summary</span>
                          <h3>Reason for Today's Visit</h3>
                        </div>
                        {session.assigned_doctor_name && (
                          <span className="doctor-assigned-tag">
                            Doctor: {session.assigned_doctor_name}
                          </span>
                        )}
                      </div>

                      <div className="query-summary-highlight">
                        {currentQuerySummary?.text_overview || session.socrates_hpi?.chief_complaint || 'General Outpatient Consultation'}
                      </div>

                      <div className="query-grid-meta">
                        <div className="q-meta-item">
                          <strong>Chief Concern:</strong>
                          <span>{session.socrates_hpi?.chief_complaint || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Pain / Severity:</strong>
                          <span>{session.socrates_hpi?.severity ? `${session.socrates_hpi.severity} / 10` : '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Onset:</strong>
                          <span>{session.socrates_hpi?.onset || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Location / Site:</strong>
                          <span>{session.socrates_hpi?.site || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Character:</strong>
                          <span>{session.socrates_hpi?.character || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Timing / Pattern:</strong>
                          <span>{session.socrates_hpi?.timing || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Radiation:</strong>
                          <span>{session.socrates_hpi?.radiation || '—'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Associated Symptoms:</strong>
                          <span>{Array.isArray(session.socrates_hpi?.associations) && session.socrates_hpi.associations.length > 0 ? session.socrates_hpi.associations.join(', ') : 'None reported'}</span>
                        </div>
                        <div className="q-meta-item">
                          <strong>Assigned Doctor:</strong>
                          <span style={{ color: '#1e40af', fontWeight: 600 }}>{session.assigned_doctor_name || 'General OPD Doctor'} {session.assigned_doctor_specialty ? `(${session.assigned_doctor_specialty})` : ''}</span>
                        </div>
                      </div>
                    </div>

                    {/* SUMMARY 2: Patient History Summary */}
                    <div className="clinical-card history-summary-card">
                      <div className="card-top-bar">
                        <div className="summary-title-group">
                          <span className="summary-type-pill history">Patient History Summary</span>
                          <h3>Longitudinal Medical Background</h3>
                        </div>
                        {previousVisits.length > 0 && (
                          <button
                            type="button"
                            className="btn-open-history"
                            style={{ padding: '5px 12px', fontSize: '12px' }}
                            onClick={() => setActivePacketView('history')}
                          >
                            View Full Timeline ({previousVisits.length}) →
                          </button>
                        )}
                      </div>

                      <div className="history-summary-text">
                        {patientHistorySummary?.text_overview || (previousVisits.length > 0
                          ? `Returning patient with ${previousVisits.length} documented prior consultation(s) at MediKiosk.`
                          : 'First-time patient check-in at MediKiosk. No prior hospital visits or electronic consultation records on file.')}
                      </div>

                      <div className="history-tags-row">
                        <div className="history-tag">
                          <strong>Chronic Conditions:</strong> {patient.conditions?.length > 0 ? patient.conditions.join(', ') : 'None documented'}
                        </div>
                        <div className="history-tag">
                          <strong>Active Medications:</strong> {cumulativeMeds.length > 0 ? cumulativeMeds.map(m => m.name).join(', ') : 'None active'}
                        </div>
                        <div className="history-tag">
                          <strong>Allergies:</strong> {patient.allergies?.length > 0 ? patient.allergies.join(', ') : 'No known drug allergies (NKDA)'}
                        </div>
                        <div className="history-tag">
                          <strong>Prior Visits:</strong> {previousVisits.length} recorded
                        </div>
                      </div>
                    </div>

                    {/* SUMMARY 3: Uploaded Documents Summary */}
                    <div className="clinical-card docs-summary-card">
                      <div className="card-top-bar">
                        <div className="summary-title-group">
                          <span className="summary-type-pill docs">Uploaded Documents Summary</span>
                          <h3>External Records & Scans ({documents.length})</h3>
                        </div>
                      </div>

                      <div className="docs-summary-text">
                        {uploadedDocumentsSummary?.text_overview || (documents.length > 0
                          ? `Patient provided ${documents.length} external document(s) during check-in for physician review.`
                          : 'No external medical prescriptions, lab reports, or discharge summaries were uploaded for this visit.')}
                      </div>

                      {/* Abnormal lab flags if any */}
                      {uploadedDocumentsSummary?.abnormal_lab_flags?.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                            Critical Abnormal Lab Findings:
                          </span>
                          <div className="docs-abnormal-tags">
                            {uploadedDocumentsSummary.abnormal_lab_flags.map((flag, i) => (
                              <span key={i} className="lab-flag-pill">⚠️ {flag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Extracted medicines if any */}
                      {uploadedDocumentsSummary?.extracted_medications?.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12.5px' }}>
                          <strong>Medications extracted from uploaded prescriptions: </strong>
                          <span>{uploadedDocumentsSummary.extracted_medications.join(', ')}</span>
                        </div>
                      )}

                      {/* Document file cards if uploaded */}
                      {documents.length > 0 && (
                        <div className="doctor-doc-list" style={{ marginTop: '14px' }}>
                          {documents.map((doc, idx) => (
                            <div key={idx} className="doc-detail-card">
                              <div className="doc-detail-header">
                                <span className="doc-type-pill">{doc.doc_type?.replace('_', ' ').toUpperCase()}</span>
                                <span className="doc-title">{doc.file_name}</span>
                              </div>
                              {doc.file_path && (
                                <a
                                  href={`${BASE_SERVER_URL}/uploads/${doc.file_path.split(/[\/\\]/).pop()}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-view-orig-doc"
                                  style={{ marginTop: '6px' }}
                                >
                                  View Uploaded Document ↗
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ────────────────────────────────────────────────────────
                       SECONDARY EXPANDABLE SECTION: VIEW CURRENT CONVERSATION
                       ──────────────────────────────────────────────────────── */}
                    <div className="clinical-card expandable-chat-card">
                      <button
                        type="button"
                        className="btn-toggle-conversation"
                        onClick={() => setIsConversationOpen(!isConversationOpen)}
                      >
                        <div className="toggle-title-left">
                          <span className="toggle-icon">{isConversationOpen ? '▼' : '▶'}</span>
                          <span>{isConversationOpen ? 'Hide Current Conversation' : 'View Current Conversation'}</span>
                          <span className="toggle-count-pill">{messages.length} messages</span>
                        </div>
                        <span className="toggle-hint">
                          {isConversationOpen ? 'Click to collapse transcript' : 'Click to view full chat history with kiosk'}
                        </span>
                      </button>

                      {isConversationOpen && (
                        <div className="expanded-transcript-body">
                          {messages.length === 0 ? (
                            <p className="kiosk-hint">No messages recorded in this intake session.</p>
                          ) : (
                            <div className="transcript-scroll" style={{ maxHeight: '340px' }}>
                              {messages.map((m, i) => (
                                <div key={i} className={`transcript-row ${m.role}`}>
                                  <span className="role-tag">
                                    {m.role === 'assistant' ? 'Kiosk' : 'Patient'}:
                                  </span>
                                  <span className="text">{m.content}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ────────────────────────────────────────────────────────
                       ATTENDING PHYSICIAN CONSULTATION OUTCOME
                       ──────────────────────────────────────────────────────── */}
                    {isSessionCompleted ? (
                      /* READ-ONLY COMPLETED CONSULTATION SUMMARY */
                      <div className="clinical-card consultation-outcome-card">
                        <div className="card-top-bar">
                          <h3>Verified Consultation & Prescription Record</h3>
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

                        {/* Doctor Notes & Clinical Advice */}
                        <div className="consult-readonly-field">
                          <span className="readonly-label">Doctor Notes & Clinical Advice</span>
                          <div className="readonly-value-box">
                            {session.clinician_disposition?.physician_notes || doctorNotes || 'No additional physician notes recorded.'}
                          </div>
                        </div>

                        {/* Follow-Up Plan */}
                        <div className="consult-readonly-field">
                          <span className="readonly-label">Follow-Up Recommendation</span>
                          <div className="readonly-value-box">
                            {session.clinician_disposition?.follow_up || followUp || 'As needed / Routine follow-up'}
                          </div>
                        </div>

                        <div className="completed-consultation-footer">
                          <span>🔒 Consultation finalized & verified. This completed record is permanently archived in read-only mode.</span>
                        </div>
                      </div>
                    ) : (
                      /* ACTIVE ONGOING CONSULTATION & VERIFICATION FORM */
                      <div className="clinical-card doctor-consult-card active-consultation-card">
                        <div className="consult-card-header">
                          <div>
                            <h3>Attending Physician Consultation & Verification</h3>
                            <p className="consult-card-sub">
                              Record final diagnosis, prescribe medications, and verify this patient to complete the consultation.
                            </p>
                          </div>
                          <span className="doctor-assigned-tag">
                            Dr. {doctorUser?.name?.replace(/^Dr\.\s*/i, '') || 'Attending Physician'}
                          </span>
                        </div>

                        {/* Working / Final Diagnosis */}
                        <div className="consult-field-group">
                          <label className="consult-label">Working / Final Diagnosis *</label>
                          <input
                            type="text"
                            className="consult-input-text"
                            placeholder="e.g. Acute Viral Gastroenteritis, Type 2 Diabetes Mellitus"
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                            disabled={isVerifying}
                          />
                        </div>

                        {/* Structured Prescriptions Builder */}
                        <div className="consult-field-group">
                          <div className="consult-field-header-row">
                            <label className="consult-label">Prescribed Medications</label>
                            <button
                              type="button"
                              className="btn-add-rx"
                              onClick={addPrescriptionRow}
                              disabled={isVerifying}
                            >
                              + Add Medicine
                            </button>
                          </div>

                          <div className="prescriptions-builder-table">
                            <div className="rx-table-header">
                              <span>Medicine Name</span>
                              <span>Dosage (e.g. 500mg)</span>
                              <span>Frequency (e.g. 1-0-1)</span>
                              <span>Duration (e.g. 5 days)</span>
                              <span></span>
                            </div>

                            {prescriptions.map((rx) => (
                              <div key={rx.id} className="rx-table-row">
                                <input
                                  type="text"
                                  placeholder="Medicine Name (e.g. Paracetamol)"
                                  value={rx.name}
                                  onChange={(e) => updatePrescription(rx.id, 'name', e.target.value)}
                                  disabled={isVerifying}
                                />
                                <input
                                  type="text"
                                  placeholder="Dosage (500mg)"
                                  value={rx.dosage}
                                  onChange={(e) => updatePrescription(rx.id, 'dosage', e.target.value)}
                                  disabled={isVerifying}
                                />
                                <input
                                  type="text"
                                  placeholder="Frequency (1-0-1 after food)"
                                  value={rx.frequency}
                                  onChange={(e) => updatePrescription(rx.id, 'frequency', e.target.value)}
                                  disabled={isVerifying}
                                />
                                <input
                                  type="text"
                                  placeholder="Duration (5 days)"
                                  value={rx.duration}
                                  onChange={(e) => updatePrescription(rx.id, 'duration', e.target.value)}
                                  disabled={isVerifying}
                                />
                                <button
                                  type="button"
                                  className="btn-remove-rx"
                                  onClick={() => removePrescriptionRow(rx.id)}
                                  title="Remove medication"
                                  disabled={isVerifying}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Physician Notes & Clinical Advice */}
                        <div className="consult-field-group">
                          <label className="consult-label">Physician Notes & Patient Instructions</label>
                          <textarea
                            className="consult-textarea"
                            rows={3}
                            placeholder="Advice, lifestyle modifications, warning signs to watch for..."
                            value={doctorNotes}
                            onChange={(e) => setDoctorNotes(e.target.value)}
                            disabled={isVerifying}
                          />
                        </div>

                        {/* Follow-Up Recommendation */}
                        <div className="consult-field-group">
                          <label className="consult-label">Recommended Follow-Up</label>
                          <input
                            type="text"
                            className="consult-input-text"
                            placeholder="e.g. Review in 5 days or if symptoms worsen"
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value)}
                            disabled={isVerifying}
                          />
                        </div>

                        {/* Verify & Complete Consultation Button */}
                        <div className="consultation-actions-bar">
                          <button
                            type="button"
                            className="btn-finalize-consultation"
                            onClick={handleVerifyAndComplete}
                            disabled={isVerifying || isLoading}
                          >
                            {isVerifying && <span className="btn-spinner"></span>}
                            {isVerifying ? 'Verifying Consultation...' : '✓ Verify & Complete Consultation'}
                          </button>
                          <span className="finalize-subtext">
                            Verifies details, seals diagnosis & prescriptions, and automatically moves patient to Completed.
                          </span>
                        </div>
                      </div>
                    )}
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
