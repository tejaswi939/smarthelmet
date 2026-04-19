/*
 * ============================================================
 * SmartHelm - ESP32 Horn Detection Firmware
 * ============================================================
 * Agent 2: Embedded Systems Engineer
 *
 * This code:
 * 1. Samples audio from a MEMS microphone (I2S or analog)
 * 2. Runs a 1024-point FFT to find dominant frequencies
 * 3. Detects vehicle horns in the 2000-4000 Hz range
 * 4. If loudness > 75 dB for > 150 ms, triggers alert
 * 5. Activates buzzer + vibration motor
 * 6. Sends JSON alert to the Flask backend via HTTP POST
 *
 * Hardware Wiring (example):
 * - MEMS Mic OUT  -> GPIO 34 (ADC1_CH6)
 * - Buzzer        -> GPIO 25
 * - Vibration     -> GPIO 26
 * - GPS TX        -> GPIO 16 (Serial2 RX)
 * ============================================================
 */
#include <Arduino.h>
#include <HTTPClient.h>
#include <TinyGPS++.h> // Install "TinyGPSPlus" for GPS parsing
#include <WiFi.h>
#include <arduinoFFT.h> // Install "arduinoFFT" library by Enrique Condes (Use version 2.0.0+)

// ==================== CONFIGURATION ==========================

// Wi-Fi credentials — CHANGE THESE to your network
const char *WIFI_SSID = "Vishnu";
const char *WIFI_PASSWORD = "Vishnu@298";

// Backend server URL (change IP to your PC's local IP)
const char *SERVER_URL = "http://192.168.31.1:5000/alert";

// Pin definitions
#define MIC_PIN 34       // Analog input from MEMS microphone
#define BUZZER_PIN 25    // Buzzer output
#define VIBRATION_PIN 26 // Vibration motor output

// FFT settings
#define SAMPLES 1024       // Number of FFT samples (power of 2)
#define SAMPLING_FREQ 8000 // Sampling frequency in Hz
#define HORN_FREQ_MIN 2000 // Minimum horn frequency (Hz)
#define HORN_FREQ_MAX 4000 // Maximum horn frequency (Hz)
#define DB_THRESHOLD 75.0  // Minimum loudness in dB to trigger
#define DURATION_MS 150    // Minimum duration in ms to confirm horn

// GPS serial
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

// ==================== SETUP ==================================

void setup() {
  Serial.begin(115200);
  Serial.println("SmartHelm - Starting up...");

  // Pin modes
  pinMode(MIC_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VIBRATION_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(VIBRATION_PIN, LOW);

  // Connect to Wi-Fi
  connectWiFi();

  // Start GPS serial
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("GPS module initialized.");

  Serial.println("Setup complete. Listening for horns...");
}

// ==================== MAIN LOOP ==============================

void loop() {
  // Step 1: Read GPS data (non-blocking)
  while (GPSSerial.available() > 0) {
    gps.encode(GPSSerial.read());
  }

  // Step 2: Sample audio from microphone
  sampleAudio();

  // Step 3: Run FFT
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD); // Apply Hamming window
  FFT.compute(FFT_FORWARD);                        // Compute FFT
  FFT.complexToMagnitude();                        // Get magnitudes

  // Step 4: Analyze frequency bins for horn range
  double hornMagnitude = getHornMagnitude();
  double dB = 20.0 * log10(hornMagnitude + 1); // Convert to approximate dB

  // Step 5: Check threshold with duration filter
  if (dB >= DB_THRESHOLD) {
    if (!hornDetected) {
      // Horn just started — mark the time
      hornStartTime = millis();
      hornDetected = true;
    } else if (millis() - hornStartTime >= DURATION_MS) {
      // Horn confirmed (sustained for > 150 ms)
      Serial.printf("🔔 Horn detected! dB=%.1f, Duration=%lums\n", dB,
                    millis() - hornStartTime);
      // Trigger alert hardware
      triggerAlert();
      // Send data to backend
      sendAlertToServer(dB);
      // Reset state
      hornDetected = false;
      // Brief cooldown to avoid duplicate alerts
      delay(1000);
    }
  } else {
    // No horn — reset
    hornDetected = false;
  }
}

// ==================== HELPER FUNCTIONS =======================

/**
 * Connect to Wi-Fi network
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
    Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWi-Fi connection failed. Continuing in offline mode.");
  }
}

/**
 * Sample audio from the MEMS microphone into the FFT arrays
 * Uses analogRead at the configured sampling frequency
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
      // busy-wait for precise timing
      yield(); // FIX: Keeps ESP32 watchdog happy
    }
  }
}

/**
 * Analyze FFT output and return the peak magnitude
 * in the horn frequency band (2000-4000 Hz)
 */
double getHornMagnitude() {
  double freqResolution = (double)SAMPLING_FREQ / SAMPLES;
  // Calculate bin range for horn frequencies
  int binMin = (int)(HORN_FREQ_MIN / freqResolution);
  int binMax = (int)(HORN_FREQ_MAX / freqResolution);
  // Clamp to valid range (only first half of FFT is useful)
  if (binMax > SAMPLES / 2)
    binMax = SAMPLES / 2;
  // Find peak magnitude in the horn band
  double peakMag = 0;
  for (int i = binMin; i <= binMax; i++) {
    if (vReal[i] > peakMag) {
      peakMag = vReal[i];
    }
  }

  return peakMag;
}

/**
 * Activate buzzer and vibration motor to alert the rider
 */
void triggerAlert() {
  // Turn ON buzzer and vibration
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(VIBRATION_PIN, HIGH);

  // Keep active for 500 ms
  delay(500);

  // Turn OFF
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(VIBRATION_PIN, LOW);
}

/**
 * Send horn alert data to the Flask backend via HTTP POST
 * JSON format: { "type": "horn", "intensity_db": 82.5, "lat": ..., "lng": ...,
 * "device_id": "..." }
 */
void sendAlertToServer(double dB) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi not connected. Skipping server alert.");
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

  // Build JSON payload
  String payload = "{";
  payload += "\"type\": \"horn\",";
  payload += "\"intensity_db\": " + String(dB, 1) + ",";
  payload += "\"lat\": " + String(lat, 6) + ",";
  payload += "\"lng\": " + String(lng, 6) + ",";
  payload += "\"device_id\": \"HELM-001\"";
  payload += "}";
  Serial.printf("Sending to server: %s\n", payload.c_str());

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("Server response: %d - %s\n", httpCode,
                  http.getString().c_str());
  } else {
    Serial.printf("HTTP POST failed: %s\n",
                  http.errorToString(httpCode).c_str());
  }

  http.end();
}
// FIX: Removed extra '}' that was crashing the compiler