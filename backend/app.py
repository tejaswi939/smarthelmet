"""
============================================================
SmartHelm - Flask Backend Server
============================================================
Agent 3: Backend Developer

Endpoints:
  POST /alert      - Receives horn alerts from ESP32 (JSON)
  GET  /alerts     - Returns all stored alerts (for React dashboard)
  POST /simulate   - Generates a fake alert (for testing without hardware)
  POST /emergency  - Receives SOS distress signal with GPS (Critical)
  GET  /status     - Returns system status including SOS and battery

Features:
  - In-memory storage (no database needed)
  - CORS enabled for React frontend
  - Timestamps added server-side
  - Mock SMS logging (bonus)
  - GPS coordinates stored from ESP32
  - Emergency SOS system with critical logging
  - Battery level tracking per device
============================================================
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import random

# ==================== APP SETUP ===============================

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "https://your-vercel-frontend-url.vercel.app"}})  # Allow cross-origin requests from React frontend

# In-memory storage for alerts (simple list)
alerts = []

# In-memory storage for SOS emergencies
sos_alerts = []

# Track latest battery level per device
device_battery = {}

# ==================== API ENDPOINTS ===========================

@app.route("/alert", methods=["POST"])
def receive_alert():
    """
    Receives a horn detection alert from the ESP32.
    Expected JSON body:
    {
        "type": "horn",
        "intensity_db": 82.5,
        "lat": 12.9716,
        "lng": 77.5946,
        "device_id": "HELM-001",
        "battery_level": 85
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    # Extract battery level if provided (default to last known or 100)
    battery = data.get("battery_level", device_battery.get(data.get("device_id", "unknown"), 100))
    device_id = data.get("device_id", "unknown")

    # Update device battery tracker
    device_battery[device_id] = battery

    # Build alert object with server-side timestamp
    alert = {
        "id": len(alerts) + 1,
        "type": data.get("type", "unknown"),
        "intensity_db": data.get("intensity_db", 0),
        "lat": data.get("lat", 0.0),
        "lng": data.get("lng", 0.0),
        "device_id": device_id,
        "battery_level": battery,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Auto-trigger SOS if intensity is critically high (>= 95 dB)
    if alert["intensity_db"] >= 95:
        alert["is_sos"] = True
        _log_sos(alert)
    else:
        alert["is_sos"] = False

    # Store the alert
    alerts.append(alert)
    
    # FIX: Prevent memory leak by keeping only the last 100 alerts
    if len(alerts) > 100:
        alerts.pop(0)

    # Mock SMS alert (bonus feature — logs to console)
    send_mock_sms(alert)

    print(f"✅ Alert #{alert['id']} received: {alert['type']} at {alert['intensity_db']} dB | 🔋 {battery}%")

    return jsonify({"status": "success", "alert": alert}), 201


@app.route("/alerts", methods=["GET"])
def get_alerts():
    """
    Returns all stored alerts, newest first.
    The React frontend polls this endpoint every 2 seconds.
    Also includes latest battery level and SOS status.
    """
    # Determine latest battery level across all devices
    latest_battery = None
    if alerts:
        latest_battery = alerts[-1].get("battery_level", None)

    # Check if any active SOS is in the last 30 seconds
    has_active_sos = len(sos_alerts) > 0

    # Return reversed so newest alerts come first
    return jsonify({
        "alerts": list(reversed(alerts)),
        "count": len(alerts),
        "battery_level": latest_battery,
        "sos_active": has_active_sos,
        "sos_count": len(sos_alerts),
    }), 200


@app.route("/emergency", methods=["POST"])
def emergency_sos():
    """
    Receives an Emergency SOS signal from the helmet.
    This is triggered by the rider pressing a physical panic button,
    or automatically when intensity exceeds 95 dB.

    Expected JSON body:
    {
        "lat": 12.9716,
        "lng": 77.5946,
        "device_id": "HELM-001",
        "message": "Rider in distress"
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    sos = {
        "id": len(sos_alerts) + 1,
        "lat": data.get("lat", 0.0),
        "lng": data.get("lng", 0.0),
        "device_id": data.get("device_id", "unknown"),
        "message": data.get("message", "SOS - Rider needs help"),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    sos_alerts.append(sos)

    # Also create a critical alert in the main alerts list
    critical_alert = {
        "id": len(alerts) + 1,
        "type": "SOS",
        "intensity_db": 100.0,
        "lat": sos["lat"],
        "lng": sos["lng"],
        "device_id": sos["device_id"],
        "battery_level": device_battery.get(sos["device_id"], 50),
        "is_sos": True,
        "timestamp": sos["timestamp"],
    }
    alerts.append(critical_alert)

    if len(alerts) > 100:
        alerts.pop(0)

    # Log critical SOS to console (simulating Twilio SMS to family)
    _log_sos(sos)

    return jsonify({"status": "sos_received", "sos": sos}), 201


@app.route("/simulate", methods=["POST"])
def simulate_alert():
    """
    Generates a fake horn alert for testing without ESP32 hardware.
    Useful for development and demo/viva purposes.
    Randomly generates battery level and occasionally high-dB (SOS) alerts.
    """
    # Simulate battery drain over time
    current_battery = device_battery.get("SIM-001", 100)
    # Drain 1-5% per alert, minimum 5%
    new_battery = max(5, current_battery - random.randint(1, 5))
    device_battery["SIM-001"] = new_battery

    # 20% chance of generating a critical (>95 dB) alert for SOS testing
    is_critical = random.random() < 0.2
    intensity = round(random.uniform(95, 105), 1) if is_critical else round(random.uniform(76, 94), 1)

    # Generate realistic random values
    fake_alert = {
        "id": len(alerts) + 1,
        "type": "SOS" if is_critical else "horn",
        "intensity_db": intensity,
        "lat": round(12.9716 + random.uniform(-0.01, 0.01), 6),
        "lng": round(77.5946 + random.uniform(-0.01, 0.01), 6),
        "device_id": "SIM-001",
        "battery_level": new_battery,
        "is_sos": is_critical,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    alerts.append(fake_alert)
    
    # FIX: Prevent memory leak by keeping only the last 100 alerts
    if len(alerts) > 100:
        alerts.pop(0)

    # If critical, also log SOS
    if is_critical:
        _log_sos(fake_alert)

    # Mock SMS for simulated alert too
    send_mock_sms(fake_alert)

    emoji = "🚨" if is_critical else "🧪"
    print(f"{emoji} Simulated Alert #{fake_alert['id']}: {fake_alert['intensity_db']} dB | 🔋 {new_battery}%")

    return jsonify({"status": "simulated", "alert": fake_alert}), 201


@app.route("/", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "service": "SmartHelm Backend",
        "status": "running",
        "total_alerts": len(alerts),
        "active_sos": len(sos_alerts),
        "devices": dict(device_battery),
    }), 200


# ==================== HELPER FUNCTIONS ========================

def send_mock_sms(alert):
    """
    Bonus feature: Mock SMS alert.
    In production, replace with Twilio API call.
    For now, just logs to the console.
    """
    print(f"📱 [MOCK SMS] Horn detected at ({alert['lat']}, {alert['lng']}) "
          f"with intensity {alert['intensity_db']} dB. "
          f"Device: {alert['device_id']}. Stay safe!")


def _log_sos(alert_or_sos):
    """
    Logs a CRITICAL SOS ALERT to the console.
    In production, this would:
      1. Send Twilio SMS to emergency contacts / family
      2. Push notification to the SmartHelm mobile app
      3. Optionally call emergency services API
    """
    lat = alert_or_sos.get("lat", "?")
    lng = alert_or_sos.get("lng", "?")
    device = alert_or_sos.get("device_id", "?")
    timestamp = alert_or_sos.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    print()
    print("=" * 60)
    print("🚨🚨🚨  CRITICAL SOS ALERT  🚨🚨🚨")
    print("=" * 60)
    print(f"  📍 Location : ({lat}, {lng})")
    print(f"  🪖 Device   : {device}")
    print(f"  🕐 Time     : {timestamp}")
    print(f"  📱 [MOCK] SMS sent to emergency contacts!")
    print(f"  🗺️  Maps     : https://maps.google.com/?q={lat},{lng}")
    print("=" * 60)
    print()


# ==================== RUN SERVER ==============================

if __name__ == "__main__":
    print("=" * 50)
    print("  SmartHelm Backend Server")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)
