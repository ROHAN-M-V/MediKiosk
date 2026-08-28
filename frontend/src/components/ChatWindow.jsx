import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

export default function ChatWindow({ messages, isLoading, hasConversation }) {
  const bottomRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Empty state if no conversation is selected
  if (!hasConversation) {
    return (
      <div className="messages-area">
        <div className="empty-state">
          <div className="empty-state-badge">MEDX</div>
          <h3>Your Personal AI Health Assistant</h3>
          <p>
            Start a new consultation from the sidebar to ask health questions, analyze medical images, or review documents.
          </p>
          <div className="empty-state-features">
            <div className="feature-card">
              <div className="feature-title">Web Search</div>
              <div className="feature-desc">Real-time medical research, drug interactions, and clinical guidelines</div>
            </div>
            <div className="feature-card">
              <div className="feature-title">Image Analysis</div>
              <div className="feature-desc">Upload X-rays, lab scans, and photos for AI visual review</div>
            </div>
            <div className="feature-card">
              <div className="feature-title">File Review</div>
              <div className="feature-desc">Upload and analyze lab reports, notes, and medical documents</div>
            </div>
            <div className="feature-card">
              <div className="feature-title">Personal Context</div>
              <div className="feature-desc">Responses tailored to your saved medical profile & history</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Messages view
  return (
    <div className="messages-area">
      <div className="messages-container">
        {messages.length === 0 && !isLoading && (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div className="empty-state-badge">READY</div>
            <h3>How can I assist your health today?</h3>
            <p>Describe your symptoms, ask about medications, or upload lab reports/images.</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'assistant' ? 'M' : 'U'}
            </div>
            <div className="message-content">
              {/* Image preview */}
              {msg.file_preview && (
                <img
                  src={msg.file_preview}
                  alt="Uploaded"
                  className="message-image"
                />
              )}

              {/* File attachment indicator */}
              {msg.file_name && !msg.file_preview && (
                <div className="message-file">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{msg.file_name}</span>
                </div>
              )}

              {/* Message text */}
              <div className="message-bubble">
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>

              <div className="message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="typing-indicator">
            <div className="message-avatar">
              M
            </div>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
