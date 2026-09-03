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
          <h2>Step 3: Past Medical Records (Optional)</h2>
          <p className="card-subtitle">
            If you have previous prescriptions or lab reports, you can upload them here for your doctor to review. You may also skip this step.
          </p>
        </div>

        <div className="doc-scanner-grid">
          {/* Left Column: Upload Dropzone & Camera */}
          <div className="scanner-upload-pane">
            <div className="form-group">
              <label>Select Document Type</label>
              <div className="doc-type-pills">
                {[
                  { id: 'prescription', label: 'Prescription' },
                  { id: 'lab_report', label: 'Lab Report' },
                  { id: 'discharge_summary', label: 'Discharge Summary' },
                  { id: 'imaging_report', label: 'Scan / X-Ray' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`doc-pill ${docType === item.id ? 'active' : ''}`}
                    onClick={() => setDocType(item.id)}
                  >
                    {item.label}
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
              <p>Supports Photos, JPG, PNG, and PDF files</p>
              
              <div className="scanner-action-buttons">
                <label className="btn-file-browse">
                  Browse Files
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt,.csv,.json,.md"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    disabled={isLoading}
                  />
                </label>

                <label className="btn-camera-capture">
                  Take Photo
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

              {isLoading && <div className="scanning-indicator">Reading and processing document...</div>}
            </div>

            <p className="scanner-note">
              Records are securely stored and viewable only by your attending physician.
            </p>
          </div>

          {/* Right Column: Records Preview */}
          <div className="scanner-results-pane">
            <h3>Uploaded Documents ({documents.length})</h3>

            {documents.length === 0 ? (
              <div className="no-docs-box">
                <p>No documents uploaded yet. This step is completely optional.</p>
              </div>
            ) : (
              <div className="doc-cards-scroll">
                {documents.map((doc, idx) => {
                  const entities = doc.extracted_entities || {}
                  return (
                    <div key={idx} className="extracted-doc-card">
                      <div className="doc-card-top">
                        <span className="doc-type-badge">{doc.doc_type?.replace('_', ' ').toUpperCase()}</span>
                        <span className="doc-filename">{doc.file_name}</span>
                      </div>

                      {/* Summary */}
                      {entities.summary && (
                        <div className="entity-summary-text">{entities.summary}</div>
                      )}

                      {/* Diagnoses */}
                      {entities.diagnoses?.length > 0 && (
                        <div className="entity-section">
                          <span className="entity-label">Findings:</span>
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
                          <span className="entity-label">Medicines Mentioned:</span>
                          <div className="entity-med-list">
                            {entities.medications.map((m, i) => (
                              <div key={i} className="entity-med-row">
                                <strong>{m.name}</strong> {m.dosage ? `— ${m.dosage}` : ''} {m.frequency ? `(${m.frequency})` : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lab Results */}
                      {entities.lab_results?.length > 0 && (
                        <div className="entity-section">
                          <span className="entity-label">Test Results:</span>
                          <div className="lab-results-table">
                            {entities.lab_results.map((l, i) => (
                              <div key={i} className={`lab-row ${l.is_abnormal ? 'abnormal' : 'normal'}`}>
                                <span className="lab-name">{l.test_name}</span>
                                <span className="lab-val">{l.value} {l.unit}</span>
                                {l.reference_range && <span className="lab-ref">Normal: {l.reference_range}</span>}
                                {l.is_abnormal && <span className="abnormal-flag">{l.flag || 'ATTENTION'}</span>}
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
            disabled={isLoading}
          >
            {isLoading && <span className="btn-spinner"></span>}
            {isLoading ? 'Processing Document...' : (documents.length === 0 ? 'Skip to Confirmation (Step 4) →' : 'Continue to Confirmation (Step 4) →')}
          </button>
        </div>
      </div>
    </div>
  )
}
