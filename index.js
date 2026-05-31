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

// เริ่มต้นเป็น NONE
let motorCommand = "NONE";

// =========================
// คู่มือ
// =========================
const guideMessage =
`🤖 ระบบควบคุมมอเตอร์

📌 คำสั่งที่ใช้งานได้

🟢 เปิด
→ สั่งเปิดมอเตอร์

🔴 ปิด
→ สั่งหยุดมอเตอร์

📊 สถานะ
→ ตรวจสอบสถานะระบบ

⚠️ ระบบจะแจ้งเตือนอัตโนมัติเมื่อ:
- อุปกรณ์ Offline
- เกิด FAULT
- มอเตอร์เริ่ม/หยุดทำงาน`;

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

    const timeout = 30000;

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

    // ออนไลน์กลับมา
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
        // แจ้งสถานะมอเตอร์
        // =========================

        if (state === "RUNNING") {

            notifyLine(
`⚙️ มอเตอร์เริ่มทำงานแล้ว

สถานะ: RUNNING`
            );

        }
        else if (state === "STANDBY") {

            notifyLine(
`🛑 มอเตอร์หยุดทำงานแล้ว

สถานะ: STANDBY`
            );

        }
        else if (state === "FAULT") {

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

    // เก็บคำสั่งปัจจุบัน
    const currentCommand = motorCommand;

    // ส่งกลับให้ ESP32
    res.json({
        command: currentCommand
    });

    // ล้างคำสั่งหลังส่ง
    motorCommand = "NONE";

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
                text: guideMessage
            });
        }

        // =========================
        // รับข้อความ
        // =========================
        if (
            event.type === 'message' &&
            event.message.type === 'text'
        ) {

            const text = event.message.text.trim();

            // =========================
            // เปิดมอเตอร์
            // =========================
            if (text === "เปิด") {

                // ถ้าเปิดอยู่แล้ว
                if (motorData.state === "RUNNING") {

                    await client.replyMessage(event.replyToken, {
                        type: 'text',
                        text:
`⚠️ มอเตอร์กำลังทำงานอยู่แล้ว`
                    });

                    continue;
                }

                motorCommand = "ON";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`⏳ กำลังส่งคำสั่งเปิดมอเตอร์...`
                });
            }

            // =========================
            // ปิดมอเตอร์
            // =========================
            else if (text === "ปิด") {

                // ถ้าปิดอยู่แล้ว
                if (motorData.state === "STANDBY") {

                    await client.replyMessage(event.replyToken, {
                        type: 'text',
                        text:
`⚠️ มอเตอร์หยุดทำงานอยู่แล้ว`
                    });

                    continue;
                }

                motorCommand = "OFF";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`⏳ กำลังส่งคำสั่งปิดมอเตอร์...`
                });
            }

            // =========================
            // สถานะ
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

            // =========================
            // คำสั่งอื่น
            // =========================
            else {

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`❌ ไม่พบคำสั่งที่พิมพ์

${guideMessage}`
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
