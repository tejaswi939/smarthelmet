/*
 * ============================================================
 * SmartHelm v2.0 - Multi-Sensor Fusion Firmware
 * ============================================================
 *
 * UPGRADE: Integrated horn detection with existing crash
 * detection (MPU6050) and alcohol detection (MQ-3).
 *
 * Sensors:
 *   1. MEMS Microphone (Analog/I2S) → Horn Detection (FFT)
 *   2. MPU6050 (I2C)                → Crash Detection (Accel)
 *   3. MQ-3 (Analog)                → Alcohol Detection (ADC)
 *
 * Features:
 *   - 1024-point FFT for horn frequency analysis (2-4 kHz)
 *   - Spectral flatness filter to reject wind/noise
 *   - MPU6050 total acceleration for crash/fall detection
 *   - MQ-3 analog reading for alcohol vapor detection
 *   - Risk Fusion Engine: weighted multi-sensor risk score
 *   - Buzzer + Vibration + LED multi-level alerts
 *   - GPS location tagging via NEO-6M
 *   - JSON alerts to Flask backend via Wi-Fi HTTP POST
 *
 * Hardware Wiring:
 *   - MEMS Mic OUT  -> GPIO 34 (ADC1_CH6)
 *   - MPU6050 SDA   -> GPIO 21 (I2C)
 *   - MPU6050 SCL   -> GPIO 22 (I2C)
 *   - MQ-3 AOUT     -> GPIO 35 (ADC1_CH7)
 *   - Buzzer         -> GPIO 25
 *   - Vibration      -> GPIO 26
 *   - Alert LED      -> GPIO 27
 *   - GPS TX         -> GPIO 16 (Serial2 RX)
 * ============================================================
 */
#include <Arduino.h>
#include <HTTPClient.h>
#include <TinyGPS++.h>
#include <WiFi.h>
#include <Wire.h>
#include <arduinoFFT.h>

// ==================== CONFIGURATION ==========================

// Wi-Fi credentials — CHANGE THESE to your network
const char *WIFI_SSID = "Vishnu";
const char *WIFI_PASSWORD = "Vishnu@298";

// Backend server URL (change IP to your PC's local IP)
const char *SERVER_URL = "http://192.168.31.1:5000/alert";

// ==================== PIN DEFINITIONS ========================

#define MIC_PIN 34       // Analog input from MEMS microphone
#define MQ3_PIN 35       // Analog input from MQ-3 alcohol sensor
#define BUZZER_PIN 25    // Buzzer output
#define VIBRATION_PIN 26 // Vibration motor output
#define LED_PIN 27       // Alert LED output

// MPU6050 I2C address
#define MPU6050_ADDR 0x68

// ==================== FFT SETTINGS ===========================

#define SAMPLES 1024       // Number of FFT samples (power of 2)
#define SAMPLING_FREQ 8000 // Sampling frequency in Hz
#define HORN_FREQ_MIN 2000 // Minimum horn frequency (Hz)
#define HORN_FREQ_MAX 4000 // Maximum horn frequency (Hz)
#define DB_THRESHOLD 75.0  // Minimum loudness in dB to trigger
#define DURATION_MS 150    // Minimum duration in ms to confirm horn
#define FLATNESS_THRESHOLD 0.3 // Max spectral flatness (tonal vs noise)

// ==================== CRASH DETECTION SETTINGS ===============

#define CRASH_ACCEL_THRESHOLD 3.0 // Threshold in g-force (sudden impact)
#define CRASH_CONFIRM_MS 100      // Duration to confirm crash (ms)

// ==================== ALCOHOL DETECTION SETTINGS =============

#define MQ3_THRESHOLD 400    // ADC threshold for alcohol detection
#define MQ3_WARMUP_MS 20000  // MQ-3 needs ~20s to warm up

// ==================== RISK FUSION WEIGHTS ====================

#define HORN_WEIGHT 0.3
#define CRASH_WEIGHT 0.5
#define ALCOHOL_WEIGHT 0.2
#define RISK_LOW 30
#define RISK_HIGH 70

// ==================== GPS SETTINGS ===========================

#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUD 9600

// ==================== GLOBAL VARIABLES =======================

// FFT arrays
double vReal[SAMPLES];
double vImag[SAMPLES];

