const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || 'YOUR_SECRET'
};
const client = new Client(config);

let targetCommand = "OFF";     
let motorState = "STANDBY";    
let targetUserId = "";         
let lastNotifiedState = "";    
let lastNotificationTime = 0;  

app.get('/', (req, res) => {
  res.send(`🟢 Server Alive | State: ${motorState} | Command: ${targetCommand}`);
});

app.get('/api/motor/command', (req, res) => {
  res.json({ command: targetCommand });
});

// 📌 ระบบรับรายงานจากบอร์ด ESP32
app.post('/api/motor/report', (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).send("Invalid State Data");

  motorState = state;
  console.log(`[ESP32] State: ${motorState}`);

  const now = Date.now();
  
  // 🛡️ ระบบส่งแจ้งเตือนเข้าไลน์อัตโนมัติ (ใช้ Push Message ที่มีโควตา 500 ข้อความ)
  if (motorState !== lastNotifiedState && targetUserId && (now - lastNotificationTime > 3000)) {
    lastNotifiedState = motorState; 
    lastNotificationTime = now; 

    let alertText = "";
    if (motorState === "RUNNING") alertText = "🟢 มอเตอร์เริ่มทำงานแล้ว (RUNNING)";
    if (motorState === "STANDBY") alertText = "🟡 มอเตอร์หยุดทำงาน/สแตนบาย (STANDBY)";
    if (motorState === "FAULT") alertText = "🚨 ตู้ควบคุมเกิดเหตุขัดข้อง! ระบบติดสถานะ FAULT";

    client.pushMessage(targetUserId, { type: 'text', text: alertText })
      .then(() => console.log(`[LINE Push Success]: ${motorState}`))
      .catch((err) => {
        // 💡 ถ้าโควตาข้อความหมด หรือเกิด Error ตัวหนังสือจะฟ้องตรงนี้ใน Render Logs ครับ
        console.error('❌ [LINE Push Failed] อาจเกิดจากโควตาข้อความฟรี 500 ข้อความหมดลงแล้ว:', err.message);
      });
  }

  res.json({ status: "success", serverState: motorState });
});

// 📌 ระบบโต้ตอบในไลน์ (ใช้ Reply Message - ฟรี 100% ไม่มีวันหมดโควตา)
app.post('/webhook', (req, res) => {
  const events = req.body.events;
  
  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      targetUserId = event.source.userId; 
      const userText = event.message.text.trim();
      let replyText = "";

      if (userText === "เปิด") {
        if (motorState === "FAULT") {
          replyText = "❌ ไม่สามารถเปิดได้! เนื่องจากระบบที่ตู้ควบคุมติดสถานะ FAULT อยู่";
        } else {
          targetCommand = "ON";
          // 💡 ปรับปรุงข้อความตอบกลับให้ชัดเจนและแนะนำวิธีเช็คสถานะแบบฟรีๆ
          replyText = "⏳ ส่งคำสั่ง [เปิดมอเตอร์] ไปยังตู้ควบคุมแล้วครับ!\n\n*(เนื่องจากระบบจำกัดข้อความแจ้งเตือนอัตโนมัติ หากไฟเขียวที่ตู้ติดแล้วไลน์ไม่เด้งบอก คุณสามารถพิมพ์คำว่า 'เช็คสถานะ' เพื่ออัปเดตระบบได้ฟรีตลอดเวลาครับ)*";
        }
      } 
      else if (userText === "ปิด") {
        targetCommand = "OFF";
        replyText = "⏳ ส่งคำสั่ง [ปิดมอเตอร์] ไปยังตู้ควบคุมแล้วครับ!\n\n*(คุณสามารถพิมพ์คำว่า 'เช็คสถานะ' เพื่อดูการหยุดทำงานจริงของตู้ได้ฟรีตลอดเวลาครับ)*";
      } 
      else if (userText === "เช็คสถานะ") {
        let stateEmoji = motorState === "RUNNING" ? "🟢" : (motorState === "FAULT" ? "🚨" : "🟡");
        replyText = `📊 [อัปเดตสถานะตู้ควบคุมจริง]\n• สถานะฮาร์ดแวร์: ${stateEmoji} ${motorState}\n• คำสั่งสวิตช์ล่าสุด: ${targetCommand}`;
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
  console.log(`🚀 Server Running`);
});
