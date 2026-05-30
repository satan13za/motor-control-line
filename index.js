// เพิ่มบรรทัดนี้ไว้ส่วนบนๆ ของ index.js
app.get('/', (req, res) => {
  res.send('Server is Online and Motor Controller API is ready!');
});

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
// แก้ไข: ใช้ process.env.USER_ID เป็นตัวหลัก ถ้าไม่มีค่อยใช้ตัวแปรที่รับมาจากไลน์
let targetUserId = process.env.USER_ID || null; 
let lastSeen = Date.now();

app.post('/api/motor/report', (req, res) => {
  lastSeen = Date.now();
  const { state } = req.body;
  console.log(`[Report] รับค่า: ${state} | TargetID: ${targetUserId}`);

  if (state && state !== lastReportedState) {
    lastReportedState = state;
    if (targetUserId) {
        client.pushMessage(targetUserId, {type:'text', text:`📊 รายงานสถานะ: ${state}`})
        .then(() => console.log("แจ้งเตือนสำเร็จ"))
        .catch(err => console.error("แจ้งเตือนพลาด:", err));
    } else {
        console.log("Error: ไม่มี Target ID ส่งหาใครไม่ได้!");
    }
  }
  res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
  lastSeen = Date.now();
  res.json({ command: motorCommand });
});

app.post('/webhook', (req, res) => {
  req.body.events.forEach(event => {
    // อัปเดต ID ทุกครั้งที่มีการคุย เพื่อความชัวร์
    if (event.source.userId) targetUserId = event.source.userId;
    
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      if (text === "เปิด") motorCommand = "ON";
      else if (text === "ปิด") motorCommand = "OFF";
      client.replyMessage(event.replyToken, {type: 'text', text: `รับคำสั่ง: ${text}`});
    }
  });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
