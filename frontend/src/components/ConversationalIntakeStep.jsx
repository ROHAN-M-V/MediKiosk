import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import LiveVoiceOverlay from './LiveVoiceOverlay'

export default function ConversationalIntakeStep({
  session,
  patient,
  messages,
  socratesHpi,
  redFlag,
  suggestedChips,
  onSendMessage,
  onProceedToDocs,
  isLoading
}) {
  const [inputText, setInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleSend(textToSend) {
    const text = textToSend || inputText
    if (!text.trim() || isLoading) return
    onSendMessage(text)
    setInputText('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Dual-Language (English & Hindi) Speech-to-Text
  function toggleVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech Recognition is not supported in this browser. Please type your message.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = session?.language === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false

    if (!isListening) {
      setIsListening(true)
      recognition.start()
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setInputText(prev => (prev ? `${prev} ${transcript}` : transcript))
        setIsListening(false)
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)
    } else {
      setIsListening(false)
    }
  }

  return (
    <div className="intake-layout">
      {/* Mobile Top Toggle for SOCRATES */}
      <div className="mobile-tracker-toggle-bar">
        <button
          type="button"
          className="btn-toggle-tracker"
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        >
          {showMobileSidebar ? '✕ Close Clinical Tracker' : '🩺 View Live SOCRATES Tracker'}
        </button>
      </div>

      {/* Main Chat Panel */}
      <div className="intake-chat-panel">
        {/* Top Chat Bar: Live Voice Launcher & Language Indicator */}
        <div className="chat-top-banner-bar">
          <div className="mode-toggle-group">
            <span className="active-mode-pill">💬 Standard Chat</span>
            <button
              type="button"
              className="btn-launch-gemini-live"
              onClick={() => setIsLiveVoiceOpen(true)}
              title="Launch hands-free real-time voice mode"
            >
              🎙️ Switch to Gemini Live Voice
            </button>
          </div>
          <span className="lang-support-badge">🌐 English & 🇮🇳 हिंदी Supported</span>
        </div>

        {/* Red Flag Warning Banner */}
        {redFlag?.is_critical && (
          <div className="red-flag-card">
            <div className="flag-icon">🚨</div>
            <div className="flag-content">
              <h4>CRITICAL RED-FLAG DETECTED: {redFlag.severity}</h4>
              <p>{redFlag.reason || 'Patient symptoms suggest urgent clinical priority.'}</p>
              <span className="flag-action">Triage team alerted. Continue intake for attending physician review.</span>
            </div>
          </div>
        )}

        {/* Message stream */}
        <div className="intake-messages-stream">
          {messages.map((m, idx) => (
            <div key={idx} className={`intake-bubble-row ${m.role}`}>
              <div className="bubble-avatar">
                {m.role === 'assistant' ? 'M' : 'P'}
              </div>
              <div className="bubble-body">
                <div className="bubble-text">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                <div className="bubble-meta">
                  {m.provenance === 'document_ocr' && <span className="prov-tag">OCR Scanned</span>}
                  <span>{new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="intake-bubble-row assistant">
              <div className="bubble-avatar">M</div>
              <div className="typing-pulse">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested Quick Tap Chips */}
        {suggestedChips?.length > 0 && !isLoading && (
          <div className="suggested-chips-bar">
            <span className="chips-title">Quick Select:</span>
            <div className="chips-scroll-wrap">
              {suggestedChips.map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  className="chip-btn"
                  onClick={() => handleSend(chip)}
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar with Voice, Live Voice & Send */}
        <div className="intake-input-bar">
          <button
            type="button"
            className={`btn-voice-record ${isListening ? 'listening' : ''}`}
            onClick={toggleVoiceInput}
            title="Speak symptoms (Voice-to-Text in English/Hindi)"
          >
            {isListening ? '🎙️ Listening...' : '🎤 Speak'}
          </button>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type in English or हिंदी (or speak)..."
            rows={1}
            disabled={isLoading}
          />

          <button
            type="button"
            className="btn-intake-send"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isLoading}
          >
            Send ➤
          </button>
        </div>

        {/* Bottom Stage Action */}
        <div className="intake-footer-action">
          <p className="kiosk-hint">
            Answered the main questions? You can attach previous prescriptions or lab reports next.
          </p>
          <button type="button" className="btn-kiosk-primary" onClick={onProceedToDocs}>
            Proceed to Document Upload (Step 3) →
          </button>
        </div>
      </div>

      {/* Right Sidebar / Mobile Drawer: Real-time SOCRATES State */}
      <aside className={`intake-socrates-sidebar ${showMobileSidebar ? 'mobile-open' : ''}`}>
        <div className="socrates-header">
          <h3>🩺 SOCRATES Clinical State</h3>
          <span className="socrates-sub">Live AI Extraction (Dual Language)</span>
        </div>

        <div className="socrates-card-list">
          <div className="socrates-item">
            <span className="soc-label">Chief Complaint:</span>
            <span className="soc-val">{socratesHpi?.chief_complaint || 'Identifying...'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[S] Site / Location:</span>
            <span className="soc-val">{socratesHpi?.site || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[O] Onset & Timeline:</span>
            <span className="soc-val">{socratesHpi?.onset || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[C] Character / Quality:</span>
            <span className="soc-val">{socratesHpi?.character || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[R] Radiation:</span>
            <span className="soc-val">{socratesHpi?.radiation || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[A] Associated Symptoms:</span>
            <span className="soc-val">
              {Array.isArray(socratesHpi?.associations) && socratesHpi.associations.length > 0
                ? socratesHpi.associations.join(', ')
                : '—'}
            </span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[T] Time Course:</span>
            <span className="soc-val">{socratesHpi?.time_course || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[E] Exacerbating / Relieving:</span>
            <span className="soc-val">{socratesHpi?.exacerbating_relieving || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">[S] Severity (1-10):</span>
            <span className={`soc-val ${socratesHpi?.severity ? 'bold' : ''}`}>
              {socratesHpi?.severity || '—'}
            </span>
          </div>
        </div>

        <div className="patient-quick-badge">
          <div className="badge-name">{patient?.name}</div>
          <div className="badge-meta">{patient?.age} yrs • {patient?.gender} • Token: {session?.patient_token || 'N/A'}</div>
        </div>
      </aside>

      {/* ─── Gemini Live-Style Voice Mode Overlay ─── */}
      <LiveVoiceOverlay
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        session={session}
        patient={patient}
        socratesHpi={socratesHpi}
        redFlag={redFlag}
        onSendVoiceMessage={onSendMessage}
        isLoading={isLoading}
      />
    </div>
  )
}
