const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// =========================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

let targetUserId = process.env.USER_ID || null;

// =========================
let motorData = {
    state: "STANDBY",
    lastUpdate: Date.now(),
    isOffline: false
};

let motorCommand = "NONE";

// =========================
let systemBoot = true;

// unlock boot
setTimeout(() => {
    systemBoot = false;
    motorCommand = "NONE";
}, 5000);

// =========================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    motorCommand = "NONE"; // 🔥 reset command ทุกครั้ง

    if (state === motorData.state) {
        motorData.lastUpdate = Date.now();
        return res.sendStatus(200);
    }

    motorData.state = state;
    motorData.lastUpdate = Date.now();

    res.sendStatus(200);
});

// =========================
app.get('/api/motor/command', (req, res) => {

    if (systemBoot) {
        return res.json({ command: "NONE" });
    }

    const cmd = motorCommand;

    motorCommand = "NONE";

    res.json({ command: cmd });
});

// =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events) {

        if (event.source.userId) {
            targetUserId = event.source.userId;
        }

        if (event.type !== 'message') continue;

        const text = event.message.text.trim();

        if (text === "เปิด") {
            motorCommand = "ON";
        }

        else if (text === "ปิด") {
            motorCommand = "OFF";
        }
    }
});

// =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("RUNNING:", PORT);
});
