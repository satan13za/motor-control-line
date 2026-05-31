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

// ========================= TIMEOUT CHECK =========================
setInterval(() => {

    const timeout = 15000; // 15 sec

    if (!motorData.isOffline && (Date.now() - motorData.lastUpdate > timeout)) {

        motorData.isOffline = true;

        if (targetUserId) {
            client.pushMessage(targetUserId, {
                type: 'text',
                text: "❌ ระบบออฟไลน์\nอุปกรณ์ ESP32 ไม่ตอบสนอง"
            });
        }
    }

}, 5000);

// ========================= HELP MENU =========================
const helpText =
`🤖 ระบบควบคุมมอเตอร์

📌 คำสั่ง:
- เปิด → สั่งเริ่มมอเตอร์
- ปิด → หยุดมอเตอร์
- สถานะ → ดูสถานะระบบ

⚠️ ระบบจะตรวจสอบ ESP32 อัตโนมัติ`;

// ========================= WEBHOOK =========================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    const events = req.body.events || [];

    for (const event of events) {

        if (!event || !event.type) continue;

        if (event.source?.userId) {
            targetUserId = event.source.userId;
        }

        if (event.type !== 'message') continue;

        const text = (event.message.text || "").trim();

        // ========================= OFFLINE BLOCK =========================
        const systemReady = !motorData.isOffline;

        // ========================= OPEN =========================
        if (text === "เปิด") {

            if (!systemReady) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ระบบไม่พร้อมใช้งาน\nESP32 ยังไม่เชื่อมต่อ"
                });
            }

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "⚙️ กำลังสั่งเปิดมอเตอร์...\nรอการตอบกลับจากระบบ"
            });
        }

        // ========================= CLOSE =========================
        else if (text === "ปิด") {

            if (!systemReady) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ระบบไม่พร้อมใช้งาน\nESP32 ยังไม่เชื่อมต่อ"
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "🛑 กำลังสั่งปิดมอเตอร์...\nรอการตอบกลับจากระบบ"
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
อัปเดตล่าสุด: ${new Date(motorData.lastUpdate).toLocaleString()}`
            });
        }

        // ========================= HELP / UNKNOWN =========================
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

    motorData.state = state;
    motorData.lastUpdate = Date.now();
    motorData.isOffline = false;

    // แจ้งเมื่อสถานะเปลี่ยนจริง
    if (targetUserId) {

        client.pushMessage(targetUserId, {
            type: 'text',
            text: `📡 อัปเดตสถานะ: ${state}`
        });
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
    console.log("RUNNING ON PORT " + PORT);
});
