const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// ================= LINE =================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

let targetUserId = null;

// ================= STATE =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: Date.now(),
    isOffline: false
};

let motorCommand = "NONE";

// ================= OFFLINE CHECK =================
setInterval(() => {

    const timeout = 15000;

    if (!motorData.isOffline &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.isOffline = true;

        if (targetUserId) {
            client.pushMessage(targetUserId, {
                type: 'text',
                text: "❌ ESP32 OFFLINE\nไม่มี heartbeat เกิน 15 วินาที"
            });
        }
    }

}, 5000);

// ================= REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    if (!state) return res.sendStatus(200);

    const old = motorData.state;

    motorData.state = state;

    // ⭐ HEARTBEAT ทุก packet
    motorData.lastHeartbeat = Date.now();
    motorData.isOffline = false;

    if (targetUserId && state !== old) {

        let msg = "";

        if (state === "RUNNING") msg = "⚙️ มอเตอร์ทำงานแล้ว";
        if (state === "STANDBY") msg = "🛑 มอเตอร์หยุดแล้ว";
        if (state === "FAULT") msg = "⚠️ FAULT";

        client.pushMessage(targetUserId, {
            type: 'text',
            text: msg
        });
    }

    res.sendStatus(200);
});

// ================= COMMAND =================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    res.json({ command: cmd });

    if (cmd !== "NONE") {
        motorCommand = "NONE";
    }
});

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        if (event.source?.userId) {
            targetUserId = event.source.userId;
        }

        const text = event.message?.text?.trim();

        if (text === "เปิด") {

            if (motorData.isOffline)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ESP32 OFFLINE"
                });

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "⚙️ สั่งเปิดแล้ว"
            });
        }

        if (text === "ปิด") {

            if (motorData.isOffline)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ESP32 OFFLINE"
                });

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "🛑 สั่งปิดแล้ว"
            });
        }

        if (text === "สถานะ") {

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`📊 ${motorData.state}
${motorData.isOffline ? "OFFLINE" : "ONLINE"}`
            });
        }
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("RUNNING");
});
