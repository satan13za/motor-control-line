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
    } else {
        console.warn("Cannot notify: targetUserId is not set yet.");
    }
}

// *** เพิ่มฟังก์ชันนี้เข้าไปครับ ***
async function verifyCommand(targetState, successMsg, failMsg) {
    console.log(`Verifying command, waiting for ESP32...`);
    await new Promise(resolve => setTimeout(resolve, 8000)); // รอ 8 วินาทีเพื่อให้ ESP32 ส่ง Report
    
    if (motorData.state === targetState) {
        notifyLine(successMsg);
    } else {
        if (motorData.isOffline) {
            notifyLine("❌ สั่งงานไม่สำเร็จ: อุปกรณ์ออฟไลน์อยู่");
        } else {
            notifyLine(failMsg);
        }
    }
}

const guideMessage = `🤖 ยินดีต้อนรับสู่ระบบควบคุมมอเตอร์อัจฉริยะ

📋 คำสั่งที่ใช้งานได้:
- 【เปิด】 : สั่งเปิดมอเตอร์
- 【ปิด】 : สั่งปิดมอเตอร์
- 【สถานะ】 : ตรวจสอบสถานะมอเตอร์และการเชื่อมต่อ
- 【แนะนำ】 : เรียกดูคู่มือการใช้งาน

⚠️ หากพบสภาวะ FAULT โปรดตรวจสอบอุปกรณ์ทันที!`;

// Watchdog: ตรวจสอบสถานะการเชื่อมต่อ
setInterval(() => {
    const timeout = 30000;
    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {
        motorData.isOffline = true;
        notifyLine("❌ อุปกรณ์ขาดการเชื่อมต่อ! (ไม่ได้รับข้อมูลเกิน 30 วินาที)");
    }
}, 5000);

// API รับ Report จาก ESP32
app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    
    if (motorData.isOffline) {
        motorData.isOffline = false; 
        notifyLine("✅ อุปกรณ์กลับมาออนไลน์และเชื่อมต่อปกติแล้ว");
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
                await client.replyMessage(replyToken, { type: 'text', text: "⏳ กำลังส่งคำสั่งเปิดมอเตอร์..." });
                verifyCommand("RUNNING", "✅ มอเตอร์เปิดทำงานเรียบร้อย", "❌ แจ้งเตือน: เปิดมอเตอร์ไม่สำเร็จ (กรุณาตรวจสอบอุปกรณ์)");
            } 
            else if (text === "ปิด") {
                motorCommand = "OFF";
                await client.replyMessage(replyToken, { type: 'text', text: "⏳ กำลังส่งคำสั่งปิดมอเตอร์..." });
                verifyCommand("STANDBY", "🛑 มอเตอร์ปิดทำงานเรียบร้อย", "❌ แจ้งเตือน: ปิดมอเตอร์ไม่สำเร็จ (กรุณาตรวจสอบอุปกรณ์)");
            } 
            else if (text === "สถานะ") {
                const options = { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' };
                const lastChangeStr = new Date(motorData.lastChangeTime).toLocaleString('th-TH', options);
                const lastUpdateStr = new Date(motorData.lastUpdate).toLocaleString('th-TH', options);
                
                let motorDisplay = "";
                if(motorData.state === "RUNNING") motorDisplay = "⚙️ กำลังทำงาน (ON)";
                else if(motorData.state === "FAULT") motorDisplay = "⚠️ ขัดข้อง (FAULT)";
                else motorDisplay = "🛑 หยุดทำงาน (STANDBY)";

                let connectDisplay = motorData.isOffline 
                    ? "❌ อุปกรณ์ออฟไลน์ (ไม่มีสัญญาณ)" 
                    : "✅ พร้อมใช้งาน (ออนไลน์ปกติ)";

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
        }
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
