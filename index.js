#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// --- 🌐 ตั้งค่าเน็ตเวิร์กและลิงก์เซิร์ฟเวอร์ของคุณ ---
const char* ssid = "Wokwi-GUEST"; 
const char* password = "";        
const char* commandUrl = "https://motor-control-line.onrender.com/api/motor/command";
const char* reportUrl  = "https://motor-control-line.onrender.com/api/motor/report";

// --- 📌 กำหนดขาพินอุปกรณ์ตามจริง ---
#define LED_GREEN  12  // ไฟ RUN (สีเขียว)
#define LED_YELLOW 14  // ไฟ STANDBY (สีเหลือง)
#define LED_RED    26  // ไฟ FAULT (สีแดง)
#define BTN_FAULT  21  // ปุ่มกด TEST FAULT (ขา 21)

String localState = "STANDBY"; // ตัวจำสถานะภายในบอร์ด ("STANDBY", "RUNNING", "FAULT")
unsigned long lastCheckTime = 0;
const unsigned long checkInterval = 2000; // วิ่งไปถามไลน์ทุกๆ 2 วินาที

void sendStatusReport(String state);

void setup() {
  Serial.begin(115200);
  
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BTN_FAULT, INPUT_PULLUP); // ใช้ Pullup ภายใน ขา 21

  // เริ่มต้นตู้ควบคุม: ให้ไฟสีเหลืองติดแสตนบายไว้
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, HIGH);
  digitalWrite(LED_RED, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wokwi WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected Successfully!");
  
  // รายงานตัวนัดแรกกับเซิร์ฟเวอร์
  sendStatusReport(localState); 
}

void loop() {
  // -------------------------------------------------------------
  // จังหวะที่ 1: ตรวจจับปุ่ม Fault (ขา 21) แบบเรียลไทม์ + ระบบ Debounce
  // -------------------------------------------------------------
  bool isButtonPressed = (digitalRead(BTN_FAULT) == LOW);

  if (isButtonPressed) {
    // ถ้าปุ่มโดนกด และตู้ยังไม่รับรู้ว่าเป็น FAULT -> ล็อกสถานะทันที
    if (localState != "FAULT") {
      localState = "FAULT";
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_YELLOW, LOW);
      digitalWrite(LED_RED, HIGH);
      Serial.println("🚨 EMERGENCY: ตรวจพบเหตุขัดข้องที่ปุ่มกด ขา 21!");
      
      sendStatusReport("FAULT");
      delay(400); // 🛡️ หน่วงเวลาสั้นๆ เพื่อให้แรงดันไฟฟ้าคงที่ ป้องกันการยิงคำสั่งรัวๆ
    }
  } 
  else {
    // ถ้าปล่อยนิ้วออกจากปุ่มแล้ว และตู้ยังค้างสถานะ FAULT -> ให้ดึงกลับมาปกติ
    if (localState == "FAULT") {
      localState = "STANDBY";
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_YELLOW, HIGH);
      digitalWrite(LED_RED, LOW);
      Serial.println("🔄 RECOVERY: เหตุขัดข้องคลี่คลาย ระบบกลับสู่สแตนบาย");
      
      sendStatusReport("STANDBY");
      delay(400); // 🛡️ กันสัญญาณกระเพื่อมตอนปล่อยนิ้ว
    }
  }

  // -------------------------------------------------------------
  // จังหวะที่ 2: ไปดึงคำสั่ง เปิด/ปิด จาก LINE (ทำเฉพาะตอนที่ตู้ไม่ได้พัง)
  // -------------------------------------------------------------
  if (millis() - lastCheckTime >= checkInterval) {
    lastCheckTime = millis();
    
    if (localState != "FAULT" && WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure(); 
      
      HTTPClient http;
      http.begin(client, commandUrl);
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
      
      int httpCode = http.GET();
      
      if (httpCode == 200) {
        String payload = http.getString();
        Serial.println("Fetched LINE command: " + payload);
        
        // ตรวจสอบคำสั่งผสมสถานะปัจจุบัน เพื่อไม่ให้ยิงรายงานซ้ำซ้อน
        if (payload.indexOf("ON") >= 0) {
          if (localState != "RUNNING") {
            localState = "RUNNING";
            digitalWrite(LED_GREEN, HIGH);
            digitalWrite(LED_YELLOW, LOW);
            digitalWrite(LED_RED, LOW);
            sendStatusReport("RUNNING");
          }
        } 
        else if (payload.indexOf("OFF") >= 0) {
          if (localState != "STANDBY") {
            localState = "STANDBY";
            digitalWrite(LED_GREEN, LOW);
            digitalWrite(LED_YELLOW, HIGH);
            digitalWrite(LED_RED, LOW);
            sendStatusReport("STANDBY");
          }
        }
      }
      http.end();
    }
  }
}

void sendStatusReport(String state) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    http.begin(client, reportUrl);
    http.addHeader("Content-Type", "application/json");
    
    String jsonBody = "{\"state\":\"" + state + "\"}";
    int httpCode = http.POST(jsonBody);
    
    Serial.print(">> [Report Sent] State: ");
    Serial.print(state);
    Serial.print(" | Server Response: ");
    Serial.println(httpCode);
    
    http.end();
  }
}
