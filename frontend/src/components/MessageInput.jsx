import { useState, useRef } from 'react'

export default function MessageInput({ onSend, disabled, isLoading }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  function handleFileSelect(e) {
    const selected = e.target.files[0]
    if (!selected) return

    setFile(selected)

    // Create preview for images
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setFilePreview(ev.target.result)
      reader.readAsDataURL(selected)
    } else {
      setFilePreview(null)
    }
  }

  function removeFile() {
    setFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleSend() {
    if (disabled || (!text.trim() && !file)) return
    onSend(text, file)
    setText('')
    setFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextChange(e) {
    setText(e.target.value)
    // Auto-resize textarea
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  return (
    <div className="input-area">
      <div className="input-container">
        {/* File preview */}
        {file && (
          <div className="file-preview">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="preview-thumb" />
            ) : (
              <div className="preview-icon">📄</div>
            )}
            <div className="preview-info">
              <div className="preview-name">{file.name}</div>
              <div className="preview-size">{formatFileSize(file.size)}</div>
            </div>
            <button className="preview-remove" onClick={removeFile}>✕</button>
          </div>
        )}

        {/* Input box */}
        <div className="input-box">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? 'Select a conversation first...'
                : 'Describe your symptoms, ask about medications, upload an image or lab report...'
            }
            disabled={disabled}
            rows={1}
          />

          <div className="input-actions">
            {/* File upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,.txt,.csv,.md,.json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <button
              className="action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach file or document"
            >
              📎
            </button>

            {/* Image upload */}
            <button
              className="action-btn"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = (e) => {
                  const f = e.target.files[0]
                  if (f) {
                    setFile(f)
                    const reader = new FileReader()
                    reader.onload = (ev) => setFilePreview(ev.target.result)
                    reader.readAsDataURL(f)
                  }
                }
                input.click()
              }}
              disabled={disabled}
              title="Upload medical image"
            >
              🖼️
            </button>

            {/* Send */}
            <button
              className="action-btn send-btn"
              onClick={handleSend}
              disabled={disabled || (!text.trim() && !file)}
              title="Send message"
            >
              {isLoading ? '⏳' : '➤'}
            </button>
          </div>
        </div>

        <div className="input-hint">
          MedX provides AI clinical triage & health information. Press Enter to send, Shift+Enter for new line.
        </div>
      </div>
    </div>
  )
}
