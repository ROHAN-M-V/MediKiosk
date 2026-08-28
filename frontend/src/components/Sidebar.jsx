export default function Sidebar({
  profile,
  onEditProfile,
  conversations,
  activeConversation,
  onSelectConversation,
  onNewConversation,
  user,
  onSignOut
}) {
  function getInitials(name) {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <h1>MedX</h1>
        </div>
      </div>

      {/* Main sidebar content */}
      <div className="sidebar-section">
        {/* User's Personal Medical Profile Card */}
        <div className="section-title">My Health Profile</div>
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar">
              {getInitials(profile?.name || user?.email || 'User')}
            </div>
            <div className="profile-details">
              <div className="profile-name">{profile?.name || 'My Profile'}</div>
              <div className="profile-meta">
                {profile?.age ? `${profile.age} yrs` : 'Age not set'}
                {profile?.gender ? ` • ${profile.gender}` : ''}
              </div>
            </div>
          </div>

          {/* Profile Tags / Quick info */}
          <div className="profile-tags">
            {profile?.conditions?.length > 0 ? (
              profile.conditions.slice(0, 2).map((c, i) => (
                <span key={i} className="profile-tag" title={c}>{c}</span>
              ))
            ) : (
              <span className="profile-tag-empty">No conditions added</span>
            )}
          </div>

          <button className="btn-edit-profile" onClick={onEditProfile}>
            Edit Medical Info
          </button>
        </div>

        {/* Consultations History */}
        <div className="section-title" style={{ marginTop: '24px' }}>
          Consultations
        </div>
        
        <button className="btn-new" onClick={onNewConversation}>
          + New Consultation
        </button>

        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="conversations-empty">No past consultations</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                onClick={() => onSelectConversation(conv)}
              >
                💬 {conv.title || `Consultation ${formatDate(conv.created_at)}`}
              </div>
            ))
          )}
        </div>
      </div>

      {/* User footer & Sign Out */}
      {user && (
        <div className="sidebar-user-footer">
          <div className="user-info">
            <div className="user-avatar">
              {getInitials(user.email || profile?.name || 'User')}
            </div>
            <div className="user-email" title={user.email || 'Local User'}>
              {user.email || 'Local User'}
            </div>
          </div>
          <button className="btn-signout" onClick={onSignOut} title="Sign Out">
            Sign Out
          </button>
        </div>
      )}
    </aside>
  )
}