// Create FFT object
ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, SAMPLES, SAMPLING_FREQ);

// GPS
TinyGPSPlus gps;
HardwareSerial GPSSerial(2); // Use UART2 for GPS

// Horn detection state
unsigned long hornStartTime = 0;
bool hornDetected = false;

// Crash detection state
unsigned long crashStartTime = 0;
bool crashDetected = false;

// MQ-3 warmup tracking
unsigned long bootTime = 0;

// Alert cooldown (prevents spamming)
unsigned long lastAlertTime = 0;
#define ALERT_COOLDOWN_MS 2000

// ==================== SETUP ==================================

void setup() {
  Serial.begin(115200);
  Serial.println("===========================================");
  Serial.println("  SmartHelm v2.0 - Multi-Sensor Fusion");
  Serial.println("===========================================");

  // Pin modes
  pinMode(MIC_PIN, INPUT);
  pinMode(MQ3_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VIBRATION_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(VIBRATION_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  // Initialize I2C for MPU6050
  Wire.begin(21, 22);
  initMPU6050();

  // Connect to Wi-Fi
  connectWiFi();

  // Start GPS serial
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[OK] GPS module initialized.");

  // Record boot time for MQ-3 warmup
  bootTime = millis();

  Serial.println("[OK] All sensors initialized.");
  Serial.println("Listening for horns, monitoring crash & alcohol...\n");
}

// ==================== MAIN LOOP ==============================

void loop() {
  // Step 1: Read GPS data (non-blocking)
  while (GPSSerial.available() > 0) {
    gps.encode(GPSSerial.read());
  }

  // ---- SENSOR 1: Horn Detection (Microphone + FFT) ----
  float hornDB = 0;
  float hornFlatness = 1.0;
  bool hornAlert = processHornDetection(hornDB, hornFlatness);

  // ---- SENSOR 2: Crash Detection (MPU6050) ----
  float accelG = 0;
  bool crashAlert = processCrashDetection(accelG);

  // ---- SENSOR 3: Alcohol Detection (MQ-3) ----
  int alcoholRaw = 0;
  bool alcoholAlert = processAlcoholDetection(alcoholRaw);

  // ---- RISK FUSION ENGINE ----
  float hornLevel = hornAlert ? min(100.0, (hornDB / 105.0) * 100.0) : 0;
  float crashLevel = crashAlert ? min(100.0, (accelG / 5.0) * 100.0) : 0;
  float alcoholLevel = alcoholAlert ? min(100.0, ((float)alcoholRaw / 1024.0) * 100.0) : 0;

  float riskScore = (HORN_WEIGHT * hornLevel)
                  + (CRASH_WEIGHT * crashLevel)
                  + (ALCOHOL_WEIGHT * alcoholLevel);

  // ---- TAKE ACTION based on alerts ----
  if (millis() - lastAlertTime > ALERT_COOLDOWN_MS) {
    if (crashAlert) {
      Serial.printf("💥 CRASH DETECTED! Accel=%.1fg, Risk=%.0f\n", accelG, riskScore);
      triggerCrashAlert();
      sendAlertToServer("crash", hornDB, accelG, alcoholRaw, riskScore);
      lastAlertTime = millis();
    } else if (alcoholAlert) {
      Serial.printf("🍺 ALCOHOL DETECTED! Raw=%d, Risk=%.0f\n", alcoholRaw, riskScore);
      triggerAlcoholAlert();
      sendAlertToServer("alcohol", hornDB, accelG, alcoholRaw, riskScore);
      lastAlertTime = millis();
    } else if (hornAlert) {
      Serial.printf("🔔 HORN DETECTED! dB=%.1f, Flatness=%.2f, Risk=%.0f\n",
                    hornDB, hornFlatness, riskScore);
      triggerHornAlert();
      sendAlertToServer("horn", hornDB, accelG, alcoholRaw, riskScore);
      lastAlertTime = millis();
    }

    // Auto-SOS for critical risk
    if (riskScore >= RISK_HIGH && (crashAlert || alcoholAlert)) {
      Serial.println("🚨 CRITICAL RISK — AUTO-SOS TRIGGERED!");
      sendAlertToServer("fusion", hornDB, accelG, alcoholRaw, riskScore);
    }
  }
}

// ==================== HORN DETECTION =========================

/**
 * Process horn detection: sample audio, run FFT, check horn band.
 * Returns true if horn confirmed. Sets hornDB and hornFlatness.
 */
bool processHornDetection(float &outDB, float &outFlatness) {
  // Sample audio from microphone
  sampleAudio();

  // Run FFT
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();

  // Analyze horn band
  double peakMag = getHornMagnitude();
  double dB = 20.0 * log10(peakMag + 1);
  double flatness = getSpectralFlatness();

  outDB = (float)dB;
  outFlatness = (float)flatness;

  // Check: loud + tonal (not noise) + sustained
  if (dB >= DB_THRESHOLD && flatness < FLATNESS_THRESHOLD) {
    if (!hornDetected) {
      hornStartTime = millis();
      hornDetected = true;
    } else if (millis() - hornStartTime >= DURATION_MS) {
      hornDetected = false;
      return true; // Horn confirmed
    }
  } else {
    hornDetected = false;
  }
  return false;
}

// ==================== CRASH DETECTION ========================

/**
 * Initialize the MPU6050 accelerometer/gyroscope via I2C.
 */
void initMPU6050() {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0x00); // Wake up MPU6050
  byte error = Wire.endTransmission(true);

  if (error == 0) {
    Serial.println("[OK] MPU6050 initialized.");
    // Set accelerometer range to ±4g for crash detection
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x1C); // ACCEL_CONFIG register
    Wire.write(0x08); // ±4g range
    Wire.endTransmission(true);
  } else {
    Serial.println("[WARN] MPU6050 not found — crash detection disabled.");
  }
}

