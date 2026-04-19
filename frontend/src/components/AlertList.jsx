/**
 * AlertList Component
 * Renders a table of all horn alerts, newest first.
 * Displays type badge, color-coded intensity bar, GPS link, device ID, and timestamp.
 *
 * Enhanced:
 *  - SOS alert type with critical red badge
 *  - Color-coded intensity bars with labels (Quiet/Medium/Loud/Critical)
 *  - Battery level column
 *  - Severity-based row shimmer for high-dB alerts
 *  - New-alert flash animation on newest row
 */
export default function AlertList({ alerts }) {
  /**
   * Get the CSS class for the intensity bar fill color.
   */
  function getIntensityClass(db) {
    if (db >= 95) return 'intensity-bar__fill--critical';
    if (db >= 90) return 'intensity-bar__fill--high';
    if (db >= 80) return 'intensity-bar__fill--mid';
    return 'intensity-bar__fill--low';
  }

  /**
   * Get a human-readable severity label for the dB level.
   */
  function getSeverityLabel(db, isSOS) {
    if (isSOS || db >= 95) return { text: 'Critical', className: 'severity--critical' };
    if (db >= 90) return { text: 'Loud', className: 'severity--high' };
    if (db >= 80) return { text: 'Medium', className: 'severity--mid' };
    return { text: 'Quiet', className: 'severity--low' };
  }

  /**
   * Calculate the fill width for the intensity bar (70-105 dB range).
   */
  function getIntensityWidth(db) {
    const min = 70;
    const max = 105;
    const pct = Math.min(100, Math.max(0, ((db - min) / (max - min)) * 100));
    return `${pct}%`;
  }

  /**
   * Get the type badge info.
   */
  function getTypeBadge(alert) {
    if (alert.is_sos || alert.type === 'SOS') {
      return { className: 'badge--sos', label: '🚨 SOS' };
    }
    if (alert.device_id === 'SIM-001' || alert.device_id === 'DASH-SOS') {
      return { className: 'badge--sim', label: '🧪 Simulated' };
    }
    return { className: 'badge--horn', label: '📢 Horn' };
  }

  /**
   * Format timestamp to a more readable short format.
   */
  function formatTime(timestamp) {
    if (!timestamp) return '—';
    const parts = timestamp.split(' ');
    if (parts.length === 2) {
      return (
        <>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{parts[0]}</span>
          <br />
          <span style={{ fontWeight: 500 }}>{parts[1]}</span>
        </>
      );
    }
    return timestamp;
  }

  /**
   * Get battery display for inline cell.
   */
  function getBatteryCell(level) {
    if (level === null || level === undefined) return <span style={{ color: '#475569' }}>—</span>;
    const color = level > 60 ? 'var(--accent-green)' : level > 25 ? 'var(--accent-orange)' : 'var(--accent-red)';
    return (
      <div className="battery-cell">
        <div className="battery-cell__bar">
          <div className="battery-cell__fill" style={{ width: `${level}%`, background: color }} />
        </div>
        <span className="battery-cell__pct" style={{ color }}>{level}%</span>
      </div>
    );
  }

  // If there are no alerts, show an empty state
  if (alerts.length === 0) {
    return (
      <div className="alert-list">
        <div className="alert-list__empty">
          <div className="alert-list__empty-icon">🛡️</div>
          <div className="alert-list__empty-text">No alerts yet</div>
          <div className="alert-list__empty-sub">
            Waiting for horn detections… Use the Simulate button to test.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-list">
      <table className="alert-list__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Intensity</th>
            <th>Severity</th>
            <th>Location</th>
            <th>Battery</th>
            <th>Device</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => {
            const isSOS = alert.is_sos || alert.type === 'SOS';
            const severity = getSeverityLabel(alert.intensity_db, isSOS);
            const typeBadge = getTypeBadge(alert);
            return (
              <tr
                key={alert.id}
                className={`
                  ${index === 0 ? 'new-alert' : ''}
                  ${isSOS ? 'row--sos' : alert.intensity_db >= 90 ? 'row--danger' : ''}
                `}
              >
                {/* Alert ID */}
                <td style={{ color: '#64748b', fontWeight: 600 }}>
                  {alert.id}
                </td>

                {/* Type Badge */}
                <td>
                  <span className={`badge ${typeBadge.className}`}>
                    {typeBadge.label}
                  </span>
                </td>

                {/* Intensity with visual bar */}
                <td>
                  <div className="intensity-bar">
                    <span style={{ fontWeight: 600, minWidth: '50px' }}>
                      {alert.intensity_db} dB
                    </span>
                    <div className="intensity-bar__track">
                      <div
                        className={`intensity-bar__fill ${getIntensityClass(alert.intensity_db)}`}
                        style={{ width: getIntensityWidth(alert.intensity_db) }}
                      />
                    </div>
                  </div>
                </td>

                {/* Severity Label */}
                <td>
                  <span className={`severity-badge ${severity.className}`}>
                    {severity.text}
                  </span>
                </td>

                {/* GPS Location — clickable Google Maps link */}
                <td>
                  {alert.lat && alert.lng ? (
                    <a
                      className="gps-link"
                      href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📍 {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                    </a>
                  ) : (
                    <span style={{ color: '#475569' }}>N/A</span>
                  )}
                </td>

                {/* Battery Level */}
                <td>
                  {getBatteryCell(alert.battery_level)}
                </td>

                {/* Device ID */}
                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {alert.device_id}
                </td>

                {/* Timestamp */}
                <td style={{ fontSize: '13px' }}>
                  {formatTime(alert.timestamp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
