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

// รับรายงานจาก ESP32
app.post('/api/motor/report', (req, res) => {
  lastSeen = Date.now();
  const { state } = req.body;
  if (state && state !== lastReportedState) {
    lastReportedState = state;
    if (targetUserId) {
      client.pushMessage(targetUserId, { type: 'text', text: `📊 สถานะล่าสุด: ${state}` }).catch(console.error);
    }
  }
  res.sendStatus(200);
});

// ให้ ESP32 มาดึงคำสั่ง
app.get('/api/motor/command', (req, res) => {
  lastSeen = Date.now();
  res.json({ command: motorCommand });
});

// รับคำสั่งจาก LINE
app.post('/webhook', (req, res) => {
  req.body.events.forEach(event => {
    targetUserId = event.source.userId;
    const text = event.message.text.trim();
    if (text === "เปิด") motorCommand = "ON";
    if (text === "ปิด") motorCommand = "OFF";
    client.replyMessage(event.replyToken, { type: 'text', text: `รับคำสั่ง: ${text}` });
  });
  res.sendStatus(200);
});

setInterval(() => {
  if (Date.now() - lastSeen > 15000 && targetUserId) {
    client.pushMessage(targetUserId, { type: 'text', text: '⚠️ ตู้ควบคุม Offline!' }).catch(console.error);
  }
}, 10000);

app.listen(process.env.PORT || 3000);
