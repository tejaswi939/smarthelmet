# SmartHelm v2.0 — Setup & Deployment Instructions

> **Multi-Sensor Fusion: Horn Detection + Crash Detection + Alcohol Detection**

---

## 📁 Project Structure

```
smarthelmet/
├── esp32_firmware/
│   └── esp32_firmware.ino      ← ESP32 firmware (horn + crash + alcohol + fusion)
├── backend/
│   ├── app.py                  ← Flask API server (multi-type alerts)
│   └── requirements.txt        ← Python dependencies
├── frontend/                   ← Vite + React dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx      ← Top bar with battery + status
│   │   │   ├── StatusCards.jsx ← KPI cards (sensors, risk, battery)
│   │   │   └── AlertList.jsx   ← Alert table with sensor data
│   │   ├── App.jsx             ← Main app (multi-type simulation)
│   │   ├── index.css           ← Premium dark-mode styles
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
└── docs/
    ├── setup_instructions.md   ← This file
    └── viva_explanation.md     ← Viva Q&A
```

---

## 🔧 Prerequisites

| Tool       | Version | Purpose                      |
|------------|---------|------------------------------|
| Python     | 3.8+    | Flask backend                |
| Node.js    | 18+     | React frontend (Vite)        |
| npm        | 9+      | Package manager              |
| Arduino IDE| 2.x     | ESP32 firmware upload        |

---

## ⚙️ Step 1: Start the Backend

```bash
cd smarthelmet/backend

# (Optional) Create a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python app.py
```

✅ The backend will start at **http://localhost:5000**

Test it:
```bash
# Health check
curl http://localhost:5000/

# Simulate a horn alert
curl -X POST http://localhost:5000/simulate?type=horn

# Simulate a crash alert
curl -X POST http://localhost:5000/simulate?type=crash

# Simulate an alcohol alert
curl -X POST http://localhost:5000/simulate?type=alcohol

# Random simulation
curl -X POST http://localhost:5000/simulate

# View all alerts
curl http://localhost:5000/alerts
```

---

## ⚛️ Step 2: Start the React Frontend

```bash
cd smarthelmet/frontend

npm install
npm run dev
```

✅ The dashboard will open at **http://localhost:5173**

The dashboard automatically polls the backend every 2 seconds.

---

## 🔌 Step 3: Upload ESP32 Firmware (Hardware)

> **Skip this step** if you don't have hardware — use the **Simulate** buttons on the dashboard instead.

1. Open **Arduino IDE**
2. Install required libraries from Library Manager:
   - `arduinoFFT` by Enrique Condes (v2.0+)
   - `TinyGPSPlus` by Mikal Hart
   - `Wire` (built-in for I2C)
3. Install **ESP32 Board** from Boards Manager:
   - URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
4. Open `esp32_firmware/esp32_firmware.ino`
5. **Edit these lines** with your Wi-Fi credentials and PC IP:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_URL    = "http://<YOUR_PC_IP>:5000/alert";
   ```
6. Select **ESP32 Dev Module** as the board
7. Select the correct COM port
8. Click **Upload**

### Hardware Wiring

| ESP32 Pin | Connected To | Purpose |
|-----------|-------------|---------|
| GPIO 34   | MEMS Mic OUT | Audio input (horn detection) |
| GPIO 35   | MQ-3 AOUT   | Alcohol sensor (analog) |
| GPIO 21   | MPU6050 SDA  | Accelerometer data (I2C) |
| GPIO 22   | MPU6050 SCL  | Accelerometer clock (I2C) |
| GPIO 25   | Buzzer (+)   | Audio alert output |
| GPIO 26   | Vibration (+)| Haptic feedback |
| GPIO 27   | Alert LED (+)| Visual alert |
| GPIO 16   | GPS TX       | Location (UART RX) |
| GPIO 17   | GPS RX       | Location (UART TX) |

---

## 🧪 Testing the Full System

### Without Hardware (Simulation Mode):
1. Start the backend (`python app.py`)
2. Start the frontend (`npm run dev`)
3. Open browser at `http://localhost:5173`
4. Click simulation buttons:
   - **📢 Sim Horn** — generates a horn alert
   - **💥 Sim Crash** — generates a crash alert (triggers crisis mode)
   - **🍺 Sim Alcohol** — generates an alcohol alert
   - **🧪 Random** — random sensor type
   - **🆘 Trigger SOS** — manual emergency
5. Watch alerts appear in real-time with sensor data and risk scores!

### With Hardware:
1. Start the backend
2. Start the frontend
3. Power on ESP32 (connected to same Wi-Fi)
4. Test each sensor:
   - **Horn**: Honk near the microphone
   - **Crash**: Shake/tilt the MPU6050 suddenly
   - **Alcohol**: Breathe near MQ-3 (after 20s warmup)
5. Watch alerts appear on the dashboard

---

## 🔗 Data Flow (Integration)

```
1. ESP32 (Multi-Sensor)
   ├── MEMS Mic → FFT → Horn Detection (2-4 kHz, >75 dB, flatness<0.3)
   ├── MPU6050  → Accel → Crash Detection (>3g impact)
   ├── MQ-3     → ADC  → Alcohol Detection (>400 raw)
   └── Risk Fusion Engine → weighted score (0-100)
       ↓  Triggers buzzer + vibration + LED (pattern varies by type)
       ↓
2. HTTP POST → http://backend:5000/alert
   ↓  JSON: { type, intensity_db, accel_g, alcohol_ppm, risk_score, lat, lng }
   ↓
3. Flask Backend
   ↓  Stores alert, calculates SOS, logs mock SMS
   ↓
4. React Dashboard (polls GET /alerts every 2s)
   ↓  Displays sensor breakdown, risk score, alert table
```

---

## 🛠 Troubleshooting

| Problem                      | Solution                                           |
|------------------------------|-----------------------------------------------------|
| Backend won't start          | Check Python is installed: `python --version`       |
| Frontend blank page          | Run `npm install` in `frontend/` folder             |
| CORS error in browser        | Ensure `flask-cors` is installed and backend running|
| ESP32 can't connect          | Check Wi-Fi SSID/password and PC IP address         |
| No alerts appearing          | Use the **Simulate** buttons to test without hardware|
| MPU6050 not found            | Check I2C wiring (SDA=21, SCL=22), pull-up resistors|
| MQ-3 always triggering       | Wait 20+ seconds for warmup, check threshold (400)  |
| Horn false positives         | Spectral flatness filter should handle this; adjust FLATNESS_THRESHOLD |
| Crisis mode not triggering   | Crash/SOS alerts trigger it; check risk_score ≥ 70   |
