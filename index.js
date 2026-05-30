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

// ปรับแก้เฉพาะใน Webhook เพื่อให้การตอบกลับเสถียรที่สุด
app.post('/webhook', async (req, res) => { // ใส่ async
    const events = req.body.events;
    
    // ส่ง 200 กลับไปให้ LINE ทันทีที่รับ Event (เพื่อไม่ให้ LINE มองว่า Server เราช้า)
    res.sendStatus(200);

    for (const event of events) {
        if (event.source.userId) targetUserId = event.source.userId;
        
        if (event.type === 'message' && event.message.text) {
            const text = event.message.text.trim();
            const replyToken = event.replyToken;

            if (text === "เปิด") {
                motorCommand = "ON";
                await client.replyMessage(replyToken, { type: 'text', text: "✅ สั่งเปิดมอเตอร์เรียบร้อย" });
            } 
            else if (text === "ปิด") {
                motorCommand = "OFF";
                await client.replyMessage(replyToken, { type: 'text', text: "🛑 สั่งปิดมอเตอร์เรียบร้อย" });
            } 
            else if (text === "สถานะ") {
                const lastChangeStr = new Date(motorData.lastChangeTime).toLocaleTimeString('th-TH');
                const lastUpdateStr = new Date(motorData.lastUpdate).toLocaleTimeString('th-TH');
                await client.replyMessage(replyToken, {
                    type: 'text', 
                    text: `📊 สถานะ: ${motorData.state}\nเปลี่ยนล่าสุด: ${lastChangeStr}\nอัปเดตล่าสุด: ${lastUpdateStr}${motorData.isOffline ? '\n❌ อุปกรณ์สถานะ: ออฟไลน์' : '\n✅ อุปกรณ์สถานะ: ออนไลน์'}`
                });
            } 
            else {
                await client.replyMessage(replyToken, { 
                    type: 'text', 
                    text: `⚠️ ไม่เข้าใจคำสั่ง: "${text}"` 
                });
            }
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
