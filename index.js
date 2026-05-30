const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new Client(config);

// ตัวแปรเก็บสถานะระบบ
let motorCommand = "OFF";          // คำสั่งควบคุม: ON หรือ OFF
let lastReportedState = "STANDBY";  // สถานะจริงจากบอร์ด: STANDBY, RUNNING, FAULT
let targetUserId = null;          // ไอดีไลน์ผู้ใช้
let lastSeen = Date.now();         // เวลาล่าสุดที่บอร์ดติดต่อมา (Heartbeat)
let isOfflineReported = false;     // สถานะการแจ้งเตือนออฟไลน์

// ฟังก์ชันอัปเดตเวลาล่าสุดที่บอร์ดเชื่อมต่อ
const updateHeartbeat = () => {
  lastSeen = Date.now();
  if (isOfflineReported) {
    isOfflineReported = false;
    if (targetUserId) {
      client.pushMessage(targetUserId, { 
        type: 'text', 
        text: '✅ [ระบบ] ตู้ควบคุมกลับมาเชื่อมต่อออนไลน์ และเริ่มทำงานอีกครั้งแล้ว' 
      }).catch(err => console.error(err));
    }
  }
};

// 1. Endpoint สำหรับให้ ESP32 มาดึงคำสั่ง (เปรียบเสมือนส่ง Heartbeat ในตัว)
app.get('/api/motor/command', (req, res) => {
  updateHeartbeat(); // บอร์ดทักมา = บอร์ดยังทำงานอยู่
  res.json({ command: motorCommand });
});

// 2. Endpoint สำหรับให้ ESP32 รายงานสถานะจริงกลับมา
app.post('/api/motor/report', (req, res) => {
  updateHeartbeat();
  const { state } = req.body;
  console.log(`ESP32 Reported State: ${state}`);
  
  if (state !== lastReportedState) {
    lastReportedState = state;
    
    if (targetUserId) {
      let messageText = "";
      if (state === "FAULT") {
        messageText = "🚨 [แจ้งเตือน] ตู้ควบคุมตรวจพบสถานะ Fault! ระบบตัดการทำงานทันที";
      } else if (state === "RUNNING") {
        messageText = "🟢 [สถานะ] มอเตอร์เปิดใช้งานและกำลังทำงาน...";
      } else if (state === "STANDBY") {
        messageText = "🟡 [สถานะ] มอเตอร์หยุดการทำงาน (Standby)";
      }
      
      client.pushMessage(targetUserId, { type: 'text', text: messageText })
        .catch(err => console.error("LINE Push Error:", err));
    }
  }
  res.sendStatus(200);
});

// 3. ระบบตรวจสอบอัตโนมัติ (เช็คทุกๆ 5 วินาที) ว่าบอร์ดหายไปหรือไม่
setInterval(() => {
  const timeDifference = Date.now() - lastSeen;
  // ถ้าไม่มีการติดต่อจากบอร์ด เกิน 15 วินาที และยังไม่เคยแจ้งเตือน
  if (targetUserId && !isOfflineReported && timeDifference > 15000) {
    isOfflineReported = true;
    client.pushMessage(targetUserId, { 
      type: 'text', 
      text: '⚠️ [เตือนภัย] ตู้ควบคุมขาดการติดต่อ หรือไม่มีการทำงาน (Offline) กรุณาตรวจสอบปลั๊กไฟหรือสัญญาณ Wi-Fi!' 
    }).catch(err => console.error(err));
  }
}, 5000);

// 4. Webhook รับข้อความจาก LINE Bot
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      targetUserId = event.source.userId; // บันทึก ID ผู้ใช้ไว้ส่งแจ้งเตือนด่วน
      
      if (text === "เปิด") {
        motorCommand = "ON";
        client.replyMessage(event.replyToken, { type: 'text', text: '📥 รับคำสั่ง: กำลังส่งสัญญาณเปิดมอเตอร์...' });
      } 
      else if (text === "ปิด") {
        motorCommand = "OFF";
        client.replyMessage(event.replyToken, { type: 'text', text: '📥 รับคำสั่ง: กำลังส่งสัญญาณปิดมอเตอร์...' });
      } 
      else if (text === "เช็คสถานะ") {
        // ตรวจสอบสถานะการเชื่อมต่อ ณ ปัจจุบัน
        const isOffline = (Date.now() - lastSeen > 15000);
        const connectionText = isOffline ? "🔴 ออฟไลน์ (Offline/ไม่มีการทำงาน)" : "🟢 ออนไลน์ (Online)";
        
        let motorText = "";
        if (lastReportedState === "FAULT") motorText = "🚨 ข้อผิดพลาด (Fault)";
        else if (lastReportedState === "RUNNING") motorText = "🟢 กำลังทำงาน (Running)";
        else if (lastReportedState === "STANDBY") motorText = "🟡 สแตนบาย (Standby)";

        const replyText = `📊 รายงานสถานะตู้ควบคุมแบบเรียลไทม์:\n\n` +
                          `• การเชื่อมต่อเซิร์ฟเวอร์: ${connectionText}\n` +
                          `• สถานะมอเตอร์จำลอง: ${motorText}`;
                          
        client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      } 
      else {
        client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '🤖 ยินดีต้อนรับสู่ตู้ควบคุมมอเตอร์อัจฉริยะ\n\n- พิมพ์ "เปิด" หรือ "ปิด" เพื่อควบคุม\n- พิมพ์ "เช็คสถานะ" เพื่อดูการทำงานปัจจุบัน' 
        });
      }
    }
  });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
