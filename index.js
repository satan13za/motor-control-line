const express = require('express');
const { Client } = require('@line/bot-sdk');
const http = require('http'); // เพิ่มระบบ HTTP Server หลัก
const WebSocket = require('ws'); // เพิ่มโมดูลเพื่อทำท่อตรง Real-time

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};
const client = new Client(config);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // สร้างเซิร์ฟเวอร์ท่อตรง

let targetCommand = "OFF";      
let currentReportedState = "STANDBY";  
let lastNotifiedState = "";     
let targetUserId = "";          

function getThaiTimestamp() {
  return new Date().toLocaleString('th-TH', { 
    timeZone: 'Asia/Bangkok', 
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// 📌 จัดการการเชื่อมต่อผ่านท่อตรง WebSockets (บอร์ด ESP32 จะมาเกาะตรงนี้)
wss.on('connection', (ws) => {
  console.log('🔌 [WS Connected] บอร์ดฮาร์ดแวร์เจาะท่อตรงสำเร็จ');
  
  // ส่งคำสั่งล่าสุดให้บอร์ดทันทีที่เชื่อมต่อ
  ws.send(JSON.stringify({ command: targetCommand }));

  // รอรับข้อมูลรายงานสถานะจากบอร์ด
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.state) {
        currentReportedState = data.state;
        const timestamp = getThaiTimestamp();

        // ตรวจสอบเพื่อยิงแจ้งเตือนเข้า LINE
        if (targetUserId && currentReportedState !== lastNotifiedState) {
          lastNotifiedState = currentReportedState;

          let msgText = "";
          if (currentReportedState === "RUNNING") {
            msgText = `🟢 [HARDWARE CONFIRMED]\n----------------------------------\n• ระบบ: มอเตอร์เดินเครื่องสำเร็จ\n• สถานะปัจจุบัน: RUNNING\n• เวลาบันทึก: ${timestamp}`;
          } else if (currentReportedState === "STANDBY") {
            msgText = `🟡 [HARDWARE CONFIRMED]\n----------------------------------\n• ระบบ: มอเตอร์หยุดทำงานปกติ\n• สถานะปัจจุบัน: STANDBY\n• เวลาบันทึก: ${timestamp}`;
          } else if (currentReportedState === "FAULT") {
            msgText = `🚨 [CRITICAL ALERT: FAULT]\n----------------------------------\n• ตู้ควบคุมเกิดเหตุขัดข้องร้ายแรง\n• สถานะปัจจุบัน: SYSTEM TRIP / FAULT\n• เวลาตรวจพบ: ${timestamp}`;
          }

          client.pushMessage(targetUserId, { type: 'text', text: msgText })
            .catch((err) => console.error('LINE Push Error:', err));
        }
      }
    } catch (e) {
      console.error("WS Message Error", e);
    }
  });

  // ส่งคำสั่งเปิด-ปิดไปหาบอร์ดทุกๆ 1.5 วินาทีผ่านท่อเดิมโดยไม่ต้อง Reconnect
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: targetCommand }));
    }
  }, 1500);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('❌ [WS Disconnected] ท่อส่งข้อมูลบอร์ดหลุดออก');
  });
});

app.get('/', (req, res) => {
  res.send(`🤖 WS TELEMETRY SERVER ACTIVE | ${getThaiTimestamp()}`);
});

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
          replyText = `❌ [COMMAND DENIED]\n• ตู้ติดสถานะ FAULT ไม่สามารถเปิดได้\n• เวลา: ${timestamp}`;
        } else {
          targetCommand = "ON";
          replyText = `📥 [COMMAND ACKNOWLEDGED]\n• คำสั่ง: สั่งเปิดระบบ (MOTOR ON)\n• เวลา: ${timestamp}\n\n*(ระบบจะยืนยันเมื่อบอร์ดตอบรับ)*`;
        }
      } else if (userText === "ปิด") {
        targetCommand = "OFF";
        replyText = `📥 [COMMAND ACKNOWLEDGED]\n• คำสั่ง: สั่งปิดระบบ (MOTOR OFF)\n• เวลา: ${timestamp}\n\n*(ระบบจะยืนยันเมื่อบอร์ดตอบรับ)*`;
      } else if (userText === "เช็คสถานะ") {
        let stateIndicator = currentReportedState === "RUNNING" ? "🟢 RUNNING" : (currentReportedState === "FAULT" ? "🚨 FAULT" : "🟡 STANDBY");
        replyText = `📊 [SYSTEM REPORT]\n• เวลาสแกน: ${timestamp}\n• สถานะตู้จริง: ${stateIndicator}\n• คำสั่งล่าสุด: ${targetCommand}`;
      } else {
        replyText = `🤖 พิมพ์ 'เปิด', 'ปิด' หรือ 'เช็คสถานะ'`;
      }

      client.replyMessage(event.replyToken, { type: 'text', text: replyText })
        .catch((err) => console.error('Reply Error:', err));
    }
  });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebSockets Telemetry Server Active on Port ${PORT}`));
