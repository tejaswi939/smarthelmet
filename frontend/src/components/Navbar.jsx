/**
 * Navbar Component
 * Displays the SmartHelm brand, tagline, live status indicator,
 * Mute/Unmute toggle, and helmet battery level indicator.
 */
export default function Navbar({ isOnline, isMuted, onToggleMute, batteryLevel, sosActive }) {

  /**
   * Get battery icon and color class based on percentage.
   */
  function getBatteryInfo(level) {
    if (level === null || level === undefined) return { icon: '🔋', className: 'battery--unknown', label: '—' };
    if (level > 60) return { icon: '🔋', className: 'battery--good', label: `${level}%` };
    if (level > 25) return { icon: '🪫', className: 'battery--mid', label: `${level}%` };
    return { icon: '🪫', className: 'battery--low', label: `${level}%` };
  }

  const battery = getBatteryInfo(batteryLevel);

  return (
    <nav className={`navbar ${sosActive ? 'navbar--sos' : ''}`}>
      {/* Brand */}
      <div className="navbar__brand">
        <div className="navbar__icon">🪖</div>
        <div>
          <div className="navbar__title">SmartHelm</div>
          <div className="navbar__subtitle">Real-Time Horn Detection System</div>
        </div>
      </div>

      {/* Right side controls */}
      <div className="navbar__controls">
        {/* Battery Indicator */}
        <div className={`navbar__battery ${battery.className}`} title={`Helmet battery: ${battery.label}`}>
          <div className="navbar__battery-icon">{battery.icon}</div>
          <div className="navbar__battery-info">
            <span className="navbar__battery-label">Helmet</span>
            <div className="navbar__battery-bar-wrap">
              <div
                className="navbar__battery-bar-fill"
                style={{ width: batteryLevel !== null ? `${Math.max(4, batteryLevel)}%` : '0%' }}
              />
            </div>
            <span className="navbar__battery-pct">{battery.label}</span>
          </div>
        </div>

        {/* Mute/Unmute Toggle */}
        <button
          className={`btn btn--mute ${isMuted ? 'btn--mute-active' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute audio alerts' : 'Mute audio alerts'}
          id="mute-toggle"
        >
          <span className="btn--mute__icon">
            {isMuted ? '🔇' : '🔊'}
          </span>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>

        {/* Status Indicator */}
        <div className="navbar__status" style={
          isOnline
            ? {}
            : { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }
        }>
          <span
            className={`navbar__status-dot ${isOnline ? 'navbar__status-dot--online' : 'navbar__status-dot--offline'}`}
            style={isOnline ? {} : { background: '#ef4444' }}
          ></span>
          {isOnline ? 'System Online' : 'Connecting…'}
        </div>
      </div>
    </nav>
  );
}
