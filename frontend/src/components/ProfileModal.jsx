import { useState, useEffect } from 'react'

export default function ProfileModal({ profile, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    conditions: '',
    allergies: '',
    medications: '',
    notes: ''
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        age: profile.age ? String(profile.age) : '',
        gender: profile.gender || '',
        conditions: Array.isArray(profile.conditions) ? profile.conditions.join(', ') : '',
        allergies: Array.isArray(profile.allergies) ? profile.allergies.join(', ') : '',
        medications: Array.isArray(profile.medications) ? profile.medications.join(', ') : '',
        notes: profile.notes || ''
      })
    }
  }, [profile])

  function handleChange(e) {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!formData.name.trim()) return

    onSave({
      name: formData.name.trim(),
      age: formData.age ? parseInt(formData.age) : null,
      gender: formData.gender || null,
      conditions: formData.conditions
        ? formData.conditions.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      allergies: formData.allergies
        ? formData.allergies.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      medications: formData.medications
        ? formData.medications.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      notes: formData.notes.trim()
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>My Medical Profile</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="profile-name">Full Name *</label>
            <input
              id="profile-name"
              name="name"
              type="text"
              placeholder="Your full name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="profile-age">Age</label>
              <input
                id="profile-age"
                name="age"
                type="number"
                placeholder="Years"
                min="0"
                max="150"
                value={formData.age}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-gender">Gender</label>
              <select
                id="profile-gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="">Select...</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="profile-conditions">Known Conditions / Diagnoses</label>
            <input
              id="profile-conditions"
              name="conditions"
              type="text"
              placeholder="e.g. Asthma, Hypertension, Migraines"
              value={formData.conditions}
              onChange={handleChange}
            />
            <div className="form-hint">Separate multiple with commas</div>
          </div>

          <div className="form-group">
            <label htmlFor="profile-allergies">Allergies</label>
            <input
              id="profile-allergies"
              name="allergies"
              type="text"
              placeholder="e.g. Penicillin, Peanuts, Latex"
              value={formData.allergies}
              onChange={handleChange}
            />
            <div className="form-hint">Separate multiple with commas</div>
          </div>

          <div className="form-group">
            <label htmlFor="profile-medications">Active Medications</label>
            <input
              id="profile-medications"
              name="medications"
              type="text"
              placeholder="e.g. Albuterol inhaler, Vitamin D3"
              value={formData.medications}
              onChange={handleChange}
            />
            <div className="form-hint">Separate multiple with commas</div>
          </div>

          <div className="form-group">
            <label htmlFor="profile-notes">Health Notes / Medical History</label>
            <textarea
              id="profile-notes"
              name="notes"
              rows="3"
              placeholder="Any past surgeries, family health history, or other context..."
              value={formData.notes}
              onChange={handleChange}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
