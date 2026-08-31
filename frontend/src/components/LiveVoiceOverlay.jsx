import React, { useState, useEffect, useRef } from 'react'

export default function LiveVoiceOverlay({
  isOpen,
  onClose,
  session,
  patient,
  socratesHpi,
  redFlag,
  onSendVoiceMessage,
  isLoading
}) {
  const [isListening, setIsListening] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [transcriptLive, setTranscriptLive] = useState('')
  const [detectedLang, setDetectedLang] = useState('en')
  const [recentTurns, setRecentTurns] = useState([])
  const [voiceSupported, setVoiceSupported] = useState(true)

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const isAiSpeakingRef = useRef(false)
  const isOpenRef = useRef(isOpen)

  isOpenRef.current = isOpen
  isAiSpeakingRef.current = isAiSpeaking

  // ─── Initialize Speech Recognition (Continuous / Duplex) ────
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setVoiceSupported(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    // Alternate or adapt language based on detected lang
    recognition.lang = detectedLang === 'hi' ? 'hi-IN' : 'en-IN'

    recognition.onresult = (event) => {
      let interim = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += text + ' '
        } else {
          interim += text
        }
      }

      const currentSpeech = finalTranscript || interim

      // If user speaks while AI is speaking -> BARGE-IN INTERRUPTION!
      if (currentSpeech.trim().length > 1 && isAiSpeakingRef.current) {
        handleInterruptAi()
      }

      setTranscriptLive(currentSpeech)

      // Auto-detect Hindi characters
      if (anyHindiChars(currentSpeech)) {
        setDetectedLang('hi')
      }

      // Reset and trigger silence detection timer to auto-send speech
      if (finalTranscript.trim() || interim.trim().length > 3) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          const toSend = (finalTranscript || interim).trim()
          if (toSend && !isAiSpeakingRef.current) {
            handleCommitSpeech(toSend)
          }
        }, 1300) // 1.3s pause = user finished speaking turn
      }
    }

    recognition.onerror = (err) => {
      if (err.error !== 'no-speech') {
        console.warn('Live voice recognition event:', err.error)
      }
    }

    recognition.onend = () => {
      // Auto-restart recognition if Live Voice mode is active
      if (isOpenRef.current && !isAiSpeakingRef.current) {
        try {
          recognition.start()
          setIsListening(true)
        } catch (e) {}
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    return () => {
      try {
        recognition.stop()
      } catch (e) {}
    }
  }, [detectedLang])

  // ─── Handle Live Session Start / Stop ───────────────────────
  useEffect(() => {
    if (isOpen) {
      startLiveListening()
    } else {
      stopLiveSession()
    }

    return () => {
      stopLiveSession()
    }
  }, [isOpen])

  function anyHindiChars(str) {
    return /[\u0900-\u097F]/.test(str)
  }

  function startLiveListening() {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch (e) {
      // Already running
      setIsListening(true)
    }
  }

  function stopLiveSession() {
    clearTimeout(silenceTimerRef.current)
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsAiSpeaking(false)
    setIsListening(false)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {}
    }
  }

  // ─── User Speech Finished -> Send to Backend ───────────────
  async function handleCommitSpeech(spokenText) {
    if (!spokenText.trim() || isLoading) return

    // Add to live UI transcript
    setRecentTurns(prev => [...prev.slice(-3), { role: 'user', text: spokenText }])
    setTranscriptLive('')

    // Stop recognition while AI processes
    try {
      recognitionRef.current?.stop()
    } catch (e) {}
    setIsListening(false)

    try {
      const response = await onSendVoiceMessage(spokenText, detectedLang)
      if (response && response.reply) {
        const replyText = response.reply
        const replyLang = response.detected_language || (anyHindiChars(replyText) ? 'hi' : 'en')
        setDetectedLang(replyLang)

        setRecentTurns(prev => [...prev.slice(-3), { role: 'assistant', text: replyText }])
        speakAiResponse(replyText, replyLang)
      } else {
        startLiveListening()
      }
    } catch (err) {
      console.error('Voice message error:', err)
      startLiveListening()
    }
  }

  // ─── Spoken Audio Playback (Web Speech Synthesis / TTS) ─────
  function speakAiResponse(textToSpeak, langCode) {
    if (!('speechSynthesis' in window)) {
      startLiveListening()
      return
    }

    window.speechSynthesis.cancel()
    setIsAiSpeaking(true)

    // Strip markdown formatting for natural voice synthesis
    const cleanText = textToSpeak
      .replace(/[*_~`#\[\]\(\)]/g, '')
      .replace(/\n+/g, ' ')
      .trim()

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = langCode === 'hi' ? 'hi-IN' : 'en-IN'
    utterance.rate = 1.05
    utterance.pitch = 1.0

    // Pick best available native voice
    const voices = window.speechSynthesis.getVoices()
    const targetVoice = voices.find(v => 
      langCode === 'hi' 
        ? v.lang.startsWith('hi') || v.name.includes('Hindi')
        : v.lang.startsWith('en-IN') || v.lang.startsWith('en-US') || v.name.includes('Google')
    )
    if (targetVoice) utterance.voice = targetVoice

    utterance.onend = () => {
      setIsAiSpeaking(false)
      if (isOpenRef.current) {
        startLiveListening()
      }
    }

    utterance.onerror = () => {
      setIsAiSpeaking(false)
      if (isOpenRef.current) {
        startLiveListening()
      }
    }

    window.speechSynthesis.speak(utterance)
  }

  // ─── Instant Barge-In Interruption ──────────────────────────
  function handleInterruptAi() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsAiSpeaking(false)
    startLiveListening()
  }

  if (!isOpen) return null

  return (
    <div className="live-voice-modal-backdrop">
      <div className="live-voice-card">
        {/* Top Header Bar */}
        <div className="live-voice-header">
          <div className="live-brand-group">
            <span className="live-pulse-badge">
              <span className="live-dot-glow"></span>
              VOICE CONSULTATION
            </span>
            <span className="lang-auto-badge">
              {detectedLang === 'hi' ? 'हिंदी (Auto)' : 'English (Auto)'}
            </span>
          </div>

          <button
            type="button"
            className="btn-close-live-voice"
            onClick={onClose}
            title="Switch to Text Chat"
          >
            ✕ Switch to Text Chat
          </button>
        </div>

        {/* Red Flag Warning Box */}
        {redFlag?.is_critical && (
          <div className="live-red-flag-bar">
            <strong>PRIORITY NOTICE:</strong> {redFlag.reason || 'Urgent clinical priority.'}
          </div>
        )}

        {/* Central Audio Orb & Visualizer */}
        <div className="live-voice-visualizer-area">
          <div
            className={`gemini-live-orb ${isAiSpeaking ? 'speaking' : isListening ? 'listening' : 'idle'} ${isLoading ? 'processing' : ''}`}
            onClick={isAiSpeaking ? handleInterruptAi : null}
            title={isAiSpeaking ? 'Tap to interrupt' : 'Voice Mode Active'}
          >
            <div className="orb-inner-core">
              <div className="orb-wave-ring r1"></div>
              <div className="orb-wave-ring r2"></div>
              <div className="orb-wave-ring r3"></div>
            </div>
          </div>

          {/* Dynamic Status Text */}
          <div className="live-status-container">
            <h3 className="live-status-title">
              {isLoading
                ? 'Processing response...'
                : isAiSpeaking
                ? 'Responding (speak or tap to interrupt)'
                : isListening
                ? 'Listening naturally... (speak in English or Hindi)'
                : 'Connecting audio...'}
            </h3>

            {isAiSpeaking && (
              <button
                type="button"
                className="btn-interrupt-pill"
                onClick={handleInterruptAi}
              >
                Tap to Interrupt
              </button>
            )}
          </div>
        </div>

        {/* Real-time Live Speech Caption */}
        <div className="live-transcript-box">
          {transcriptLive ? (
            <div className="live-caption-stream user">
              <span className="caption-tag">You:</span>
              <span className="caption-text">{transcriptLive}</span>
            </div>
          ) : recentTurns.length > 0 ? (
            <div className="live-turns-history">
              {recentTurns.map((t, idx) => (
                <div key={idx} className={`live-turn-row ${t.role}`}>
                  <span className="turn-label">{t.role === 'assistant' ? 'Assistant:' : 'You:'}</span>
                  <span className="turn-content">{t.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="live-placeholder-hint">
              <p>Speak your symptoms freely in <strong>English</strong> or <strong>हिंदी</strong>.</p>
              <span>No need to press buttons. The assistant responds and allows natural interruptions.</span>
            </div>
          )}
        </div>

        {/* Live SOCRATES Mini Bar */}
        <div className="live-socrates-status-bar">
          <span className="soc-mini-label">Symptom Summary:</span>
          <span className="soc-mini-val">
            <strong>{socratesHpi?.chief_complaint || 'Identifying concerns...'}</strong>
            {socratesHpi?.site && ` • Site: ${socratesHpi.site}`}
            {socratesHpi?.onset && ` • Onset: ${socratesHpi.onset}`}
            {socratesHpi?.severity && ` • Severity: ${socratesHpi.severity}/10`}
          </span>
        </div>

        {/* Bottom Bar Controls */}
        <div className="live-voice-footer">
          <button
            type="button"
            className="btn-return-chat"
            onClick={onClose}
          >
            Return to Text Chat
          </button>
          
          <button
            type="button"
            className={`btn-mute-toggle ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopLiveSession : startLiveListening}
          >
            {isListening ? 'Pause Mic' : 'Resume Mic'}
          </button>
        </div>
      </div>
    </div>
  )
}
