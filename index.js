const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

// ================= TIME THAILAND =================
function getThaiTime() {
    return new Date().toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

// ================= LOG SYSTEM =================
function logSystem(message) {
    console.log(`[${getThaiTime()}] ${message}`);
}

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
    isOffline: false,
    lastUpdateTime: getThaiTime()
};

let motorCommand = "NONE";

// ================= OFFLINE CHECK =================
setInterval(() => {

    const timeout = 20000; // ปรับให้นิ่งขึ้น

    if (!motorData.isOffline &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.isOffline = true;

        logSystem("ESP32 OFFLINE DETECTED");

        if (targetUserId) {
            try {
                client.pushMessage(targetUserId, {
                    type: 'text',
                    text:
`❌ ESP32 OFFLINE
🕒 ${getThaiTime()}
⏱ ไม่มี heartbeat > 20 วินาที`
                });
            } catch (err) {
                logSystem("Push Error: " + err.message);
            }
        }
    }

}, 5000);

// ================= REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;
    if (!state) return res.sendStatus(200);

    const old = motorData.state;

    motorData.state = state;
    motorData.lastHeartbeat = Date.now();
    motorData.isOffline = false;
    motorData.lastUpdateTime = getThaiTime();

    logSystem(`REPORT -> ${state}`);

    if (targetUserId && state !== old) {

        let msg = "";

        if (state === "RUNNING") msg = "⚙️ มอเตอร์ทำงานแล้ว";
        if (state === "STANDBY") msg = "🛑 มอเตอร์หยุดแล้ว";
        if (state === "FAULT") msg = "⚠️ FAULT";

        try {
            client.pushMessage(targetUserId, {
                type: 'text',
                text:
`📢 STATUS CHANGE
${msg}
🕒 ${getThaiTime()}`
            });
        } catch (err) {
            logSystem("Push Error: " + err.message);
        }
    }

    res.sendStatus(200);
});

// ================= COMMAND =================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    logSystem(`COMMAND REQUEST -> ${cmd}`);

    res.json({
        command: cmd,
        time: getThaiTime(),
        state: motorData.state
    });

    if (cmd !== "NONE") {
        motorCommand = "NONE";
    }
});

// ================= HELP MESSAGE =================
function helpMessage() {
    return `📘 วิธีใช้งานระบบควบคุมมอเตอร์

⚙️ คำสั่ง:
👉 เปิด = สั่งมอเตอร์ทำงาน
👉 ปิด = สั่งหยุดมอเตอร์
👉 สถานะ = ดูสถานะระบบ

📡 ระบบแจ้งเตือนอัตโนมัติ
⚙️ สถานะ REALTIME จาก ESP32

🕒 เวลา: ${getThaiTime()}
`;
}

// ================= WEBHOOK LINE =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        if (event.source?.userId) {
            targetUserId = event.source.userId;
        }

        const text = event.message?.text?.trim();

        // ================= OPEN =================
        if (text === "เปิด") {

            if (motorData.isOffline)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: `❌ ESP32 OFFLINE\n🕒 ${getThaiTime()}`
                });

            motorCommand = "ON";

            logSystem("COMMAND -> ON");

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`⚙️ สั่งเปิดแล้ว
🕒 ${getThaiTime()}`
            });
        }

        // ================= CLOSE =================
        if (text === "ปิด") {

            if (motorData.isOffline)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: `❌ ESP32 OFFLINE\n🕒 ${getThaiTime()}`
                });

            motorCommand = "OFF";

            logSystem("COMMAND -> OFF");

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`🛑 สั่งปิดแล้ว
🕒 ${getThaiTime()}`
            });
        }

        // ================= STATUS =================
        if (text === "สถานะ") {

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`📊 MOTOR STATUS
━━━━━━━━━━━━
⚙️ State: ${motorData.state}
📶 Online: ${motorData.isOffline ? "OFFLINE" : "ONLINE"}
🕒 ${getThaiTime()}
━━━━━━━━━━━━`
            });
        }

        // ================= DEFAULT HELP =================
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: helpMessage()
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    logSystem("SERVER STARTED ON PORT 10000");
});
