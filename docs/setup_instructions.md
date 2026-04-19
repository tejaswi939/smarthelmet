# SmartHelm — Setup & Deployment Instructions

> **Agent 5 (Integration)** + **Agent 6 (Deployment)**

---

## 📁 Project Structure

```
smarthelmet/
├── esp32_firmware/
│   └── smart_helm.ino          ← ESP32 Arduino firmware
├── backend/
│   ├── app.py                  ← Flask API server
│   └── requirements.txt        ← Python dependencies
├── frontend/                   ← Vite + React dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── StatusCards.jsx
│   │   │   └── AlertList.jsx
│   │   ├── App.jsx
│   │   ├── index.css
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
# Navigate to the backend folder
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

# Simulate a horn alert (no hardware needed!)
curl -X POST http://localhost:5000/simulate

# View all alerts
curl http://localhost:5000/alerts
```

---

## ⚛️ Step 2: Start the React Frontend

```bash
# Navigate to the frontend folder
cd smarthelmet/frontend

# Install Node packages (already done if Vite setup ran)
npm install

# Start the development server
npm run dev
```

✅ The dashboard will open at **http://localhost:5173**

The dashboard automatically polls the backend every 2 seconds.

---

## 🔌 Step 3: Upload ESP32 Firmware (Hardware)

> **Skip this step** if you don't have hardware — use the **Simulate** button on the dashboard instead.

1. Open **Arduino IDE**
2. Install required libraries from Library Manager:
   - `arduinoFFT` by Enrique Condes
   - `TinyGPSPlus` by Mikal Hart
3. Install **ESP32 Board** from Boards Manager:
   - URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
4. Open `esp32_firmware/smart_helm.ino`
5. **Edit these lines** with your Wi-Fi credentials and PC IP:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_URL    = "http://<YOUR_PC_IP>:5000/alert";
   ```
6. Select **ESP32 Dev Module** as the board
7. Select the correct COM port
8. Click **Upload**

---

## 🧪 Testing the Full System

### Without Hardware (Simulation Mode):
1. Start the backend (`python app.py`)
2. Start the frontend (`npm run dev`)
3. Open browser at `http://localhost:5173`
4. Click **🧪 Simulate Horn Alert** button
5. Watch alerts appear in real-time!

### With Hardware:
1. Start the backend
2. Start the frontend
3. Power on ESP32 (connected to same Wi-Fi)
4. Honk near the microphone
5. Watch the alert appear on the dashboard

---

## 🔗 Data Flow (Integration)

```
1. ESP32 (MEMS Mic)
   ↓  Samples audio, runs 1024-pt FFT
   ↓  Detects 2000-4000 Hz horn > 75 dB for 150ms+
   ↓  Triggers buzzer + vibration
   ↓
2. HTTP POST → http://backend:5000/alert
   ↓  JSON: { type, intensity_db, lat, lng, device_id }
   ↓
3. Flask Backend
   ↓  Stores alert, logs mock SMS
   ↓
4. React Dashboard (polls GET /alerts every 2s)
   ↓  Displays real-time table with intensity, GPS, timestamp
```

---

## 🛠 Troubleshooting

| Problem                    | Solution                                           |
|----------------------------|----------------------------------------------------|
| Backend won't start        | Check Python is installed: `python --version`      |
| Frontend blank page        | Run `npm install` in `frontend/` folder            |
| CORS error in browser      | Ensure `flask-cors` is installed and backend running |
| ESP32 can't connect        | Check Wi-Fi SSID/password and PC IP address        |
| No alerts appearing        | Use the **Simulate** button to test without hardware |
