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
    lastUpdate: Date.now()
};

let motorCommand = "NONE";

// ========================= LOG =========================
function log(msg) {
    console.log("[SERVER]", msg);
}

// ========================= WEBHOOK =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    const events = req.body.events || [];

    for (const event of events) {

        log(JSON.stringify(event));

        if (!event || !event.type) continue;

        if (event.source && event.source.userId) {
            targetUserId = event.source.userId;
        }

        // ========================= MESSAGE =========================
        if (event.type === 'message') {

            const text = (event.message.text || "").trim();

            log("LINE MSG: " + text);

            if (text === "เปิด") {

                motorCommand = "ON";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "⚙️ สั่งเปิดมอเตอร์แล้ว"
                });
            }

            else if (text === "ปิด") {

                motorCommand = "OFF";

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "🛑 สั่งปิดมอเตอร์แล้ว"
                });
            }

            else if (text === "สถานะ") {

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: `📊 สถานะ: ${motorData.state}`
                });
            }

            else {

                await client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ไม่รู้จักคำสั่ง"
                });
            }
        }
    }
});

// ========================= REPORT FROM ESP =========================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;

    if (state) {
        motorData.state = state;
        motorData.lastUpdate = Date.now();
    }

    res.sendStatus(200);
});

// ========================= GET COMMAND =========================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    motorCommand = "NONE";

    res.json({ command: cmd });
});

// ========================= START =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    log("RUNNING ON PORT " + PORT);
});
