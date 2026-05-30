const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const client = new Client({ 
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, 
    channelSecret: process.env.CHANNEL_SECRET 
});

// เก็บสถานะแบบละเอียด
let motorData = {
    state: "STANDBY",           // สถานะปัจจุบัน: RUNNING, STANDBY, FAULT
    lastUpdate: Date.now(),      // เวลาที่ ESP32 ติดต่อล่าสุด
    lastChangeTime: Date.now(),  // เวลาที่เปลี่ยนสถานะล่าสุด
    isOffline: false             // สถานะการเชื่อมต่อ
};

let motorCommand = "OFF";
let targetUserId = process.env.USER_ID || null;

// ฟังก์ชันแจ้งเตือนเข้า LINE
async function notifyLine(message) {
    if (targetUserId) {
        try {
            await client.pushMessage(targetUserId, { type: 'text', text: `🔔 [ระบบมอเตอร์]: ${message}` });
        } catch (err) { console.error("Line Push Error:", err); }
    }
}

// Watchdog: ตรวจสอบสถานะการเชื่อมต่อทุก 5 วินาที
setInterval(() => {
    const timeout = 30000; // 30 วินาที
    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {
        motorData.isOffline = true;
        notifyLine("⚠️ อุปกรณ์ขาดการเชื่อมต่อ! (ไม่ได้รับข้อมูลเกิน 30 วินาที)");
    }
}, 5000);

// API รับ Report จาก ESP32
app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    
    // ตรวจสอบสถานะว่ามีการเปลี่ยนหรือไม่
    if (state !== motorData.state) {
        motorData.state = state;
        motorData.lastChangeTime = Date.now();
        notifyLine(`สถานะเปลี่ยนเป็น: ${state}`);
    }

    // ถ้าเครื่องเคย offline แล้วกลับมาออนไลน์
    if (motorData.isOffline) {
        motorData.isOffline = false;
        notifyLine("✅ อุปกรณ์กลับมาออนไลน์แล้ว");
    }

    motorData.lastUpdate = Date.now();
    res.sendStatus(200);
});

// API คำสั่ง (ESP32 ดึงข้อมูล)
app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

// Webhook สำหรับ LINE Bot
app.post('/webhook', (req, res) => {
    req.body.events.forEach(event => {
        if (event.source.userId) targetUserId = event.source.userId;
        
        if (event.type === 'message' && event.message.text) {
            const text = event.message.text.trim();
            const replyToken = event.replyToken;

            if (text === "เปิด") {
                motorCommand = "ON";
                client.replyMessage(replyToken, { type: 'text', text: "✅ สั่งเปิดมอเตอร์เรียบร้อย" });
            } 
            else if (text === "ปิด") {
                motorCommand = "OFF";
                client.replyMessage(replyToken, { type: 'text', text: "🛑 สั่งปิดมอเตอร์เรียบร้อย" });
            } 
            else if (text === "สถานะ") {
                const lastChangeStr = new Date(motorData.lastChangeTime).toLocaleTimeString('th-TH');
                const lastUpdateStr = new Date(motorData.lastUpdate).toLocaleTimeString('th-TH');
                client.replyMessage(replyToken, {
                    type: 'text', 
                    text: `📊 สถานะ: ${motorData.state}\nเปลี่ยนสถานะล่าสุด: ${lastChangeStr}\nได้รับข้อมูลล่าสุด: ${lastUpdateStr}${motorData.isOffline ? '\n❌ อุปกรณ์สถานะ: ออฟไลน์' : '\n✅ อุปกรณ์สถานะ: ออนไลน์'}`
                });
            } 
            else {
                // กรณีพิมพ์คำสั่งไม่ถูก
                client.replyMessage(replyToken, { 
                    type: 'text', 
                    text: `⚠️ ไม่เข้าใจคำสั่ง: "${text}"\nคำสั่งที่ใช้ได้คือ:\n- เปิด\n- ปิด\n- สถานะ` 
                });
            }
        }
    });
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
