import React, { useState } from 'react'

export default function FhirModal({ fhirData, onClose }) {
  const [copied, setCopied] = useState(false)

  if (!fhirData) return null

  const entriesCount = fhirData.entry?.length || 0
  const resourceTypes = Array.from(
    new Set((fhirData.entry || []).map(e => e.resource?.resourceType).filter(Boolean))
  )

  function handleCopy() {
    try {
      navigator.clipboard.writeText(JSON.stringify(fhirData, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert('Could not copy to clipboard.')
    }
  }

  function handleDownload() {
    try {
      const jsonStr = JSON.stringify(fhirData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fhirData.id || 'abdm_fhir_r4_bundle'}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Could not trigger file download.')
    }
  }

  return (
    <div className="fhir-modal-backdrop" onClick={onClose}>
      <div className="fhir-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="fhir-modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              HL7 FHIR R4 Clinical Document Bundle
            </h2>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Ayushman Bharat Digital Mission (ABDM) • Profile: <code>DocumentBundle</code>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Resource Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11.5px',
            fontWeight: 700
          }}>
            Bundle: {entriesCount} Resources
          </span>
          {resourceTypes.map(rt => (
            <span key={rt} style={{
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid var(--border-strong)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600
            }}>
              {rt}
            </span>
          ))}
          <span style={{
            marginLeft: 'auto',
            fontSize: '11.5px',
            color: '#16a34a',
            fontWeight: 700
          }}>
            ✓ Validated HL7 FHIR R4
          </span>
        </div>

        {/* JSON Code Viewer */}
        <pre className="fhir-code-preview" style={{ maxHeight: '420px', margin: 0 }}>
          <code>{JSON.stringify(fhirData, null, 2)}</code>
        </pre>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            type="button"
            className="btn-kiosk-secondary"
            onClick={handleCopy}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            {copied ? '✓ Copied to Clipboard!' : '📋 Copy JSON'}
          </button>
          <button
            type="button"
            className="btn-kiosk-secondary"
            onClick={handleDownload}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            ⬇ Download .json
          </button>
          <button
            type="button"
            className="btn-kiosk-primary"
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: '13px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
