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

async function notifyLine(message) {
    if (targetUserId) {
        const timeNow = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' });
        try {
            await client.pushMessage(targetUserId, { 
                type: 'text', 
                text: `🔔 [ระบบมอเตอร์ - ${timeNow}]:\n${message}` 
            });
        } catch (err) { console.error("Line Push Error:", err); }
    }
}

const guideMessage = `🤖 ยินดีต้อนรับสู่ระบบควบคุมมอเตอร์อัจฉริยะ

📋 คำสั่งที่ใช้งานได้:
- 【เปิด】 : สั่งเปิดมอเตอร์
- 【ปิด】 : สั่งปิดมอเตอร์
- 【สถานะ】 : ตรวจสอบสถานะมอเตอร์และการเชื่อมต่อ
- 【แนะนำ】 : เรียกดูคู่มือการใช้งาน

⚠️ หากพบสภาวะ FAULT โปรดตรวจสอบอุปกรณ์ทันที!`;

// Watchdog: ตรวจสอบสถานะการเชื่อมต่อ (ทำงานเงียบๆ ไม่ Push ข้อความ)
setInterval(() => {
    const timeout = 30000;
    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {
        motorData.isOffline = true; // แค่บันทึกสถานะว่า Offline แต่ไม่แจ้งเตือน
    }
}, 5000);

// API รับ Report จาก ESP32
app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    
    // บันทึกว่ากลับมาออนไลน์
    if (motorData.isOffline) {
        motorData.isOffline = false; 
    }

    if (state !== motorData.state) {
        motorData.state = state;
        motorData.lastChangeTime = Date.now();

        if (state === "FAULT") {
            notifyLine("⚠️ แจ้งเตือน: พบสภาวะ FAULT! โปรดเข้าตรวจสอบอุปกรณ์ทันที");
        } else {
            notifyLine(`สถานะการทำงานเปลี่ยนเป็น: ${state}`);
        }
    }

    motorData.lastUpdate = Date.now();
    res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const events = req.body.events;
    
    for (const event of events) {
        if (event.source.userId) targetUserId = event.source.userId;
        
        if (event.type === 'follow') {
            await client.replyMessage(event.replyToken, { type: 'text', text: guideMessage });
        }
        
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
                const options = { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' };
                const lastChangeStr = new Date(motorData.lastChangeTime).toLocaleString('th-TH', options);
                const lastUpdateStr = new Date(motorData.lastUpdate).toLocaleString('th-TH', options);
                
                let motorDisplay = "";
                if(motorData.state === "RUNNING") motorDisplay = "⚙️ กำลังทำงาน (ON)";
                else if(motorData.state === "FAULT") motorDisplay = "⚠️ ขัดข้อง (FAULT)";
                else motorDisplay = "🛑 หยุดทำงาน (STANDBY)";

                // เปลี่ยนข้อความแสดงสถานะการเชื่อมต่อ
                let connectDisplay = motorData.isOffline 
                    ? "❌ อุปกรณ์ขาดการเชื่อมต่อ (โปรดตรวจสอบ)" 
                    : "✅ ระบบเตรียมพร้อมใช้งาน";

                await client.replyMessage(replyToken, {
                    type: 'text', 
                    text: `📊 รายงานสถานะระบบ\n\n` +
                          `มอเตอร์: ${motorDisplay}\n` +
                          `การเชื่อมต่อ: ${connectDisplay}\n\n` +
                          `เปลี่ยนสถานะเมื่อ: ${lastChangeStr}\n` +
                          `อัปเดตล่าสุด: ${lastUpdateStr}`
                });
            } 
            else if (text === "แนะนำ" || text === "คู่มือ") {
                await client.replyMessage(replyToken, { type: 'text', text: guideMessage });
            }
            else {
                await client.replyMessage(replyToken, { 
                    type: 'text', 
                    text: `⚠️ ไม่เข้าใจคำสั่ง: "${text}"\nพิมพ์ "แนะนำ" เพื่อดูวิธีใช้งาน` 
                });
            }
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
