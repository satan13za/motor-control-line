const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// =========================
// LINE
// =========================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

let targetUserId = process.env.USER_ID || null;

// =========================
// STATE
// =========================
let motorData = {
    state: "STANDBY",
    lastUpdate: Date.now(),
    isOffline: false
};

let motorCommand = "NONE";

// 🔥 BOOT LOCK กันสั่งงานทันที
let systemBoot = true;

// =========================
// RESET BOOT AFTER START
// =========================
setTimeout(() => {
    systemBoot = false;
    motorCommand = "NONE";
    console.log("SYSTEM READY (UNLOCKED)");
}, 5000);

// =========================
// TIME
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
// LINE PUSH
// =========================
async function notifyLine(message) {

    if (!targetUserId) return;

    try {
        await client.pushMessage(targetUserId, {
            type: 'text',
            text: `📅 ${thaiTime()}\n\n${message}`
        });
    } catch (err) {
        console.error(err);
    }
}

// =========================
// REPORT FROM ESP32
// =========================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    // 🔥 RESET COMMAND ทุกครั้งที่ ESP ติดต่อ
    motorCommand = "NONE";

    if (motorData.isOffline) {
        motorData.isOffline = false;

        notifyLine("✅ ระบบกลับมาออนไลน์");
    }

    if (state !== motorData.state) {

        motorData.state = state;

        if (state === "RUNNING") {
            notifyLine("⚙️ มอเตอร์ทำงาน");
        }
        else if (state === "STANDBY") {
            notifyLine("🛑 มอเตอร์หยุด");
        }
        else if (state === "FAULT") {
            notifyLine("⚠️ FAULT ระบบ");
        }
    }

    motorData.lastUpdate = Date.now();

    res.sendStatus(200);
});

// =========================
// GET COMMAND (ESP32)
// =========================
app.get('/api/motor/command', (req, res) => {

    // 🔥 กัน boot สั่งงาน
    if (systemBoot) {
        return res.json({ command: "NONE" });
    }

    const cmd = motorCommand;

    res.json({ command: cmd });

    motorCommand = "NONE";
});

// =========================
// LINE WEBHOOK
// =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events) {

        if (event.source.userId) {
            targetUserId = event.source.userId;
        }

        if (event.type === 'message') {

            const text = event.message.text.trim();

            // =========================
            // เปิด
            // =========================
            if (text === "เปิด") {

                if (motorData.state === "RUNNING") return;

                motorCommand = "ON";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "⏳ สั่งเปิดมอเตอร์"
                });
            }

            // =========================
            // ปิด
            // =========================
            else if (text === "ปิด") {

                if (motorData.state === "STANDBY") return;

                motorCommand = "OFF";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "⏳ สั่งปิดมอเตอร์"
                });
            }

            // =========================
            // สถานะ
            // =========================
            else if (text === "สถานะ") {

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text:
`📊 สถานะ: ${motorData.state}
${motorData.isOffline ? "OFFLINE" : "ONLINE"}`
                });
            }
        }
    }
});

// =========================
// SERVER START
// =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("Server running:", PORT);
});
