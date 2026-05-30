const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// --- ⚙️ ตั้งค่าระบบ LINE Bot ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};
const client = new Client(config);

// --- 📊 ตัวแปรควบคุมสถานะระบบ (Global States) ---
let targetCommand = "OFF";     // คำสั่งที่รอส่งให้บอร์ด ("ON" / "OFF")
let motorState = "STANDBY";    // สถานะจริงจากบอร์ด ("STANDBY" / "RUNNING" / "FAULT")
let targetUserId = "";         // จำ ID LINE ของผู้ใช้งาน
let lastNotifiedState = "";    // ตัวจดจำสถานะล่าสุดเพื่อกันส่งไลน์ซ้ำ
let lastNotificationTime = 0;  // 🛡️ Anti-Spam Timer (ป้องกันไลน์รั่ว)

// 📌 [Route 1] หน้าแรกสุด เอาไว้เช็คบนเว็บเบราว์เซอร์
app.get('/', (req, res) => {
  res.send(`🟢 Server Alive | State: ${motorState} | Command: ${targetCommand}`);
});

// 📌 [Route 2] สำหรับ ESP32 มาดึงคำสั่งไปทำงาน (GET)
app.get('/api/motor/command', (req, res) => {
  res.json({ command: targetCommand });
});

// 📌 [Route 3] สำหรับ ESP32 ยิงรายงานสถานะกลับมา (POST)
app.post('/api/motor/report', (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).send("Invalid State Data");

  motorState = state;
  console.log(`[ESP32 Report] Local Hardware State is: ${motorState}`);

  const now = Date.now();
  
  // 🛡️ ANTI-SPAM SHIELD: ไลน์จะเด้งเฉพาะตอนสถานะ "เปลี่ยน" และห้ามส่งถี่เกินกว่า 3 วินาทีเด็ดขาด!
  if (motorState !== lastNotifiedState && targetUserId && (now - lastNotificationTime > 3000)) {
    lastNotifiedState = motorState; 
    lastNotificationTime = now; 

    let alertText = "";
    if (motorState === "RUNNING") alertText = "🟢 มอเตอร์เริ่มทำงานแล้ว (RUNNING)";
    if (motorState === "STANDBY") alertText = "🟡 มอเตอร์หยุดทำงาน/สแตนบาย (STANDBY)";
    if (motorState === "FAULT") alertText = "🚨 ตู้ควบคุมเกิดเหตุขัดข้อง! ระบบติดสถานะ FAULT";

    // ยิง Push Notification หาผู้ใช้ในไลน์ทันที
    client.pushMessage(targetUserId, { type: 'text', text: alertText })
      .then(() => console.log(`[LINE Push Success] Notified: ${motorState}`))
      .catch((err) => console.error('[LINE Push Error]', err));
  }

  res.json({ status: "success", serverState: motorState });
});

// 📌 [Route 4] ระบบ Webhook รับคำสั่งจากแอป LINE
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      targetUserId = event.source.userId; // บันทึก ID ผู้ใช้ไว้ส่งแจ้งเตือนกลับ
      const userText = event.message.text.trim();
      let replyText = "";

      if (userText === "เปิด") {
        if (motorState === "FAULT") {
          replyText = "❌ ไม่สามารถเปิดได้! เนื่องจากระบบที่ตู้ควบคุมติดสถานะ FAULT อยู่";
        } else {
          targetCommand = "ON";
          replyText = "⏳ รับคำสั่ง [เปิดมอเตอร์] กำลังส่งสัญญาณไปยังบอร์ด...";
        }
      } 
      else if (userText === "ปิด") {
        targetCommand = "OFF";
        replyText = "⏳ รับคำสั่ง [ปิดมอเตอร์] กำลังส่งสัญญาณไปยังบอร์ด...";
      } 
      else if (userText === "เช็คสถานะ") {
        replyText = `📊 รายงานระบบไฟฟ้า:\n• สถานะตู้ควบคุม: ${motorState}\n• คำสั่งล่าสุดจากไลน์: ${targetCommand}`;
      } 
      else {
        replyText = "🤖 คำสั่งตู้ควบคุมมอเตอร์:\n• พิมพ์ 'เปิด' เพื่อรันมอเตอร์\n• พิมพ์ 'ปิด' เพื่อหยุดมอเตอร์\n• พิมพ์ 'เช็คสถานะ' เพื่อดูระบบ";
      }

      client.replyMessage(event.replyToken, { type: 'text', text: replyText })
        .catch((err) => console.error('[LINE Reply Error]', err));
    }
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Clean Architecture Server running on port ${PORT}`);
});
