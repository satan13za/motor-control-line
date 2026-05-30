const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// --- ตั้งค่าระบบเชื่อมต่อ LINE Bot ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new Client(config);

// --- ตัวแปรหลักในการควบคุมระบบ ---
let motorCommand = "OFF";          // คำสั่งควบคุมหลัก: ON หรือ OFF
let lastReportedState = "STANDBY";  // สถานะจริงที่บอร์ดรายงานกลับมา: STANDBY, RUNNING, FAULT
let targetUserId = null;          // ไอดีไลน์ของผู้ใช้งาน (จะบันทึกอัตโนมัติเมื่อคุยกับบอท)
let lastSeen = Date.now();         // เวลาล่าสุดที่บอร์ดติดต่อเข้ามา (ใช้เช็ค Heartbeat)
let isOfflineReported = false;     // เช็คว่าได้แจ้งเตือนออฟไลน์ไปแล้วหรือยัง

// ฟังก์ชันอัปเดตเวลาเชื่อมต่อเมื่อบอร์ดทักมา
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

// -------------------------------------------------------------
// [1] Endpoint: สำหรับให้ ESP32 มารับคำสั่ง (ON / OFF)
// -------------------------------------------------------------
app.get('/api/motor/command', (req, res) => {
  updateHeartbeat(); // บอร์ดติดต่อเข้ามาดึงข้อมูล = บอร์ดยังทำงานอยู่
  res.json({ command: motorCommand });
});

// -------------------------------------------------------------
// [2] Endpoint: สำหรับรับรายงานสถานะจริงจากบอร์ด และแจ้งเตือนเข้า LINE
// -------------------------------------------------------------
app.post('/api/motor/report', (req, res) => {
  updateHeartbeat();
  const { state } = req.body;
  console.log(`[ESP32 Report] สถานะจริงจากบอร์ด: ${state}`);
  
  // ตรวจสอบว่าสถานะมีการเปลี่ยนแปลงจากเดิมไหม เพื่อไม่ให้ไลน์เด้งซ้ำซ้อน
  if (state !== lastReportedState) {
    lastReportedState = state;
    
    if (targetUserId) {
      let messageText = "";
      
      // เงื่อนไขการแจ้งเตือนสถานะต่างๆ 
      if (state === "FAULT") {
        messageText = "🚨 [แจ้งเตือนอันตราย] ตู้ควบคุมตรวจพบสถานะ ผิดปกติ (Fault)! ระบบตัดการทำงานทันที กรุณาตรวจสอบหน้างานด่วน!";
      } else if (state === "RUNNING") {
        messageText = "🟢 [สถานะการทำงาน] มอเตอร์สตาร์ทเครื่องและกำลังทำงานเรียบร้อยแล้ว (Running)";
      } else if (state === "STANDBY") {
        messageText = "🟡 [สถานะการทำงาน] มอเตอร์หยุดการทำงานและเข้าสู่โหมดสแตนบายเรียบร้อยแล้ว (Standby)";
      }
      
      // ส่งข้อความดัน (Push Message) แจ้งผู้ใช้ทันทีเมื่อบอร์ดทำงานสำเร็จ
      client.pushMessage(targetUserId, { type: 'text', text: messageText })
        .catch(err => console.error("LINE Push Error:", err));
    }
  }
  res.sendStatus(200);
});

// -------------------------------------------------------------
// [3] ระบบตรวจสอบอัตโนมัติ: บอร์ดหาย/เน็ตหลุด (เช็คทุกๆ 5 วินาที)
// -------------------------------------------------------------
setInterval(() => {
  const timeDifference = Date.now() - lastSeen;
  
  // ถ้าบอร์ดหายไปเกิน 15 วินาที และยังไม่เคยแจ้งเตือน
  if (targetUserId && !isOfflineReported && timeDifference > 15000) {
    isOfflineReported = true;
    client.pushMessage(targetUserId, { 
      type: 'text', 
      text: '⚠️ [เตือนภัย] ตู้ควบคุมขาดการติดต่อ (Offline) เกิน 15 วินาที! กรุณาตรวจสอบปลั๊กไฟหรือสัญญาณ Wi-Fi ของบอร์ด' 
    }).catch(err => console.error(err));
  }
}, 5000);

// -------------------------------------------------------------
// [4] Webhook: รับข้อความสั่งการจาก LINE App
// -------------------------------------------------------------
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      targetUserId = event.source.userId; // บันทึก ID LINE ไว้สำหรับส่งแจ้งเตือนด่วน
      
      if (text === "เปิด") {
        motorCommand = "ON";
        client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '📥 [รับคำสั่ง] กำลังส่งสัญญาณ "เปิดมอเตอร์" ไปยังตู้ควบคุม... (รอการตอบกลับจากบอร์ด)' 
        });
      } 
      else if (text === "ปิด") {
        motorCommand = "OFF";
        client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '📥 [รับคำสั่ง] กำลังส่งสัญญาณ "ปิดมอเตอร์" ไปยังตู้ควบคุม... (รอการตอบกลับจากบอร์ด)' 
        });
      } 
      else if (text === "เช็คสถานะ") {
        const isOffline = (Date.now() - lastSeen > 15000);
        const connectionText = isOffline ? "🔴 ออฟไลน์ (Offline/ขาดการติดต่อ)" : "🟢 ออนไลน์ (Online)";
        
        let motorText = "";
        if (lastReportedState === "FAULT") motorText = "🚨 ผิดปกติ (Fault)";
        else if (lastReportedState === "RUNNING") motorText = "🟢 กำลังทำงาน (Running)";
        else if (lastReportedState === "STANDBY") motorText = "🟡 สแตนบาย (Standby)";

        const replyText = `📊 รายงานสถานะตู้ควบคุมเรียลไทม์:\n\n` +
                          `• การเชื่อมต่อเซิร์ฟเวอร์: ${connectionText}\n` +
                          `• สถานะตู้ควบคุมจริง: ${motorText}\n` +
                          `• คำสั่งล่าสุดในระบบ: ${motorCommand}`;
                          
        client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      } 
      else {
        client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '🤖 ยินดีต้อนรับสู่ตู้ควบคุมมอเตอร์อัจฉริยะ\n\n📌 คำสั่งที่ใช้งานได้:\n- พิมพ์คำว่า "เปิด" เพื่อเปิดระบบ\n- พิมพ์คำว่า "ปิด" เพื่อปิดระบบ\n- พิมพ์คำว่า "เช็คสถานะ" เพื่อดูข้อมูลปัจจุบัน' 
        });
      }
    }
  });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
