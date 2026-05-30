const express = require('express');
const { Client } = require('@line/bot-sdk');
const app = express();
app.use(express.json());

const client = new Client({ 
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, 
    channelSecret: process.env.CHANNEL_SECRET 
});

let motorCommand = "OFF";
let lastReportedState = "STANDBY";
let targetUserId = process.env.USER_ID || null;
let lastSeen = Date.now();
let isOfflineReported = false; // ตัวแปรล็อกสถานะการเตือน

app.post('/api/motor/report', (req, res) => {
  lastSeen = Date.now();
  if (isOfflineReported) {
      isOfflineReported = false; // รีเซ็ตการเตือนเมื่อบอร์ดกลับมา
      if(targetUserId) client.pushMessage(targetUserId, {type:'text', text:'✅ ตู้ควบคุมกลับมาออนไลน์แล้ว'});
  }
  const { state } = req.body;
  if (state && state !== lastReportedState) {
    lastReportedState = state;
    if (targetUserId) client.pushMessage(targetUserId, {type:'text', text:`📊 สถานะล่าสุด: ${state}`}).catch(console.error);
  }
  res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
  lastSeen = Date.now();
  res.json({ command: motorCommand });
});

// ระบบตรวจสอบบอร์ด (ตรวจทุก 30 วินาที)
setInterval(() => {
  if (Date.now() - lastSeen > 120000 && !isOfflineReported && targetUserId) {
    isOfflineReported = true; // ล็อกไม่ให้เตือนซ้ำ
    client.pushMessage(targetUserId, { type: 'text', text: '⚠️ ตู้ควบคุมขาดการติดต่อเกิน 2 นาที!' }).catch(console.error);
  }
}, 30000);

app.post('/webhook', (req, res) => { /* โค้ดเดิมที่คุณมี */ res.sendStatus(200); });
app.listen(process.env.PORT || 3000);