/**
 * Read MPU6050 and check for sudden impact (crash).
 * Returns true if crash detected. Sets accelG to total acceleration.
 */
bool processCrashDetection(float &outAccelG) {
  int16_t ax, ay, az;

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x3B); // Starting register for accel data
  if (Wire.endTransmission(false) != 0) {
    outAccelG = 0;
    return false; // MPU6050 not responding
  }

  Wire.requestFrom((uint8_t)MPU6050_ADDR, (uint8_t)6, (uint8_t)true);
  if (Wire.available() < 6) {
    outAccelG = 0;
    return false;
  }

  ax = (Wire.read() << 8) | Wire.read();
  ay = (Wire.read() << 8) | Wire.read();
  az = (Wire.read() << 8) | Wire.read();

  // Convert to g-force (±4g range: 8192 LSB/g)
  float gx = ax / 8192.0;
  float gy = ay / 8192.0;
  float gz = az / 8192.0;

  // Total acceleration magnitude
  float totalG = sqrt(gx * gx + gy * gy + gz * gz);
  outAccelG = totalG;

  // Check for sudden impact (subtract 1g for gravity baseline)
  if (abs(totalG - 1.0) > CRASH_ACCEL_THRESHOLD) {
    if (!crashDetected) {
      crashStartTime = millis();
      crashDetected = true;
    } else if (millis() - crashStartTime >= CRASH_CONFIRM_MS) {
      crashDetected = false;
      return true; // Crash confirmed
    }
  } else {
    crashDetected = false;
  }
  return false;
}

// ==================== ALCOHOL DETECTION ======================

/**
 * Read MQ-3 sensor and check for alcohol vapor.
 * Returns true if alcohol level above threshold.
 */
bool processAlcoholDetection(int &outRaw) {
  // MQ-3 needs warmup time (~20 seconds)
  if (millis() - bootTime < MQ3_WARMUP_MS) {
    outRaw = 0;
    return false;
  }

  outRaw = analogRead(MQ3_PIN);

  // Compare against threshold
  return (outRaw > MQ3_THRESHOLD);
}

// ==================== AUDIO PROCESSING =======================

/**
 * Sample audio from the MEMS microphone into the FFT arrays.
 * Uses analogRead at the configured sampling frequency.
 */
void sampleAudio() {
  unsigned long samplingPeriodUs = 1000000UL / SAMPLING_FREQ;
  for (int i = 0; i < SAMPLES; i++) {
    unsigned long t0 = micros();
    // Read 12-bit ADC value, center it around 0
    vReal[i] = analogRead(MIC_PIN) - 2048.0;
    vImag[i] = 0.0;
    // Wait for the correct sampling interval
    while (micros() - t0 < samplingPeriodUs) {
      yield(); // Keeps ESP32 watchdog happy
    }
  }
}

