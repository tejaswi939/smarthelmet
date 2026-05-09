"""
============================================================
SmartHelm v2.0 - Flask Backend Server
============================================================

UPGRADE: Multi-sensor fusion support (horn + crash + alcohol).

Endpoints:
  POST /alert      - Receives alerts from ESP32 (horn/crash/alcohol/fusion)
  GET  /alerts     - Returns all stored alerts (for React dashboard)
  POST /simulate   - Generates a fake alert (configurable type)
  POST /emergency  - Receives SOS distress signal with GPS
  GET  /status     - Returns system status including SOS and battery

Features:
  - Multi-type alert handling (horn, crash, alcohol, fusion)
  - Risk score tracking and auto-SOS
  - In-memory storage (no database needed)
  - CORS enabled for React frontend
  - Timestamps added server-side
  - Mock SMS logging
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
    Receives a multi-sensor alert from the ESP32.
    Expected JSON body:
    {
        "type": "horn" | "crash" | "alcohol" | "fusion",
        "intensity_db": 82.5,
        "accel_g": 1.2,
        "alcohol_ppm": 50,
        "risk_score": 45,
        "lat": 12.9716,
        "lng": 77.5946,
        "device_id": "HELM-001",
        "battery_level": 85
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    # Extract battery level if provided
    device_id = data.get("device_id", "unknown")
    battery = data.get("battery_level", device_battery.get(device_id, 100))
    device_battery[device_id] = battery

    # Build alert object with server-side timestamp
    alert = {
        "id": len(alerts) + 1,
        "type": data.get("type", "unknown"),
        "intensity_db": data.get("intensity_db", 0),
        "accel_g": data.get("accel_g", 0),
        "alcohol_ppm": data.get("alcohol_ppm", 0),
        "risk_score": data.get("risk_score", 0),
        "lat": data.get("lat", 0.0),
        "lng": data.get("lng", 0.0),
        "device_id": device_id,
        "battery_level": battery,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Auto-trigger SOS for critical conditions
    risk = alert["risk_score"]
    is_crash = alert["type"] == "crash"
    is_fusion = alert["type"] == "fusion"

    if risk >= 70 or is_crash or is_fusion or alert["intensity_db"] >= 95:
        alert["is_sos"] = True
        _log_sos(alert)
    else:
        alert["is_sos"] = False

    # Store the alert
    alerts.append(alert)

    # Prevent memory leak by keeping only the last 100 alerts
    if len(alerts) > 100:
        alerts.pop(0)

    # Mock SMS alert
    send_mock_sms(alert)

    emoji_map = {"horn": "🔔", "crash": "💥", "alcohol": "🍺", "fusion": "🧠"}
    emoji = emoji_map.get(alert["type"], "📡")
    print(f"{emoji} Alert #{alert['id']}: {alert['type']} | dB={alert['intensity_db']} | "
          f"g={alert['accel_g']} | ppm={alert['alcohol_ppm']} | risk={alert['risk_score']} | 🔋{battery}%")

    return jsonify({"status": "success", "alert": alert}), 201


@app.route("/alerts", methods=["GET"])
def get_alerts():
    """
    Returns all stored alerts, newest first.
    The React frontend polls this endpoint every 2 seconds.
    """
    latest_battery = None
    if alerts:
        latest_battery = alerts[-1].get("battery_level", None)

    has_active_sos = len(sos_alerts) > 0

    # Compute sensor stats for dashboard
    horn_count = sum(1 for a in alerts if a["type"] == "horn")
    crash_count = sum(1 for a in alerts if a["type"] == "crash")
    alcohol_count = sum(1 for a in alerts if a["type"] == "alcohol")

    return jsonify({
        "alerts": list(reversed(alerts)),
        "count": len(alerts),
        "battery_level": latest_battery,
        "sos_active": has_active_sos,
        "sos_count": len(sos_alerts),
        "horn_count": horn_count,
        "crash_count": crash_count,
        "alcohol_count": alcohol_count,
    }), 200


@app.route("/emergency", methods=["POST"])
def emergency_sos():
    """
    Receives an Emergency SOS signal from the helmet.
    Triggered by rider pressing panic button or auto-triggered
    when risk_score >= 70.
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
        "accel_g": data.get("accel_g", 0),
        "alcohol_ppm": data.get("alcohol_ppm", 0),
        "risk_score": 100,
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

    _log_sos(sos)

    return jsonify({"status": "sos_received", "sos": sos}), 201


