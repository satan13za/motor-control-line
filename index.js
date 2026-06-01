#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ========================= WIFI =========================
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ========================= SERVER =========================
String serverName = "https://motor-control-line.onrender.com";

// ========================= PIN =========================
#define RELAY_PIN 26
#define FAULT_BUTTON 14
#define START_BTN 27
#define STOP_BTN 25
#define MODE_SWITCH 33
#define RESET_BTN 32

// ========================= STATE =========================
bool motorRunning = false;
bool faultState = false;

String lastState = "";
unsigned long lastCommandCheck = 0;
unsigned long lastHeartbeat = 0;

// ========================= WIFI =========================
void connectWiFi() {

  WiFi.begin(ssid, password);

  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP());
}

// ========================= SEND STATUS =========================
void sendStatus(String state) {

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(serverName + "/api/motor/report");
  http.addHeader("Content-Type", "application/json");

  String json = "{\"state\":\"" + state + "\"}";

  int code = http.POST(json);

  Serial.print("STATUS: ");
  Serial.print(state);
  Serial.print(" | HTTP: ");
  Serial.println(code);

  http.end();
}

// ========================= COMMAND =========================
void checkCommand() {

  if (WiFi.status() != WL_CONNECTED) return;
  if (faultState) return;

  HTTPClient http;
  http.setTimeout(3000);
  http.begin(serverName + "/api/motor/command");

  int httpCode = http.GET();

  if (httpCode == 200) {

    String payload = http.getString();

    StaticJsonDocument<200> doc;
    deserializeJson(doc, payload);

    String command = doc["command"] | "NONE";

    if (digitalRead(MODE_SWITCH) == HIGH) {

      if (command == "ON" && !motorRunning) {
        digitalWrite(RELAY_PIN, LOW);
        motorRunning = true;
      }

      if (command == "OFF" && motorRunning) {
        digitalWrite(RELAY_PIN, HIGH);
        motorRunning = false;
      }
    }
  }

  http.end();
}

// ========================= HEARTBEAT =========================
void heartbeat() {

  if (WiFi.status() != WL_CONNECTED) return;

  String state;

  if (faultState) state = "FAULT";
  else if (motorRunning) state = "RUNNING";
  else state = "STANDBY";

  sendStatus(state);
}

// ========================= SETUP =========================
void setup() {

  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);

  pinMode(FAULT_BUTTON, INPUT_PULLUP);
  pinMode(START_BTN, INPUT_PULLUP);
  pinMode(STOP_BTN, INPUT_PULLUP);
  pinMode(MODE_SWITCH, INPUT_PULLUP);
  pinMode(RESET_BTN, INPUT_PULLUP);

  digitalWrite(RELAY_PIN, HIGH); // SAFE

  connectWiFi();

  sendStatus("STANDBY");
}

// ========================= LOOP =========================
void loop() {

  bool autoMode = (digitalRead(MODE_SWITCH) == HIGH);

  // ================= FAULT =================
  if (digitalRead(FAULT_BUTTON) == LOW) {

    faultState = true;
    motorRunning = false;
    digitalWrite(RELAY_PIN, HIGH);

    sendStatus("FAULT");
  }

  // ================= RESET =================
  if (digitalRead(RESET_BTN) == LOW && faultState) {

    faultState = false;
    sendStatus("STANDBY");
  }

  // ================= MANUAL =================
  if (!autoMode && !faultState) {

    if (digitalRead(START_BTN) == LOW) {
      motorRunning = true;
      digitalWrite(RELAY_PIN, LOW);
    }

    if (digitalRead(STOP_BTN) == LOW) {
      motorRunning = false;
      digitalWrite(RELAY_PIN, HIGH);
    }
  }

  // ================= AUTO =================
  if (autoMode && !faultState) {

    if (millis() - lastCommandCheck > 2000) {
      lastCommandCheck = millis();
      checkCommand();
    }
  }

  // ================= HEARTBEAT (สำคัญ) =================
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    heartbeat();
  }
}
