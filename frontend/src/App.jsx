/**
 * ============================================================
 * SmartHelm v2.0 Dashboard — Main App
 * ============================================================
 *
 * UPGRADE: Multi-sensor fusion display (horn + crash + alcohol).
 *
 * Features:
 *   - Dual audio: short beep for horn, loud siren for crash/SOS
 *   - Visual emergency flash on new alert
 *   - Crisis Mode: header flashes red for SOS / crash / high risk
 *   - Battery level tracking from helmet
 *   - Mute/Unmute toggle for audio
 *   - Emergency SOS trigger button
 *   - Multi-type simulation (horn / crash / alcohol)
 *   - Risk score display
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import StatusCards from './components/StatusCards';
import AlertList from './components/AlertList';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:5000` : 'http://localhost:5000');

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [crisisMode, setCrisisMode] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [sosActive, setSosActive] = useState(false);

  // Sensor stats from backend
  const [sensorStats, setSensorStats] = useState({
    horn_count: 0, crash_count: 0, alcohol_count: 0
  });

  const prevAlertCountRef = useRef(0);
  const beepRef = useRef(null);
  const sirenRef = useRef(null);
  const flashTimeoutRef = useRef(null);
  const crisisTimeoutRef = useRef(null);

  const playSound = useCallback((intensity, isSOS = false, type = 'horn') => {
    if (isMuted) return;
    try {
      const useSiren = intensity >= 90 || isSOS || type === 'crash';
      const audioEl = useSiren ? sirenRef.current : beepRef.current;
      if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {
          console.warn('Audio playback blocked by browser policy.');
        });
      }
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }, [isMuted]);

  const triggerFlash = useCallback(() => {
    setIsFlashing(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setIsFlashing(false), 2000);
  }, []);

  const activateCrisisMode = useCallback(() => {
    setCrisisMode(true);
    if (crisisTimeoutRef.current) clearTimeout(crisisTimeoutRef.current);
    crisisTimeoutRef.current = setTimeout(() => setCrisisMode(false), 5000);
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts`);
      if (res.ok) {
        const data = await res.json();
        const newAlerts = data.alerts || [];
        setAlerts(newAlerts);
        setIsOnline(true);

        if (data.battery_level !== null && data.battery_level !== undefined) {
          setBatteryLevel(data.battery_level);
        }

        setSosActive(data.sos_active || false);

        // Update sensor stats
        setSensorStats({
          horn_count: data.horn_count || 0,
          crash_count: data.crash_count || 0,
          alcohol_count: data.alcohol_count || 0,
        });

        // Detect new alerts
        if (newAlerts.length > prevAlertCountRef.current && prevAlertCountRef.current > 0) {
          const newestAlert = newAlerts[0];
          const intensity = newestAlert?.intensity_db || 0;
          const isSOS = newestAlert?.is_sos || newestAlert?.type === 'SOS';
          const type = newestAlert?.type || 'horn';

          playSound(intensity, isSOS, type);
          triggerFlash();

          if (intensity >= 95 || isSOS || type === 'crash') {
            activateCrisisMode();
          }
        }

        prevAlertCountRef.current = newAlerts.length;
      } else {
        setIsOnline(false);
      }
    } catch {
      setIsOnline(false);
    }
  }, [playSound, triggerFlash, activateCrisisMode]);

  /**
   * Simulate alert — supports type param (horn, crash, alcohol).
   */
  const simulateAlert = async (type = null) => {
    try {
      const url = type
        ? `${API_BASE}/simulate?type=${type}`
        : `${API_BASE}/simulate`;
      await fetch(url, { method: 'POST' });
      fetchAlerts();
    } catch {
      console.error('Failed to simulate alert');
    }
  };

  const triggerSOS = async () => {
    try {
      await fetch(`${API_BASE}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: 12.9716,
          lng: 77.5946,
          device_id: 'DASH-SOS',
          message: 'Manual SOS triggered from dashboard',
        }),
      });
      fetchAlerts();
    } catch {
      console.error('Failed to send SOS');
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 2000);
    return () => {
      clearInterval(interval);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (crisisTimeoutRef.current) clearTimeout(crisisTimeoutRef.current);
    };
  }, [fetchAlerts]);

  return (
    <>
      {/* Hidden audio elements */}
      <audio ref={beepRef} src="/beep.wav" preload="auto" />
      <audio ref={sirenRef} src="/siren.wav" preload="auto" />

      {/* Emergency flash overlay */}
      <div className={`emergency-flash ${isFlashing ? 'emergency-flash--active' : ''}`} />

      {/* Crisis mode overlay */}
      <div className={`crisis-overlay ${crisisMode ? 'crisis-overlay--active' : ''}`} />

      {/* Top Navigation Bar */}
      <Navbar
        isOnline={isOnline}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(prev => !prev)}
        batteryLevel={batteryLevel}
        sosActive={sosActive}
      />

      {/* Main Dashboard Content */}
      <main className="dashboard">
        {/* Page Header */}
        <div className={`dashboard__header ${crisisMode ? 'dashboard__header--crisis' : ''}`}>
          <h1 className="dashboard__title">
            {crisisMode && <span className="crisis-icon">🚨 </span>}
            Dashboard
            {crisisMode && <span className="crisis-tag">CRISIS MODE</span>}
          </h1>
          <p className="dashboard__desc">
            {crisisMode
              ? '⚠️ CRITICAL ALERT DETECTED — Emergency contacts notified!'
              : 'Multi-sensor safety monitoring: Horn Detection · Crash Detection · Alcohol Detection'
            }
          </p>
        </div>

        {/* KPI Status Cards */}
        <StatusCards
          alerts={alerts}
          isOnline={isOnline}
          batteryLevel={batteryLevel}
          sensorStats={sensorStats}
        />

        {/* Actions: Simulate + SOS */}
        <div className="actions-bar">
          <h2 className="actions-bar__title">Alert History</h2>
          <div className="actions-bar__buttons">
            <button className="btn btn--sim-horn" onClick={() => simulateAlert('horn')}>
              📢 Sim Horn
            </button>
            <button className="btn btn--sim-crash" onClick={() => simulateAlert('crash')}>
              💥 Sim Crash
            </button>
            <button className="btn btn--sim-alcohol" onClick={() => simulateAlert('alcohol')}>
              🍺 Sim Alcohol
            </button>
            <button className="btn btn--simulate" onClick={() => simulateAlert()}>
              🧪 Random
            </button>
            <button className="btn btn--sos" onClick={triggerSOS}>
              🆘 Trigger SOS
            </button>
          </div>
        </div>

        {/* Alert List Table */}
        <AlertList alerts={alerts} />
      </main>
    </>
  );
}
