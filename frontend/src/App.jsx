import React, { useState, useEffect } from 'react'
import Auth from './components/Auth'
import PatientTokenEntry from './components/PatientTokenEntry'
import KioskHeader from './components/KioskHeader'
import IdentityConsentStep from './components/IdentityConsentStep'
import ConversationalIntakeStep from './components/ConversationalIntakeStep'
import DocumentScannerStep from './components/DocumentScannerStep'
import KioskSummaryStep from './components/KioskSummaryStep'
import PhysicianConsole from './components/PhysicianConsole'
import FhirModal from './components/FhirModal'
import { supabase, isSupabaseConfigured } from './supabaseClient'

import { API_URL } from './apiConfig'

export default function App() {
  // ─── Top-Level Navigation State ─────────────────────────────
  // 'entry' | 'patient_token' | 'patient_intake' | 'doctor_console'
  const [appMode, setAppMode] = useState('entry')
  const [doctorUser, setDoctorUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // ─── Patient State (Token-Based) ────────────────────────────
  const [patientToken, setPatientToken] = useState('')
  const [verifiedPatientData, setVerifiedPatientData] = useState(null)
  const [currentStep, setCurrentStep] = useState(1) // 1: Identity, 2: Chat, 3: Docs, 4: Summary
  const [language, setLanguage] = useState('en')
  const [isLoading, setIsLoading] = useState(false)
  const [session, setSession] = useState(null)
  const [patient, setPatient] = useState(null)
  const [messages, setMessages] = useState([])
  const [socratesHpi, setSocratesHpi] = useState({})
  const [redFlag, setRedFlag] = useState({ is_critical: false, severity: 'NORMAL' })
  const [suggestedChips, setSuggestedChips] = useState([])
  const [documents, setDocuments] = useState([])

  // ─── Doctor Console State ───────────────────────────────────
  const [queue, setQueue] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [sessionDetail, setSessionDetail] = useState(null)
  const [fhirModalData, setFhirModalData] = useState(null)

  // ─── Doctor Session Check on Mount ──────────────────────────
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session: supaSession } }) => {
        if (supaSession?.user) {
          const user = supaSession.user
          const docName = user.user_metadata?.name || user.user_metadata?.full_name || (user.email ? `Dr. ${user.email.split('@')[0]}` : 'Dr. Attending')
          const doctorObj = {
            id: user.id,
            email: user.email,
            name: docName,
            role: 'doctor',
            specialty: user.user_metadata?.specialty || 'Attending Physician'
          }
          localStorage.setItem('medikiosk_doctor_user', JSON.stringify(doctorObj))
          setDoctorUser(doctorObj)
          setAppMode('doctor_console')
          if (window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        } else {
          checkLocalDoctorSession()
        }
        setAuthLoading(false)
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, supaSession) => {
        if (supaSession?.user) {
          const user = supaSession.user
          const docName = user.user_metadata?.name || user.user_metadata?.full_name || (user.email ? `Dr. ${user.email.split('@')[0]}` : 'Dr. Attending')
          const doctorObj = {
            id: user.id,
            email: user.email,
            name: docName,
            role: 'doctor',
            specialty: user.user_metadata?.specialty || 'Attending Physician'
          }
          localStorage.setItem('medikiosk_doctor_user', JSON.stringify(doctorObj))
          setDoctorUser(doctorObj)
          setAppMode('doctor_console')
        } else if (event === 'SIGNED_OUT') {
          setDoctorUser(null)
          setAppMode('entry')
        }
        setAuthLoading(false)
      })

      return () => subscription.unsubscribe()
    } else {
      checkLocalDoctorSession()
      setAuthLoading(false)
    }
  }, [])

  function checkLocalDoctorSession() {
    const saved = localStorage.getItem('medikiosk_doctor_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setDoctorUser(parsed)
        setAppMode('doctor_console')
      } catch (e) {
        setDoctorUser(null)
      }
    }
  }

  // ─── Doctor Queue & Details ─────────────────────────────────

  useEffect(() => {
    if (appMode === 'doctor_console' && doctorUser) {
      fetchPhysicianQueue()
    }
  }, [appMode, doctorUser])

  useEffect(() => {
    if (appMode === 'doctor_console' && doctorUser && selectedSessionId) {
      fetchSessionDetail(selectedSessionId)
    }
  }, [selectedSessionId, appMode, doctorUser])

  async function fetchPhysicianQueue() {
    try {
      const res = await fetch(`${API_URL}/physician/queue`, {
        headers: {
          'X-User-Id': doctorUser?.id || 'doctor',
          'X-User-Role': 'doctor'
        }
      })
      if (res.status === 403) {
        alert('Access Denied: Doctor Google OAuth authentication required.')
        return
      }
      const data = await res.json()
      setQueue(data.queue || [])
      if (data.queue?.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data.queue[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch doctor queue:', err)
    }
  }

  async function fetchSessionDetail(sessionId) {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/physician/session/${sessionId}`, {
        headers: {
          'X-User-Id': doctorUser?.id || 'doctor',
          'X-User-Role': 'doctor'
        }
      })
      if (res.status === 403) {
        alert('Access Denied: Doctor authorization required.')
        return
      }
      const data = await res.json()
      setSessionDetail(data)
    } catch (err) {
      console.error('Failed to load session details:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleConfirmSummary(sessionId, summary, notes) {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/physician/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': doctorUser?.id || 'doctor',
          'X-User-Role': 'doctor'
        },
        body: JSON.stringify({
          session_id: sessionId,
          confirmed_summary: summary,
          disposition_notes: notes,
          assigned_doctor: doctorUser?.name || 'Attending Physician'
        })
      })
      if (res.status === 403) {
        alert('Access Denied: Only authenticated physicians can confirm summaries.')
        return
      }
      fetchSessionDetail(sessionId)
      fetchPhysicianQueue()
      alert('✓ Clinical summary verified and confirmed! Mock HIS & ABDM Sync successfully triggered.')
    } catch (err) {
      console.error('Failed to confirm summary:', err)
    } finally {
      setIsLoading(false)
    }
  }

  function handleDoctorLoginSuccess(docUser) {
    localStorage.setItem('medikiosk_doctor_user', JSON.stringify(docUser))
    setDoctorUser(docUser)
    setAppMode('doctor_console')
  }

  async function handleSignOutDoctor() {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
    }
    localStorage.removeItem('medikiosk_doctor_user')
    setDoctorUser(null)
    setAppMode('entry')
  }

  // ─── Patient Token Flow Handlers ────────────────────────────

  function handlePatientVerified(patientPayload) {
    setPatientToken(patientPayload.token)
    setVerifiedPatientData(patientPayload)
    setCurrentStep(1)
    setAppMode('patient_intake')
  }

  async function handleStartIntake(patientFormData) {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/intake/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patientFormData,
          patient_token: patientToken,
          language
        })
      })
      const data = await res.json()
      setSession(data.session)
      setPatient(data.patient)
      setMessages([
        {
          role: 'assistant',
          content: data.initial_message,
          timestamp: new Date().toISOString()
        }
      ])
      setSuggestedChips([])
      setCurrentStep(2)
    } catch (err) {
      console.error('Failed to start intake:', err)
      alert('Could not connect to backend server. Make sure FastAPI is running on port 8000.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSendMessage(text, langOverride) {
    if (!session) return null

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const res = await fetch(`${API_URL}/intake/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          message: text,
          language: langOverride || language
        })
      })
      const data = await res.json()

      const botMsg = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, botMsg])
      setSocratesHpi(data.socrates_hpi || {})
      setRedFlag(data.red_flag || { is_critical: false })
      setSuggestedChips(data.suggested_chips || [])
      return data
    } catch (err) {
      console.error('Failed to send message:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUploadDocument(file, docType) {
    if (!session) return
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('session_id', session.id)
      formData.append('doc_type', docType)
      formData.append('file', file)

      const res = await fetch(`${API_URL}/intake/upload-document`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      setDocuments(prev => [...prev, data.document])

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `📄 Scanned **${file.name}** (${docType.toUpperCase()})\n${data.entities?.summary || ''}`,
          provenance: 'document_ocr',
          timestamp: new Date().toISOString()
        }
      ])
    } catch (err) {
      console.error('Failed to upload document:', err)
      alert('Document OCR failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmitIntake() {
    if (!session) return
    setIsLoading(true)

    try {
      const res = await fetch(`${API_URL}/intake/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id })
      })
      const data = await res.json()
      setSession(data.session)
    } catch (err) {
      console.error('Failed to submit intake:', err)
    } finally {
      setIsLoading(false)
    }
  }

  function handleRestartKiosk() {
    setSession(null)
    setPatient(null)
    setMessages([])
    setSocratesHpi({})
    setRedFlag({ is_critical: false })
    setDocuments([])
    setPatientToken('')
    setVerifiedPatientData(null)
    setCurrentStep(1)
    setAppMode('entry')
  }

  // ─── Rendering App Modes ────────────────────────────────────

  if (authLoading) {
    return (
      <div className="auth-entry-page">
        <div className="loading-spinner-ring"></div>
      </div>
    )
  }

  // Mode 1: Initial Entry (Patient vs Doctor selection)
  if (appMode === 'entry') {
    return (
      <Auth
        onSelectPatient={() => setAppMode('patient_token')}
        onDoctorLoginSuccess={handleDoctorLoginSuccess}
      />
    )
  }

  // Mode 2: Patient Token Lookup / Generation
  if (appMode === 'patient_token') {
    return (
      <PatientTokenEntry
        onPatientVerified={handlePatientVerified}
        onBackToRoleSelect={() => setAppMode('entry')}
      />
    )
  }

  // Mode 3: Doctor Console
  if (appMode === 'doctor_console') {
    return (
      <div className="app-shell">
        <KioskHeader
          doctorUser={doctorUser}
          isDoctorMode={true}
          onSignOutDoctor={handleSignOutDoctor}
          currentStep={1}
          language={language}
          onLanguageChange={setLanguage}
          redFlag={{ is_critical: false }}
        />
        <main className="app-main-body">
          <PhysicianConsole
            queue={queue}
            selectedSessionId={selectedSessionId}
            onSelectSession={setSelectedSessionId}
            sessionDetail={sessionDetail}
            onConfirmSummary={handleConfirmSummary}
            onOpenFhir={(bundle) => setFhirModalData(bundle)}
            isLoading={isLoading}
            onRefreshQueue={fetchPhysicianQueue}
          />
        </main>
        {fhirModalData && (
          <FhirModal
            fhirData={fhirModalData}
            onClose={() => setFhirModalData(null)}
          />
        )}
      </div>
    )
  }

  // Mode 4: Patient 4-Step Intake Kiosk
  return (
    <div className="app-shell">
      <KioskHeader
        doctorUser={null}
        isDoctorMode={false}
        onOpenDoctorPortal={() => setAppMode('entry')}
        onSignOutDoctor={handleRestartKiosk}
        currentStep={currentStep}
        language={language}
        onLanguageChange={setLanguage}
        redFlag={redFlag}
      />

      <main className="app-main-body">
        {currentStep === 1 && (
          <IdentityConsentStep
            patientToken={patientToken}
            initialPatientData={verifiedPatientData}
            onStartIntake={handleStartIntake}
            loading={isLoading}
          />
        )}

        {currentStep === 2 && (
          <ConversationalIntakeStep
            session={session}
            patient={patient}
            messages={messages}
            socratesHpi={socratesHpi}
            redFlag={redFlag}
            suggestedChips={suggestedChips}
            onSendMessage={handleSendMessage}
            onProceedToDocs={() => setCurrentStep(3)}
            isLoading={isLoading}
          />
        )}

        {currentStep === 3 && (
          <DocumentScannerStep
            session={session}
            documents={documents}
            onUploadDocument={handleUploadDocument}
            onProceedToSummary={() => setCurrentStep(4)}
            isLoading={isLoading}
          />
        )}

        {currentStep === 4 && (
          <KioskSummaryStep
            session={session}
            patient={patient}
            socratesHpi={socratesHpi}
            documents={documents}
            redFlag={redFlag}
            onSubmitIntake={handleSubmitIntake}
            onRestartKiosk={handleRestartKiosk}
            isLoading={isLoading}
          />
        )}
      </main>

      {fhirModalData && (
        <FhirModal
          fhirData={fhirModalData}
          onClose={() => setFhirModalData(null)}
        />
      )}
    </div>
  )
}
