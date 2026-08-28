import React from 'react'

export default function FhirModal({ fhirData, onClose }) {
  if (!fhirData) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal fhir-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div>
            <h2>HL7 FHIR R4 Clinical Bundle</h2>
            <span className="fhir-sub">ABDM Standard Composition Export</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div className="fhir-code-view">
          <pre>
            <code>{JSON.stringify(fhirData, null, 2)}</code>
          </pre>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-kiosk-secondary"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(fhirData, null, 2))
              alert('FHIR JSON copied to clipboard!')
            }}
          >
            📋 Copy JSON
          </button>
          <button type="button" className="btn-kiosk-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
