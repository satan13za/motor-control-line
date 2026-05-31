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

    res.json({
        command: motorCommand
    });

});

// =========================
// ตรวจสอบผลการทำงาน
// =========================
async function verifyMotor(targetState, successText, failText) {

    const maxCheck = 10;

    for (let i = 0; i < maxCheck; i++) {

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Offline
        if (motorData.isOffline) {

            await notifyLine(
`❌ อุปกรณ์ออฟไลน์

ไม่สามารถตรวจสอบสถานะได้`
            );

            return;
        }

        // สำเร็จ
        if (motorData.state === targetState) {

            await notifyLine(successText);

            return;
        }
    }

    // ไม่สำเร็จ
    await notifyLine(failText);
}

// =========================
// LINE WEBHOOK
// =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    const events = req.body.events;

    for (const event of events) {

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

                notifyLine(
`🟢 มีการสั่งเปิดมอเตอร์

ระบบกำลังตรวจสอบการทำงาน...`
                );

                // ตรวจสอบผล
                verifyMotor(
                    "RUNNING",
`✅ มอเตอร์เปิดทำงานสำเร็จ

สถานะปัจจุบัน: RUNNING`,
`❌ เปิดมอเตอร์ไม่สำเร็จ

กรุณาตรวจสอบอุปกรณ์`
                );
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

                notifyLine(
`🔴 มีการสั่งปิดมอเตอร์

ระบบกำลังตรวจสอบการทำงาน...`
                );

                // ตรวจสอบผล
                verifyMotor(
                    "STANDBY",
`🛑 มอเตอร์หยุดทำงานสำเร็จ

สถานะปัจจุบัน: STANDBY`,
`❌ ปิดมอเตอร์ไม่สำเร็จ

กรุณาตรวจสอบอุปกรณ์`
                );
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
