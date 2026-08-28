import React, { useState } from 'react'

export default function DocumentScannerStep({
  session,
  documents,
  onUploadDocument,
  onProceedToSummary,
  isLoading
}) {
  const [docType, setDocType] = useState('prescription')
  const [dragOver, setDragOver] = useState(false)

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (file) {
      onUploadDocument(file, docType)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      onUploadDocument(file, docType)
    }
  }

  return (
    <div className="kiosk-step-container">
      <div className="kiosk-card wide">
        <div className="card-header">
          <h2>Medical Records & Multi-Modal OCR Scanner</h2>
          <p className="card-subtitle">
            Upload prior prescriptions, lab reports, or discharge summaries. MediKiosk AI will extract entities and highlight abnormal values.
          </p>
        </div>

        <div className="doc-scanner-grid">
          {/* Left Column: Upload Dropzone & Camera */}
          <div className="scanner-upload-pane">
            <div className="form-group">
              <label>Select Document Type to Scan</label>
              <div className="doc-type-pills">
                {['prescription', 'lab_report', 'discharge_summary', 'imaging_report'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`doc-pill ${docType === t ? 'active' : ''}`}
                    onClick={() => setDocType(t)}
                  >
                    {t === 'prescription' && '💊 Prescription'}
                    {t === 'lab_report' && '🧪 Lab / Blood Test'}
                    {t === 'discharge_summary' && '📋 Discharge Summary'}
                    {t === 'imaging_report' && '🖼️ Scan / Imaging'}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop Zone with File Browse & Camera Action */}
            <div
              className={`dropzone-box ${dragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="dropzone-icon">📄</div>
              <h4>Upload or Take a Photo</h4>
              <p>Supports Photos, Images (JPG, PNG, WEBP), and Documents</p>
              
              <div className="scanner-action-buttons">
                <label className="btn-file-browse">
                  📁 Browse Files
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt,.csv,.json,.md"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    disabled={isLoading}
                  />
                </label>

                <label className="btn-camera-capture">
                  📸 Take Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    disabled={isLoading}
                  />
                </label>
              </div>

              {isLoading && <div className="scanning-indicator">⚡ Running Multi-Modal OCR & Entity Extraction...</div>}
            </div>

            <p className="scanner-note">
              🔒 Documents are securely processed and attached directly to your clinical intake packet.
            </p>
          </div>

          {/* Right Column: Extracted Entities Preview */}
          <div className="scanner-results-pane">
            <h3>Extracted Clinical Entities ({documents.length} Records)</h3>

            {documents.length === 0 ? (
              <div className="no-docs-box">
                <p>No documents uploaded yet. You can upload previous prescriptions or proceed without documents.</p>
              </div>
            ) : (
              <div className="doc-cards-scroll">
                {documents.map((doc, idx) => {
                  const entities = doc.extracted_entities || {}
                  return (
                    <div key={idx} className="extracted-doc-card">
                      <div className="doc-card-top">
                        <span className="doc-type-badge">{doc.doc_type?.toUpperCase()}</span>
                        <span className="doc-filename">{doc.file_name}</span>
                      </div>

                      {/* Summary */}
                      {entities.summary && (
                        <div className="entity-summary-text">{entities.summary}</div>
                      )}

                      {/* Diagnoses */}
                      {entities.diagnoses?.length > 0 && (
                        <div className="entity-section">
                          <span className="entity-label">Diagnoses / Findings:</span>
                          <div className="entity-tags">
                            {entities.diagnoses.map((d, i) => (
                              <span key={i} className="entity-tag diag">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Medications */}
                      {entities.medications?.length > 0 && (
                        <div className="entity-section">
                          <span className="entity-label">Extracted Medications:</span>
                          <div className="entity-med-list">
                            {entities.medications.map((m, i) => (
                              <div key={i} className="entity-med-row">
                                <strong>{m.name}</strong> — {m.dosage} ({m.frequency})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lab Results with Abnormal Highlighting */}
                      {entities.lab_results?.length > 0 && (
                        <div className="entity-section">
                          <span className="entity-label">Lab Tests & Values:</span>
                          <div className="lab-results-table">
                            {entities.lab_results.map((l, i) => (
                              <div key={i} className={`lab-row ${l.is_abnormal ? 'abnormal' : 'normal'}`}>
                                <span className="lab-name">{l.test_name}</span>
                                <span className="lab-val">{l.value} {l.unit}</span>
                                <span className="lab-ref">Ref: {l.reference_range}</span>
                                {l.is_abnormal && <span className="abnormal-flag">{l.flag || 'HIGH'}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Step Navigation */}
        <div className="form-actions-right" style={{ marginTop: '24px' }}>
          <button
            type="button"
            className="btn-kiosk-primary"
            onClick={onProceedToSummary}
          >
            Review & Complete Intake (Step 4) →
          </button>
        </div>
      </div>
    </div>
  )
}
