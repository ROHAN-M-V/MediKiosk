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
      {/* Mobile Top Toggle for Summary */}
      <div className="mobile-tracker-toggle-bar">
        <button
          type="button"
          className="btn-toggle-tracker"
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        >
          {showMobileSidebar ? '✕ Close Summary' : '📋 View Symptom Summary'}
        </button>
      </div>

      {/* Main Chat Panel */}
      <div className="intake-chat-panel">
        {/* Top Chat Bar */}
        <div className="chat-top-banner-bar">
          <div className="mode-toggle-group">
            <span className="active-mode-pill">Text Chat</span>
            <button
              type="button"
              className="btn-launch-gemini-live"
              onClick={() => setIsLiveVoiceOpen(true)}
              title="Speak directly using voice"
            >
              🎙️ Open Voice Mode
            </button>
          </div>
          <span className="lang-support-badge">English & हिंदी</span>
        </div>

        {/* Red Flag Warning Banner */}
        {redFlag?.is_critical && (
          <div className="red-flag-card">
            <div className="flag-icon">⚠️</div>
            <div className="flag-content">
              <h4>Priority Alert: {redFlag.severity}</h4>
              <p>{redFlag.reason || 'Your answers indicate urgent symptoms.'}</p>
              <span className="flag-action">A nurse or clinical staff member will be alerted. Please continue.</span>
            </div>
          </div>
        )}

        {/* Message stream */}
        <div className="intake-messages-stream">
          {messages.map((m, idx) => (
            <div key={idx} className={`intake-bubble-row ${m.role}`}>
              <div className="bubble-avatar">
                {m.role === 'assistant' ? 'Kiosk' : 'You'}
              </div>
              <div className="bubble-body">
                <div className="bubble-text">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                <div className="bubble-meta">
                  {m.provenance === 'document_ocr' && <span className="prov-tag">From Document</span>}
                  <span>{new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="intake-bubble-row assistant">
              <div className="bubble-avatar">Kiosk</div>
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
            <span className="chips-title">Suggested answers:</span>
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

        {/* Input Bar with Voice & Send */}
        <div className="intake-input-bar">
          <button
            type="button"
            className={`btn-voice-record ${isListening ? 'listening' : ''}`}
            onClick={toggleVoiceInput}
            title="Speak your symptoms"
          >
            {isListening ? 'Listening...' : '🎤 Speak'}
          </button>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response here..."
            rows={1}
            disabled={isLoading}
          />

          <button
            type="button"
            className="btn-intake-send"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isLoading}
          >
            Send →
          </button>
        </div>

        {/* Bottom Stage Action */}
        <div className="intake-footer-action">
          <p className="kiosk-hint">
            Done answering? You can upload past prescriptions or test reports next.
          </p>
          <button type="button" className="btn-kiosk-primary" onClick={onProceedToDocs}>
            Continue to Document Upload (Step 3) →
          </button>
        </div>
      </div>

      {/* Right Sidebar: Human-Friendly Symptom Summary */}
      <aside className={`intake-socrates-sidebar ${showMobileSidebar ? 'mobile-open' : ''}`}>
        <div className="socrates-header">
          <h3>Symptom Summary</h3>
          <span className="socrates-sub">Information noted for doctor</span>
        </div>

        <div className="socrates-card-list">
          <div className="socrates-item">
            <span className="soc-label">Main Concern:</span>
            <span className="soc-val">{socratesHpi?.chief_complaint || 'Listening...'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Location:</span>
            <span className="soc-val">{socratesHpi?.site || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">When it started:</span>
            <span className="soc-val">{socratesHpi?.onset || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">How it feels:</span>
            <span className="soc-val">{socratesHpi?.character || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Spreading to:</span>
            <span className="soc-val">{socratesHpi?.radiation || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Other symptoms:</span>
            <span className="soc-val">
              {Array.isArray(socratesHpi?.associations) && socratesHpi.associations.length > 0
                ? socratesHpi.associations.join(', ')
                : '—'}
            </span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Timing / Pattern:</span>
            <span className="soc-val">{socratesHpi?.time_course || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Triggers / Relief:</span>
            <span className="soc-val">{socratesHpi?.exacerbating_relieving || '—'}</span>
          </div>

          <div className="socrates-item">
            <span className="soc-label">Pain level (1-10):</span>
            <span className={`soc-val ${socratesHpi?.severity ? 'bold' : ''}`}>
              {socratesHpi?.severity || '—'}
            </span>
          </div>
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
