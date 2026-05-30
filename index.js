const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new Client(config);

// ตัวแปรเก็บสถานะในหน่วยความจำ (Global Variables)
let motorCommand = "OFF";     // คำสั่งจาก LINE: ON หรือ OFF
let lastReportedState = "STANDBY"; // สถานะจริงจาก ESP32: STANDBY, RUNNING, FAULT
let targetUserId = null;     // เก็บ ID ไลน์ของผู้ใช้เพื่อใช้ส่งแจ้งเตือนกลับ

// 1. Endpoint สำหรับให้ ESP32 มาดึงคำสั่ง (Polling)
app.get('/api/motor/command', (req, res) => {
  res.json({ command: motorCommand });
});

// 2. Endpoint สำหรับให้ ESP32 รายงานสถานะจริงกลับมา
app.post('/api/motor/report', (req, res) => {
  const { state } = req.body;
  console.log(`ESP32 Reported: ${state}`);
  
  if (state !== lastReportedState) {
    lastReportedState = state;
    
    // ส่งข้อความแจ้งเตือนเข้า LINE เมื่อสถานะเปลี่ยน
    if (targetUserId) {
      let messageText = "";
      if (state === "FAULT") {
        messageText = "🚨 [แจ้งเตือน] ตู้ควบคุมตรวจพบสถานะ Fault! ระบบตัดการทำงานของมอเตอร์ทันที กรุณาตรวจสอบ";
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

// 3. Webhook สำหรับรับข้อความจาก LINE Bot
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      targetUserId = event.source.userId; // บันทึก ID ผู้ใช้ไว้ส่งการแจ้งเตือน
      
      if (text === "เปิด") {
        motorCommand = "ON";
        client.replyMessage(event.replyToken, { type: 'text', text: '📥 รับคำสั่ง: กำลังส่งสัญญาณเปิดมอเตอร์...' });
      } else if (text === "ปิด") {
        motorCommand = "OFF";
        client.replyMessage(event.replyToken, { type: 'text', text: '📥 รับคำสั่ง: กำลังส่งสัญญาณปิดมอเตอร์...' });
      } else {
        client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '🤖 ยินดีต้อนรับสู่ตู้ควบคุมมอเตอร์อัจฉริยะ\n\nพิมพ์ "เปิด" หรือ "ปิด" เพื่อควบคุมระบบ' 
        });
      }
    }
  });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
