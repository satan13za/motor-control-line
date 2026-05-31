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
    lastUpdate: Date.now(),
    isOffline: false
};

let motorCommand = "NONE";
let lastCommandTime = 0;

// ========================= TIMEOUT CHECK =========================
setInterval(() => {

    const timeout = 15000;

    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {

        motorData.isOffline = true;

        if (targetUserId) {
            client.pushMessage(targetUserId, {
                type: 'text',
                text: "❌ ESP32 OFFLINE\nระบบไม่ตอบสนอง"
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
                    text: "❌ ระบบไม่พร้อม (ESP32 OFFLINE)"
                });
            }

            motorCommand = "ON";
            lastCommandTime = Date.now();

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "⚙️ ส่งคำสั่งเปิด...\nรอผลจาก ESP32"
            });
        }

        // ========================= CLOSE =========================
        else if (text === "ปิด") {

            if (!systemReady) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ระบบไม่พร้อม (ESP32 OFFLINE)"
                });
            }

            motorCommand = "OFF";
            lastCommandTime = Date.now();

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "🛑 ส่งคำสั่งปิด...\nรอผลจาก ESP32"
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
เวลา: ${new Date(motorData.lastUpdate).toLocaleString()}`
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
    motorData.lastUpdate = Date.now();
    motorData.isOffline = false;

    // ========================= แจ้งเฉพาะเปลี่ยนจริง =========================
    if (targetUserId && state !== oldState) {

        let msg = "";

        if (state === "RUNNING") msg = "⚙️ มอเตอร์ทำงานแล้ว (SUCCESS)";
        else if (state === "STANDBY") msg = "🛑 มอเตอร์หยุดแล้ว (SUCCESS)";
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

    // ล้าง command หลังส่ง
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
