const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const client = new Client({ 
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, 
    channelSecret: process.env.CHANNEL_SECRET 
});

let motorData = {
    state: "STANDBY",           
    lastUpdate: Date.now(),      
    lastChangeTime: Date.now(),  
    isOffline: false             
};

let motorCommand = "OFF";
let targetUserId = process.env.USER_ID || null;

// ฟังก์ชันแจ้งเตือนเข้า LINE (บังคับเป็นเวลาไทย)
async function notifyLine(message) {
    if (targetUserId) {
        // เพิ่ม timeZone: 'Asia/Bangkok' เพื่อให้เป็นเวลาไทย
        const timeNow = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' });
        try {
            await client.pushMessage(targetUserId, { 
                type: 'text', 
                text: `🔔 [ระบบมอเตอร์ - ${timeNow}]:\n${message}` 
            });
        } catch (err) { console.error("Line Push Error:", err); }
    }
}

// Watchdog: ตรวจสอบสถานะการเชื่อมต่อ
setInterval(() => {
    const timeout = 30000;
    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {
        motorData.isOffline = true;
        notifyLine("⚠️ แจ้งเตือน: อุปกรณ์ขาดการเชื่อมต่อ (ไม่ได้รับข้อมูลเกิน 30 วินาที)");
    }
}, 5000);

// API รับ Report จาก ESP32
app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    
    if (state !== motorData.state) {
        motorData.state = state;
        motorData.lastChangeTime = Date.now();

        if (state === "FAULT") {
            notifyLine("⚠️ แจ้งเตือน: พบสภาวะ FAULT! โปรดเข้าตรวจสอบอุปกรณ์ทันที");
        } else {
            notifyLine(`สถานะการทำงานเปลี่ยนเป็น: ${state}`);
        }
    }

    if (motorData.isOffline) {
        motorData.isOffline = false;
        notifyLine("✅ อุปกรณ์กลับมาออนไลน์แล้ว");
    }

    motorData.lastUpdate = Date.now();
    res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

// Webhook สำหรับ LINE Bot
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const events = req.body.events;
    
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
                // บังคับ TimeZone เป็น Asia/Bangkok
                const options = { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' };
                const lastChangeStr = new Date(motorData.lastChangeTime).toLocaleString('th-TH', options);
                const lastUpdateStr = new Date(motorData.lastUpdate).toLocaleString('th-TH', options);
                
                let motorDisplay = "";
                if(motorData.state === "RUNNING") motorDisplay = "⚙️ กำลังทำงาน (ON)";
                else if(motorData.state === "FAULT") motorDisplay = "⚠️ ขัดข้อง (FAULT)";
                else motorDisplay = "🛑 หยุดทำงาน (STANDBY)";

                let connectDisplay = motorData.isOffline ? "❌ ออฟไลน์ (ไม่เชื่อมต่อ)" : "✅ ออนไลน์ (เชื่อมต่อปกติ)";

                await client.replyMessage(replyToken, {
                    type: 'text', 
                    text: `📊 รายงานสถานะระบบ\n\n` +
                          `มอเตอร์: ${motorDisplay}\n` +
                          `การเชื่อมต่อ: ${connectDisplay}\n\n` +
                          `เปลี่ยนสถานะเมื่อ: ${lastChangeStr}\n` +
                          `อัปเดตล่าสุด: ${lastUpdateStr}`
                });
            } 
            else {
                await client.replyMessage(replyToken, { 
                    type: 'text', 
                    text: `⚠️ ไม่เข้าใจคำสั่ง: "${text}"\nคำสั่งที่ใช้ได้คือ:\n- เปิด\n- ปิด\n- สถานะ` 
                });
            }
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
