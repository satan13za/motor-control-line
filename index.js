const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};
const client = new Client(config);

// --- ตัวแปรสถานะระบบ ---
let targetCommand = "OFF";      
let currentReportedState = "STANDBY";  
let lastNotifiedState = "";     
let targetUserId = "";          

// 🛠️ ฟังก์ชันสร้างแสตมป์เวลาในเขตอบอุ่นประเทศไทย (Format: วัน/เดือน/ปี เวลา:นาที:วินาที)
function getThaiTimestamp() {
  return new Date().toLocaleString('th-TH', { 
    timeZone: 'Asia/Bangkok', 
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

app.get('/', (req, res) => {
  res.send(`🤖 SYSTEM ACTIVE | Telemetry Timestamp: ${getThaiTimestamp()}`);
});

app.get('/api/motor/command', (req, res) => {
  res.json({ command: targetCommand });
});

// 📌 [POST] ฮาร์ดแวร์รายงานกลับเมื่อสถานะเปลี่ยนจริง
app.post('/api/motor/report', (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).send("No state provided");

  currentReportedState = state;
  const timestamp = getThaiTimestamp();

  if (targetUserId && currentReportedState !== lastNotifiedState) {
    lastNotifiedState = currentReportedState; 

    let msgText = "";
    if (currentReportedState === "RUNNING") {
      msgText = `🟢 [HARDWARE CONFIRMED]\n----------------------------------\n• ระบบ: มอเตอร์เดินเครื่องสำเร็จ\n• สถานะปัจจุบัน: RUNNING\n• เวลาบันทึก: ${timestamp}\n• กระแสโหลด: ปกติ (100%)`;
    }
    if (currentReportedState === "STANDBY") {
      msgText = `🟡 [HARDWARE CONFIRMED]\n----------------------------------\n• ระบบ: มอเตอร์หยุดทำงานปกติ\n• สถานะปัจจุบัน: STANDBY\n• เวลาบันทึก: ${timestamp}`;
    }
    if (currentReportedState === "FAULT") {
      msgText = `🚨 [CRITICAL ALERT: FAULT]\n----------------------------------\n• ตู้ควบคุมเกิดเหตุขัดข้องร้ายแรง\n• สถานะปัจจุบัน: SYSTEM TRIP / FAULT\n• เวลาตรวจพบ: ${timestamp}\n• คำแนะนำ: โปรดตรวจสอบโอเวอร์โหลดหรือปุ่ม Emergency หน้างาน`;
    }

    client.pushMessage(targetUserId, { type: 'text', text: msgText })
      .catch((err) => console.error('Push Error:', err));
  }

  res.json({ status: "success" });
});

// 📌 [POST] Webhook รับคำสั่งพิมพ์จาก LINE (ตอบกลับทันทีพร้อมสถานะและเวลา)
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      targetUserId = event.source.userId; 
      const userText = event.message.text.trim();
      const timestamp = getThaiTimestamp();
      let replyText = "";

      if (userText === "เปิด") {
        if (currentReportedState === "FAULT") {
          replyText = `❌ [COMMAND DENIED]\n----------------------------------\n• การกระทำ: ไม่สามารถเปิดระบบได้\n• สาเหตุ: ตู้ควบคุมติดสถานะ FAULT\n• เวลาปฏิเสธ: ${timestamp}`;
        } else {
          targetCommand = "ON";
          replyText = `📥 [COMMAND ACKNOWLEDGED]\n----------------------------------\n• คำสั่ง: สั่งเปิดระบบ (MOTOR ON)\n• เวลาส่งออก: ${timestamp}\n• สถานะคิว: รอนำส่งข้อมูลเข้าบอร์ดควบคุม...\n\n*(ระบบจะแชร์ Log ยืนยันอีกครั้งเมื่อบอร์ดตอบรับ)*`;
        }
      } 
      else if (userText === "ปิด") {
        targetCommand = "OFF";
        replyText = `📥 [COMMAND ACKNOWLEDGED]\n----------------------------------\n• คำสั่ง: สั่งปิดระบบ (MOTOR OFF)\n• เวลาส่งออก: ${timestamp}\n• สถานะคิว: รอนำส่งข้อมูลเข้าบอร์ดควบคุม...\n\n*(ระบบจะแชร์ Log ยืนยันอีกครั้งเมื่อบอร์ดตอบรับ)*`;
      } 
      else if (userText === "เช็คสถานะ") {
        let stateIndicator = currentReportedState === "RUNNING" ? "🟢 RUNNING" : (currentReportedState === "FAULT" ? "🚨 FAULT / TRIP" : "🟡 STANDBY");
        replyText = `📊 [SYSTEM TELEMETRY REPORT]\n----------------------------------\n• เวลาสแกนลูป: ${timestamp}\n• สถานะตู้ควบคุมจริง: ${stateIndicator}\n• คำสั่งสวิตช์ล่าสุด: ${targetCommand}\n• สถานะเครือข่ายบอร์ด: ออนไลน์ (Active)`;
      } 
      else {
        replyText = `🤖 [MOTOR CONTROL BOT]\n----------------------------------\nกรุณาใช้คำสั่งควบคุมมาตรฐานดังนี้:\n• พิมพ์ 'เปิด' : เพื่อสตาร์ทมอเตอร์\n• พิมพ์ 'ปิด' : เพื่อสต็อปมอเตอร์\n• พิมพ์ 'เช็คสถานะ' : เพื่อดูสถานะเรียลไทม์`;
      }

      client.replyMessage(event.replyToken, { type: 'text', text: replyText })
        .catch((err) => console.error('Reply Error:', err));
    }
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Telemetry Server Active`));
