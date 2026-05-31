const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

let targetUserId = process.env.USER_ID || null;

// =========================
// สถานะมอเตอร์
// =========================
let motorData = {
    state: "STANDBY",
    lastUpdate: Date.now(),
    isOffline: false
};

let motorCommand = "OFF";

// =========================
// เวลาไทย
// =========================
function thaiTime() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// =========================
// ส่งข้อความ LINE
// =========================
async function notifyLine(message) {
    if (!targetUserId) return;

    try {
        await client.pushMessage(targetUserId, {
            type: 'text',
            text:
`📅 ${thaiTime()}

${message}`
        });
    } catch (err) {
        console.error("LINE ERROR:", err);
    }
}

// =========================
// ตรวจสอบ Offline
// =========================
setInterval(() => {

    const timeout = 30000; // 30 วินาที

    if (
        !motorData.isOffline &&
        (Date.now() - motorData.lastUpdate > timeout)
    ) {

        motorData.isOffline = true;

        notifyLine(
`❌ แจ้งเตือนระบบ

อุปกรณ์ขาดการเชื่อมต่อ
ไม่ได้รับข้อมูลเกิน 30 วินาที`
        );
    }

}, 5000);

// =========================
// API รับสถานะจาก ESP32
// =========================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    // กลับมาออนไลน์
    if (motorData.isOffline) {

        motorData.isOffline = false;

        notifyLine(
`✅ ระบบกลับมาออนไลน์แล้ว

อุปกรณ์เชื่อมต่อปกติ`
        );
    }

    // ถ้าสถานะเปลี่ยน
    if (state !== motorData.state) {

        motorData.state = state;

        // =========================
        // แจ้งเตือนตามสถานะ
        // =========================

        if (state === "RUNNING") {

            notifyLine(
`⚙️ มอเตอร์เริ่มทำงานแล้ว

สถานะ: RUNNING`
            );

        } else if (state === "STANDBY") {

            notifyLine(
`🛑 มอเตอร์หยุดทำงานแล้ว

สถานะ: STANDBY`
            );

        } else if (state === "FAULT") {

            notifyLine(
`⚠️ พบความผิดปกติของระบบ

สถานะ: FAULT
กรุณาตรวจสอบอุปกรณ์ทันที`
            );
        }
    }

    motorData.lastUpdate = Date.now();

    res.sendStatus(200);
});

// =========================
// ESP32 ดึงคำสั่ง
// =========================
app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

// =========================
// LINE WEBHOOK
// =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    const events = req.body.events;

    for (const event of events) {

        // จำ USER ID
        if (event.source.userId) {
            targetUserId = event.source.userId;
        }

        // เพิ่มเพื่อน
        if (event.type === 'follow') {

            await client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`🤖 ระบบควบคุมมอเตอร์พร้อมใช้งาน

คำสั่ง:
เปิด
ปิด
สถานะ`
            });
        }

        // รับข้อความ
        if (
            event.type === 'message' &&
            event.message.type === 'text'
        ) {

            const text = event.message.text.trim();

            // =========================
            // เปิดมอเตอร์
            // =========================
            if (text === "เปิด") {

                motorCommand = "ON";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`✅ ส่งคำสั่งเปิดมอเตอร์แล้ว`
                });

                notifyLine(
`🟢 มีการสั่งเปิดมอเตอร์

คำสั่งถูกส่งไปยังอุปกรณ์แล้ว`
                );
            }

            // =========================
            // ปิดมอเตอร์
            // =========================
            else if (text === "ปิด") {

                motorCommand = "OFF";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`✅ ส่งคำสั่งปิดมอเตอร์แล้ว`
                });

                notifyLine(
`🔴 มีการสั่งปิดมอเตอร์

คำสั่งถูกส่งไปยังอุปกรณ์แล้ว`
                );
            }

            // =========================
            // ดูสถานะ
            // =========================
            else if (text === "สถานะ") {

                let motorStatus = "";

                if (motorData.state === "RUNNING") {
                    motorStatus = "⚙️ RUNNING";
                }
                else if (motorData.state === "FAULT") {
                    motorStatus = "⚠️ FAULT";
                }
                else {
                    motorStatus = "🛑 STANDBY";
                }

                let onlineStatus = motorData.isOffline
                    ? "❌ OFFLINE"
                    : "✅ ONLINE";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`📊 สถานะระบบ

มอเตอร์: ${motorStatus}
การเชื่อมต่อ: ${onlineStatus}

อัปเดตล่าสุด:
${thaiTime()}`
                });
            }
        }
    }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