/**
 * Analyze FFT output and return the peak magnitude
 * in the horn frequency band (2000-4000 Hz).
 */
double getHornMagnitude() {
  double freqResolution = (double)SAMPLING_FREQ / SAMPLES;
  int binMin = (int)(HORN_FREQ_MIN / freqResolution);
  int binMax = (int)(HORN_FREQ_MAX / freqResolution);
  if (binMax > SAMPLES / 2) binMax = SAMPLES / 2;

  double peakMag = 0;
  for (int i = binMin; i <= binMax; i++) {
    if (vReal[i] > peakMag) {
      peakMag = vReal[i];
    }
  }
  return peakMag;
}

/**
 * Calculate spectral flatness (Wiener entropy) for the horn band.
 * Low flatness (< 0.3) = tonal signal (horn).
 * High flatness (> 0.6) = broadband noise (wind/traffic).
 */
double getSpectralFlatness() {
  double freqResolution = (double)SAMPLING_FREQ / SAMPLES;
  int binMin = (int)(HORN_FREQ_MIN / freqResolution);
  int binMax = (int)(HORN_FREQ_MAX / freqResolution);
  if (binMax > SAMPLES / 2) binMax = SAMPLES / 2;

  int count = binMax - binMin + 1;
  if (count <= 0) return 1.0;

  double logSum = 0;
  double linSum = 0;

  for (int i = binMin; i <= binMax; i++) {
    double val = max(vReal[i], 0.0001); // Avoid log(0)
    logSum += log(val);
    linSum += val;
  }

  double geometricMean = exp(logSum / count);
  double arithmeticMean = linSum / count;

  if (arithmeticMean < 0.0001) return 1.0;
  return geometricMean / arithmeticMean;
}

// ==================== ALERT FUNCTIONS ========================

/**
 * Horn alert: 3 rapid beeps + short vibration + amber LED flash.
 */
void triggerHornAlert() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
    delay(80);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    delay(60);
  }
  // Short vibration pulse
  digitalWrite(VIBRATION_PIN, HIGH);
  delay(200);
  digitalWrite(VIBRATION_PIN, LOW);
}

/**
 * Crash alert: continuous buzzer + strong vibration + LED.
 * Much more intense than horn alert.
 */
void triggerCrashAlert() {
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(VIBRATION_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  delay(2000); // 2 seconds of continuous alert
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(VIBRATION_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}

/**
 * Alcohol alert: slow pulsing buzzer + LED warning.
 */
void triggerAlcoholAlert() {
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
    delay(300);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

// ==================== NETWORK FUNCTIONS ======================

/**
 * Connect to Wi-Fi network.
 */
void connectWiFi() {
  Serial.printf("Connecting to Wi-Fi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[OK] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WARN] Wi-Fi failed. Continuing in offline mode.");
  }
}

/**
 * Send alert data to the Flask backend via HTTP POST.
 * JSON format includes all sensor data + risk score.
 */
void sendAlertToServer(const char *alertType, float dB, float accelG,
                       int alcoholRaw, float riskScore) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] Wi-Fi not connected. Skipping server alert.");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Build GPS coordinates
  double lat = 0.0, lng = 0.0;
  if (gps.location.isValid()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
  }

  // Build JSON payload with all sensor data
  String payload = "{";
  payload += "\"type\": \"" + String(alertType) + "\",";
  payload += "\"intensity_db\": " + String(dB, 1) + ",";
  payload += "\"accel_g\": " + String(accelG, 2) + ",";
  payload += "\"alcohol_ppm\": " + String(alcoholRaw) + ",";
  payload += "\"risk_score\": " + String(riskScore, 0) + ",";
  payload += "\"lat\": " + String(lat, 6) + ",";
  payload += "\"lng\": " + String(lng, 6) + ",";
  payload += "\"device_id\": \"HELM-001\"";
  payload += "}";

  Serial.printf("[NET] Sending: %s\n", payload.c_str());

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("[NET] Response: %d - %s\n", httpCode,
                  http.getString().c_str());
  } else {
    Serial.printf("[NET] POST failed: %s\n",
                  http.errorToString(httpCode).c_str());
  }

  http.end();
}