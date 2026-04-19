/**
 * ============================================================
 * SmartHelm Dashboard — Main App
 * ============================================================
 * Agent 4: Frontend Developer
 *
 * This is the main entry point for the React dashboard.
 * It polls the Flask backend every 2 seconds for new alerts,
 * and renders Navbar, StatusCards, and AlertList components.
 *
 * Features:
 *   - Dual audio: short beep for standard horns, loud siren for >90 dB / SOS
 *   - Visual emergency flash on new alert
 *   - Crisis Mode: header flashes red for SOS / >95 dB alerts
 *   - Battery level tracking from helmet
 *   - Mute/Unmute toggle for audio
 *   - Emergency SOS trigger button
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import StatusCards from './components/StatusCards';
import AlertList from './components/AlertList';

// Backend URL — adjust if your server runs on a different port
const API_BASE = 'http://localhost:5000';

export default function App() {
  // State: list of alerts fetched from the backend
  const [alerts, setAlerts] = useState([]);

  // State: is the backend reachable?
  const [isOnline, setIsOnline] = useState(false);

  // State: is audio muted?
  const [isMuted, setIsMuted] = useState(false);

  // State: visual warning flash active?
  const [isFlashing, setIsFlashing] = useState(false);

  // State: Crisis Mode (SOS or >95 dB detected)
  const [crisisMode, setCrisisMode] = useState(false);

  // State: Latest battery level from helmet
  const [batteryLevel, setBatteryLevel] = useState(null);

  // State: SOS active from backend
  const [sosActive, setSosActive] = useState(false);

  // Ref: track the previous alert count to detect new alerts
  const prevAlertCountRef = useRef(0);

  // Ref: Audio elements — two distinct sounds
  const beepRef = useRef(null);   // Short beep for standard horns
  const sirenRef = useRef(null);  // Loud siren for critical alerts (>90 dB)

  // Ref: flash timeout for cleanup
  const flashTimeoutRef = useRef(null);

  // Ref: crisis mode timeout for cleanup
  const crisisTimeoutRef = useRef(null);

  /**
   * Play the appropriate sound based on alert intensity.
   * - Standard horn (<90 dB): short beep
   * - Critical alert (>=90 dB) or SOS: loud siren
   */
  const playSound = useCallback((intensity, isSOS = false) => {
    if (isMuted) return;

    try {
      const audioEl = (intensity >= 90 || isSOS) ? sirenRef.current : beepRef.current;
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

  /**
   * Trigger the visual emergency flash (2 seconds).
   */
  const triggerFlash = useCallback(() => {
    setIsFlashing(true);

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    flashTimeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
    }, 2000);
  }, []);

  /**
   * Activate Crisis Mode — header flashes red for 5 seconds.
   * Triggered when intensity > 95 dB or SOS is received.
   */
  const activateCrisisMode = useCallback(() => {
    setCrisisMode(true);

    if (crisisTimeoutRef.current) {
      clearTimeout(crisisTimeoutRef.current);
    }

    crisisTimeoutRef.current = setTimeout(() => {
      setCrisisMode(false);
    }, 5000);
  }, []);

  /**
   * Fetch all alerts from the Flask backend.
   * Called on mount and every 2 seconds via polling.
   */
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts`);
      if (res.ok) {
        const data = await res.json();
        const newAlerts = data.alerts || [];
        setAlerts(newAlerts);
        setIsOnline(true);

        // Update battery level from backend
        if (data.battery_level !== null && data.battery_level !== undefined) {
          setBatteryLevel(data.battery_level);
        }

        // Update SOS status
        setSosActive(data.sos_active || false);

        // Detect if new alerts arrived
        if (newAlerts.length > prevAlertCountRef.current && prevAlertCountRef.current > 0) {
          // Find the newest alert to determine which sound to play
          const newestAlert = newAlerts[0]; // alerts are reversed, newest first
          const intensity = newestAlert?.intensity_db || 0;
          const isSOS = newestAlert?.is_sos || newestAlert?.type === 'SOS';

          // Play appropriate sound
          playSound(intensity, isSOS);

          // Always trigger standard flash
          triggerFlash();

          // Activate Crisis Mode for critical alerts
          if (intensity >= 95 || isSOS) {
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
   * Send a POST to /simulate to create a fake horn alert.
   * Useful for testing without ESP32 hardware.
   */
  const simulateAlert = async () => {
    try {
      await fetch(`${API_BASE}/simulate`, { method: 'POST' });
      fetchAlerts();
    } catch {
      console.error('Failed to simulate alert');
    }
  };

  /**
   * Send a POST to /emergency to trigger an SOS distress signal.
   */
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

  /**
   * Start polling on component mount.
   * Polls every 2 seconds for real-time updates.
   */
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
      {/* Hidden audio elements — two distinct sounds */}
      <audio ref={beepRef} src="/beep.wav" preload="auto" />
      <audio ref={sirenRef} src="/siren.wav" preload="auto" />

      {/* Emergency flash overlay */}
      <div className={`emergency-flash ${isFlashing ? 'emergency-flash--active' : ''}`} />

      {/* Crisis mode overlay (stronger, longer flash for SOS / >95dB) */}
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
        {/* Page Header — flashes red in Crisis Mode */}
        <div className={`dashboard__header ${crisisMode ? 'dashboard__header--crisis' : ''}`}>
          <h1 className="dashboard__title">
            {crisisMode && <span className="crisis-icon">🚨 </span>}
            Dashboard
            {crisisMode && <span className="crisis-tag">CRISIS MODE</span>}
          </h1>
          <p className="dashboard__desc">
            {crisisMode
              ? '⚠️ CRITICAL ALERT DETECTED — Emergency contacts notified!'
              : 'Real-time monitoring of horn detection events from SmartHelm devices.'
            }
          </p>
        </div>

        {/* KPI Status Cards */}
        <StatusCards alerts={alerts} isOnline={isOnline} batteryLevel={batteryLevel} />

        {/* Actions: Simulate + SOS + heading */}
        <div className="actions-bar">
          <h2 className="actions-bar__title">Alert History</h2>
          <div className="actions-bar__buttons">
            <button className="btn btn--simulate" onClick={simulateAlert}>
              🧪 Simulate Alert
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
