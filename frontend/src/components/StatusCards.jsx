/**
 * StatusCards Component
 * Displays five KPI cards: Total Alerts, Avg Intensity, Devices, Battery, System Status.
 * The system status card features a heartbeat pulse animation when online.
 * Battery card shows real-time helmet charge level.
 */
import { useState, useEffect, useRef } from 'react';

export default function StatusCards({ alerts, isOnline, batteryLevel }) {
  // Total alerts
  const totalAlerts = alerts.length;

  // SOS count
  const sosCount = alerts.filter(a => a.is_sos || a.type === 'SOS').length;

  // Average intensity
  const avgIntensity = totalAlerts > 0
    ? (alerts.reduce((sum, a) => sum + (a.intensity_db || 0), 0) / totalAlerts).toFixed(1)
    : '—';

  // Max intensity (peak)
  const maxIntensity = totalAlerts > 0
    ? Math.max(...alerts.map(a => a.intensity_db || 0)).toFixed(1)
    : '—';

  // Unique devices
  const devices = [...new Set(alerts.map(a => a.device_id))];
  const deviceLabel = devices.length > 0 ? devices.join(', ') : 'No devices';

  // Battery display
  const batteryDisplay = batteryLevel !== null && batteryLevel !== undefined ? batteryLevel : '—';
  const batteryColor = batteryLevel > 60 ? 'var(--accent-green)' : batteryLevel > 25 ? 'var(--accent-orange)' : 'var(--accent-red)';

  // Live uptime counter
  const [uptime, setUptime] = useState(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div className="status-cards">
      {/* Card 1: Total Alerts */}
      <div className="status-card status-card--alerts">
        <div className="status-card__header">
          <span className="status-card__label">Total Alerts</span>
          <div className="status-card__icon">🔔</div>
        </div>
        <div className="status-card__value">{totalAlerts}</div>
        <div className="status-card__sub">
          {sosCount > 0 ? `${sosCount} SOS · ${totalAlerts - sosCount} Horn` : 'Horn events detected'}
        </div>
      </div>

      {/* Card 2: Avg Intensity */}
      <div className="status-card status-card--intensity">
        <div className="status-card__header">
          <span className="status-card__label">Avg Intensity</span>
          <div className="status-card__icon">📊</div>
        </div>
        <div className="status-card__value">{avgIntensity}<span style={{ fontSize: '16px', fontWeight: 400 }}> dB</span></div>
        <div className="status-card__sub">Peak: {maxIntensity} dB</div>
      </div>

      {/* Card 3: Battery Level */}
      <div className={`status-card status-card--battery ${batteryLevel !== null && batteryLevel <= 25 ? 'status-card--battery-low' : ''}`}>
        <div className="status-card__header">
          <span className="status-card__label">Helmet Battery</span>
          <div className="status-card__icon">🔋</div>
        </div>
        <div className="status-card__value" style={{ color: batteryColor }}>
          {batteryDisplay}
          {batteryLevel !== null && <span style={{ fontSize: '16px', fontWeight: 400 }}>%</span>}
        </div>
        {/* Visual battery bar */}
        <div className="battery-visual">
          <div className="battery-visual__shell">
            <div
              className="battery-visual__fill"
              style={{
                width: batteryLevel !== null ? `${batteryLevel}%` : '0%',
                background: batteryColor,
              }}
            />
          </div>
          <div className="battery-visual__tip" />
        </div>
        <div className="status-card__sub">
          {batteryLevel === null ? 'Waiting for data…' :
            batteryLevel > 60 ? 'Charge level healthy' :
            batteryLevel > 25 ? 'Consider charging soon' :
            '⚠️ Low battery — charge now!'}
        </div>
      </div>

      {/* Card 4: Devices */}
      <div className="status-card status-card--device">
        <div className="status-card__header">
          <span className="status-card__label">Devices</span>
          <div className="status-card__icon">📡</div>
        </div>
        <div className="status-card__value">{devices.length}</div>
        <div className="status-card__sub">{deviceLabel}</div>
      </div>

      {/* Card 5: System Status with Heartbeat */}
      <div className="status-card status-card--uptime">
        <div className="status-card__header">
          <span className="status-card__label">System</span>
          <div className="status-card__icon">⚡</div>
        </div>
        <div className="status-card__value">
          <div className="heartbeat-container">
            <span className={`heartbeat-dot ${isOnline ? 'heartbeat-dot--alive' : ''}`}></span>
            <span className="heartbeat-label">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        <div className="status-card__sub">Uptime: {formatUptime(uptime)}</div>
        {/* SVG Heartbeat line */}
        {isOnline && (
          <div className="heartbeat-wave">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="heartbeat-svg">
              <polyline
                className="heartbeat-line"
                fill="none"
                stroke="var(--accent-purple)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,20 30,20 40,20 50,8 55,32 60,5 65,35 70,20 80,20 110,20 120,20 130,8 135,32 140,5 145,35 150,20 160,20 200,20"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