@app.route("/simulate", methods=["POST"])
def simulate_alert():
    """
    Generates a fake alert for testing without ESP32 hardware.
    Supports query param ?type=horn|crash|alcohol to choose type.
    Defaults to random type selection.
    """
    # Allow caller to specify type, otherwise randomize
    sim_type = request.args.get("type", None)
    if sim_type not in ("horn", "crash", "alcohol", None):
        sim_type = None

    if sim_type is None:
        # Weighted random: 50% horn, 30% crash, 20% alcohol
        roll = random.random()
        if roll < 0.5:
            sim_type = "horn"
        elif roll < 0.8:
            sim_type = "crash"
        else:
            sim_type = "alcohol"

    # Simulate battery drain
    current_battery = device_battery.get("SIM-001", 100)
    new_battery = max(5, current_battery - random.randint(1, 5))
    device_battery["SIM-001"] = new_battery

    # Generate type-appropriate values
    if sim_type == "horn":
        intensity = round(random.uniform(76, 98), 1)
        accel = round(random.uniform(0.8, 1.5), 2)
        alcohol = random.randint(10, 100)
        risk = round(intensity * 0.3 * 100 / 105, 0)
    elif sim_type == "crash":
        intensity = round(random.uniform(30, 60), 1)
        accel = round(random.uniform(3.5, 8.0), 2)
        alcohol = random.randint(10, 200)
        risk = round(accel * 0.5 * 100 / 5, 0)
    else:  # alcohol
        intensity = round(random.uniform(20, 50), 1)
        accel = round(random.uniform(0.8, 1.2), 2)
        alcohol = random.randint(450, 900)
        risk = round(alcohol * 0.2 * 100 / 1024, 0)

    risk = min(100, risk)
    is_critical = risk >= 70 or sim_type == "crash"

    fake_alert = {
        "id": len(alerts) + 1,
        "type": "SOS" if is_critical else sim_type,
        "intensity_db": intensity,
        "accel_g": accel,
        "alcohol_ppm": alcohol,
        "risk_score": risk,
        "lat": round(12.9716 + random.uniform(-0.01, 0.01), 6),
        "lng": round(77.5946 + random.uniform(-0.01, 0.01), 6),
        "device_id": "SIM-001",
        "battery_level": new_battery,
        "is_sos": is_critical,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    alerts.append(fake_alert)

    if len(alerts) > 100:
        alerts.pop(0)

    if is_critical:
        _log_sos(fake_alert)

    send_mock_sms(fake_alert)

    emoji_map = {"horn": "🔔", "crash": "💥", "alcohol": "🍺", "SOS": "🚨"}
    emoji = emoji_map.get(fake_alert["type"], "🧪")
    print(f"{emoji} Simulated [{sim_type}] Alert #{fake_alert['id']}: "
          f"dB={intensity} g={accel} ppm={alcohol} risk={risk} | 🔋{new_battery}%")

    return jsonify({"status": "simulated", "alert": fake_alert}), 201


@app.route("/", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "service": "SmartHelm v2.0 Backend",
        "status": "running",
        "total_alerts": len(alerts),
        "active_sos": len(sos_alerts),
        "devices": dict(device_battery),
        "sensors": ["microphone", "mpu6050", "mq3", "gps"],
    }), 200


# ==================== HELPER FUNCTIONS ========================

def send_mock_sms(alert):
    """
    Bonus feature: Mock SMS alert.
    In production, replace with Twilio API call.
    """
    print(f"📱 [MOCK SMS] {alert['type'].upper()} at ({alert['lat']}, {alert['lng']}) "
          f"| dB={alert['intensity_db']} g={alert.get('accel_g',0)} "
          f"ppm={alert.get('alcohol_ppm',0)} risk={alert.get('risk_score',0)} "
          f"| Device: {alert['device_id']}")


def _log_sos(alert_or_sos):
    """
    Logs a CRITICAL SOS ALERT to the console.
    In production, this would send Twilio SMS / push notification.
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
    print("  SmartHelm v2.0 Backend Server")
    print("  Multi-Sensor Fusion (Horn+Crash+Alcohol)")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)
