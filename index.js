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
let isOfflineReported = false;

app.post('/api/motor/report', (req, res) => {
  lastSeen = Date.now();
  if (isOfflineReported) { isOfflineReported = false; }
  
  const { state } = req.body;
  if (state && state !== lastReportedState) {
    lastReportedState = state;
    if (targetUserId) client.pushMessage(targetUserId, {type:'text', text:`📊 สถานะ: ${state}`}).catch(console.error);
  }
  res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
  lastSeen = Date.now();
  res.json({ command: motorCommand });
});

app.post('/webhook', (req, res) => {
  req.body.events.forEach(event => {
    if (event.type === 'message') {
      targetUserId = event.source.userId;
      const text = event.message.text.trim();
      if (text === "เปิด") motorCommand = "ON";
      if (text === "ปิด") motorCommand = "OFF";
      client.replyMessage(event.replyToken, {type: 'text', text: `รับคำสั่ง: ${text}`});
    }
  });
  res.sendStatus(200);
});

setInterval(() => {
  if (Date.now() - lastSeen > 120000 && !isOfflineReported && targetUserId) {
    isOfflineReported = true;
    client.pushMessage(targetUserId, {type:'text', text:'⚠️ ตู้ควบคุมขาดการติดต่อเกิน 2 นาที'}).catch(console.error);
  }
}, 30000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
