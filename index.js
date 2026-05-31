const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// ========================= LINE =========================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

let targetUserId = null;

// ========================= STATE =========================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: Date.now(),
    isOffline: false
};

let motorCommand = "NONE";

// ========================= TIME (THAI) =========================
function thaiTime() {
    return new Date().toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok"
    });
}

// ========================= OFFLINE CHECK =========================
setInterval(() => {

    const timeout = 30000; // 30 sec (กัน false offline)

    if (!motorData.isOffline &&
        (Date.now() - motorData.lastHeartbeat > timeout)
    ) {

        motorData.isOffline = true;

        if (targetUserId) {
            client.pushMessage(targetUserId, {
                type: 'text',
                text: "❌ ESP32 OFFLINE\nไม่มีการตอบสนองเกิน 30 วินาที"
            });
        }
    }

}, 5000);

// ========================= HELP =========================
const helpText =
`🤖 ระบบควบคุมมอเตอร์

📌 คำสั่ง:
- เปิด
- ปิด
- สถานะ`;

// ========================= WEBHOOK =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    const events = req.body.events || [];

    for (const event of events) {

        if (!event || event.type !== 'message') continue;

        if (event.source?.userId) {
            targetUserId = event.source.userId;
        }

        const text = (event.message.text || "").trim();
        const systemReady = !motorData.isOffline;

        // ========================= OPEN =========================
        if (text === "เปิด") {

            if (!systemReady) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ระบบไม่พร้อมใช้งาน (ESP32 OFFLINE)"
                });
            }

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "⚙️ กำลังสั่งเปิดมอเตอร์...\nรอผลจาก ESP32"
            });
        }

        // ========================= CLOSE =========================
        else if (text === "ปิด") {

            if (!systemReady) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ระบบไม่พร้อมใช้งาน (ESP32 OFFLINE)"
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "🛑 กำลังสั่งปิดมอเตอร์...\nรอผลจาก ESP32"
            });
        }

        // ========================= STATUS =========================
        else if (text === "สถานะ") {

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`📊 สถานะระบบ

มอเตอร์: ${motorData.state}
ระบบ: ${motorData.isOffline ? "❌ OFFLINE" : "✅ ONLINE"}
เวลา: ${thaiTime()}`
            });
        }

        // ========================= HELP =========================
        else {

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: helpText
            });
        }
    }
});

// ========================= REPORT FROM ESP =========================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    const oldState = motorData.state;

    motorData.state = state;
    motorData.lastHeartbeat = Date.now();
    motorData.isOffline = false;

    // แจ้งเฉพาะเปลี่ยนสถานะจริง
    if (targetUserId && state !== oldState) {

        let msg = "";

        if (state === "RUNNING") msg = "⚙️ มอเตอร์ทำงานแล้ว";
        else if (state === "STANDBY") msg = "🛑 มอเตอร์หยุดแล้ว";
        else if (state === "FAULT") msg = "⚠️ FAULT DETECTED";

        client.pushMessage(targetUserId, {
            type: 'text',
            text: msg
        });
    }

    res.sendStatus(200);
});

// ========================= GET COMMAND =========================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    res.json({ command: cmd });

    // ล้าง command หลังส่ง (กันค้าง)
    if (cmd !== "NONE") {
        setTimeout(() => {
            motorCommand = "NONE";
        }, 500);
    }
});

// ========================= START =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("RUNNING ON PORT " + PORT);
});
