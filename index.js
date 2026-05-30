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
    state: "STANDBY",
    lastUpdate: Date.now(),
    isOffline: false
};

let motorCommand = "OFF";
let targetUserId = process.env.USER_ID || null;

// ฟังก์ชันส่งข้อความ LINE แบบ Helper
async function notifyLine(message) {
    if (targetUserId) {
        try {
            await client.pushMessage(targetUserId, { type: 'text', text: `⚠️ ${message}` });
        } catch (err) { console.error("Line Error:", err); }
    }
}

// Watchdog: เช็คทุก 5 วินาที ถ้าไม่ได้รับ Report เกิน 30 วินาที ให้แจ้งเตือนว่าออฟไลน์
setInterval(() => {
    const timeout = 30000; // 30 วินาที
    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {
        motorData.isOffline = true;
        notifyLine("แจ้งเตือน: อุปกรณ์ไม่ตอบสนอง (Disconnected)!");
    }
}, 5000);

// API รับ Report จาก ESP32
app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    motorData.lastUpdate = Date.now();
    
    // ถ้าเคยออฟไลน์ แล้วกลับมาออนไลน์
    if (motorData.isOffline) {
        motorData.isOffline = false;
        notifyLine("อุปกรณ์กลับมาออนไลน์แล้ว");
    }

    // แจ้งเตือนถ้าสถานะเป็น FAULT
    if (state === "FAULT" && motorData.state !== "FAULT") {
        notifyLine("แจ้งเตือน: ตรวจพบสภาวะ FAULT!");
    }

    motorData.state = state;
    console.log(`[Report] ${new Date().toLocaleString()} - State: ${state}`);
    res.sendStatus(200);
});

// API ตรวจสอบสถานะ (สำหรับหน้าเว็บหรือตรวจสอบสถานะ)
app.get('/api/motor/status', (req, res) => {
    res.json({
        ...motorData,
        lastUpdateReadable: new Date(motorData.lastUpdate).toLocaleString('th-TH')
    });
});

// API คำสั่ง (เดิม)
app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

app.post('/webhook', (req, res) => {
    req.body.events.forEach(event => {
        if (event.source.userId) targetUserId = event.source.userId;
        if (event.type === 'message' && event.message.text) {
            const text = event.message.text.trim();
            if (text === "เปิด") motorCommand = "ON";
            else if (text === "ปิด") motorCommand = "OFF";
            else if (text === "สถานะ") {
                client.replyMessage(event.replyToken, {
                    type: 'text', 
                    text: `สถานะปัจจุบัน: ${motorData.state}\nอัปเดตเมื่อ: ${new Date(motorData.lastUpdate).toLocaleString('th-TH')}`
                });
                return;
            }
            client.replyMessage(event.replyToken, {type: 'text', text: `รับคำสั่ง: ${text}`});
        }
    });
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`)); 
