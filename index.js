const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// --- ⚙️ ตั้งค่าระบบ LINE Bot (ดึงค่าจาก Environment Variables บน Render) ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};
const client = new Client(config);

// --- 📊 ตัวแปรควบคุมสถานะ (Strict State Control) ---
let targetCommand = "OFF";      // คำสั่งจาก LINE: "ON" หรือ "OFF"
let currentReportedState = "";  // สถานะล่าสุดที่บอร์ดส่งมา
let lastNotifiedState = "";     // 🛡️ ตัวล็อก ป้องกันการส่งข้อความซ้ำเข้า LINE
let targetUserId = "";          // ไอดีไลน์ของผู้ใช้ (จะบันทึกเมื่อมีการพิมพ์ทักเข้ามา)

// 📌 [GET] หน้าแรกสำหรับเช็คสถานะผ่านเบราว์เซอร์
app.get('/', (req, res) => {
  res.send(`🤖 SYSTEM ACTIVE | Command: ${targetCommand} | Board State: ${currentReportedState}`);
});

// 📌 [GET] สำหรับ ESP32 มาอ่านคำสั่ง เปิด/ปิด
app.get('/api/motor/command', (req, res) => {
  res.json({ command: targetCommand });
});

// 📌 [POST] สำหรับ ESP32 รายงานสถานะกลับมา (ส่งไลน์เตือนที่นี่)
app.post('/api/motor/report', (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).send("No state provided");

  currentReportedState = state;
  console.log(`[Hardware Update] บอร์ดแจ้งสถานะเป็น: ${currentReportedState}`);

  // ⚡ ระบบดักจับการเปลี่ยนแปลงสถานะเพื่อส่ง Push Notification
  // จะส่งหา LINE ก็ต่อเมื่อ: 1. มี ID ผู้ใช้แล้ว 2. สถานะเปลี่ยนไปจากเดิมจริง ๆ เท่านั้น
  if (targetUserId && currentReportedState !== lastNotifiedState) {
    lastNotifiedState = currentReportedState; // ล็อกสถานะทันที กันส่งซ้ำ

    let msgText = "";
    if (currentReportedState === "RUNNING") msgText = "🟢 [มอเตอร์ทำงาน] ตู้ควบคุมเปิดการทำงานมอเตอร์เรียบร้อยแล้ว";
    if (currentReportedState === "STANDBY") msgText = "🟡 [มอเตอร์หยุด] ตู้ควบคุมหยุดทำงานและสแตนบายรอสั่งงาน";
    if (currentReportedState === "FAULT")   msgText = "🚨 [แจ้งเตือนอันตราย] ตู้ควบคุมเกิดเหตุขัดข้อง ระบบติดสถานะ FAULT!";

    // ยิงข้อความแจ้งเตือนทันทีด้วย Push Message
    client.pushMessage(targetUserId, { type: 'text', text: msgText })
      .then(() => console.log(`[Push Sent Success] แจ้งเตือนสถานะ: ${currentReportedState}`))
      .catch((err) => console.error('[Push Sent Error]', err));
  }

  res.json({ status: "success", receivedState: state });
});

// 📌 [POST] Webhook รับคำสั่งพิมพ์จากแอป LINE
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      targetUserId = event.source.userId; // บันทึก ID ผู้ใช้ไว้ส่งแจ้งเตือนกลับ
      const userText = event.message.text.trim();
      let replyText = "";

      if (userText === "เปิด") {
        if (currentReportedState === "FAULT") {
          replyText = "❌ ไม่สามารถเปิดมอเตอร์ได้! เนื่องจากตู้ควบคุมติดสถานะ FAULT อยู่ครับ";
        } else {
          targetCommand = "ON";
          replyText = "📥 รับคำสั่ง [เปิดมอเตอร์] กำลังส่งสัญญาณไปยังบอร์ด...";
        }
      } 
      else if (userText === "ปิด") {
        targetCommand = "OFF";
        replyText = "📥 รับคำสั่ง [ปิดมอเตอร์] กำลังส่งสัญญาณไปยังบอร์ด...";
      } 
      else if (userText === "เช็คสถานะ") {
        let stateEmoji = currentReportedState === "RUNNING" ? "🟢 RUNNING" : (currentReportedState === "FAULT" ? "🚨 FAULT" : "🟡 STANDBY");
        replyText = `📊 รายงานสถานะปัจจุบัน:\n• สถานะตู้ควบคุม: ${stateEmoji}\n• คำสั่งสวิตช์ล่าสุด: ${targetCommand}`;
      } 
      else {
        replyText = "🤖 ยินดีต้อนรับสู่ระบบควบคุมมอเตอร์\n• พิมพ์ 'เปิด' : เพื่อสั่งรันมอเตอร์\n• พิมพ์ 'ปิด' : เพื่อหยุดทำงาน\n• พิมพ์ 'เช็คสถานะ' : เพื่อดูระบบ";
      }

      client.replyMessage(event.replyToken, { type: 'text', text: replyText })
        .catch((err) => console.error('[Reply Error]', err));
    }
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Running on port ${PORT}`));
