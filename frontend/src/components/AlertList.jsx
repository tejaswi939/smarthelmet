/**
 * AlertList Component v2.0
 * Renders a table of all alerts (horn, crash, alcohol, SOS), newest first.
 * Displays type badge, intensity, risk score, GPS link, device ID, timestamp.
 */
export default function AlertList({ alerts }) {

  function getIntensityClass(db) {
    if (db >= 95) return 'intensity-bar__fill--critical';
    if (db >= 90) return 'intensity-bar__fill--high';
    if (db >= 80) return 'intensity-bar__fill--mid';
    return 'intensity-bar__fill--low';
  }

  function getRiskClass(risk) {
    if (risk >= 70) return 'severity--critical';
    if (risk >= 30) return 'severity--high';
    return 'severity--low';
  }

  function getRiskLabel(risk) {
    if (risk >= 70) return 'Critical';
    if (risk >= 30) return 'Warning';
    return 'Normal';
  }

  function getIntensityWidth(db) {
    const min = 20;
    const max = 105;
    const pct = Math.min(100, Math.max(0, ((db - min) / (max - min)) * 100));
    return `${pct}%`;
  }

  function getTypeBadge(alert) {
    if (alert.is_sos || alert.type === 'SOS') {
      return { className: 'badge--sos', label: '🚨 SOS' };
    }
    if (alert.type === 'crash') {
      return { className: 'badge--crash', label: '💥 Crash' };
    }
    if (alert.type === 'alcohol') {
      return { className: 'badge--alcohol', label: '🍺 Alcohol' };
    }
    if (alert.type === 'fusion') {
      return { className: 'badge--fusion', label: '🧠 Fusion' };
    }
    if (alert.device_id === 'SIM-001' || alert.device_id === 'DASH-SOS') {
      return { className: 'badge--sim', label: '🧪 Simulated' };
    }
    return { className: 'badge--horn', label: '📢 Horn' };
  }

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

  if (alerts.length === 0) {
    return (
      <div className="alert-list">
        <div className="alert-list__empty">
          <div className="alert-list__empty-icon">🛡️</div>
          <div className="alert-list__empty-text">No alerts yet</div>
          <div className="alert-list__empty-sub">
            Waiting for sensor events… Use the simulation buttons to test.
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
            <th>Risk</th>
            <th>Sensors</th>
            <th>Location</th>
            <th>Battery</th>
            <th>Device</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => {
            const isSOS = alert.is_sos || alert.type === 'SOS';
            const isCrash = alert.type === 'crash';
            const typeBadge = getTypeBadge(alert);
            const risk = alert.risk_score || 0;
            return (
              <tr
                key={alert.id}
                className={`
                  ${index === 0 ? 'new-alert' : ''}
                  ${isSOS ? 'row--sos' : isCrash ? 'row--danger' : risk >= 70 ? 'row--danger' : ''}
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

                {/* Risk Score */}
                <td>
                  <span className={`severity-badge ${getRiskClass(risk)}`}>
                    {risk} — {getRiskLabel(risk)}
                  </span>
                </td>

                {/* Sensor Data Summary */}
                <td>
                  <div className="sensor-cell">
                    {alert.accel_g > 0 && (
                      <span className="sensor-chip sensor-chip--accel" title="Acceleration (g)">
                        ⚡{alert.accel_g}g
                      </span>
                    )}
                    {alert.alcohol_ppm > 0 && (
                      <span className="sensor-chip sensor-chip--alcohol" title="Alcohol (ppm)">
                        🧪{alert.alcohol_ppm}ppm
                      </span>
                    )}
                    {!alert.accel_g && !alert.alcohol_ppm && (
                      <span style={{ color: '#475569', fontSize: '11px' }}>—</span>
                    )}
                  </div>
                </td>

                {/* GPS Location */}
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
