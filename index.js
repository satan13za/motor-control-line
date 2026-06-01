const express = require('express');
const { Client } = require('@line/bot-sdk');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// ================= TIME =================
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

// ================= LOG =================
function logSystem(msg) {
    console.log(`[${getThaiTime()}] ${msg}`);
}

// ================= ENV =================
const MONGO_URL = process.env.MONGO_URL;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

// ================= LINE =================
const client = new Client({
    channelAccessToken: CHANNEL_ACCESS_TOKEN || "",
    channelSecret: CHANNEL_SECRET || ""
});

// ================= MONGODB =================
if (MONGO_URL) {
    mongoose.connect(MONGO_URL)
        .then(() => console.log("MongoDB Connected"))
        .catch(err => console.log("MongoDB Error:", err));
} else {
    console.log("❌ MONGO_URL missing");
}

// ================= USER =================
const userSchema = new mongoose.Schema({
    userId: String,
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

async function getUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = await User.create({ userId });
        console.log("NEW USER:", userId);
    }
    return user;
}

// ================= MOTOR STATE =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: Date.now(),
    isOffline: false,
    fault: false,
    faultCode: null
};

let motorCommand = "NONE";

// ================= OFFLINE CHECK =================
setInterval(() => {

    const timeout = 20000;

    if (!motorData.isOffline &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.isOffline = true;

        logSystem("ESP32 OFFLINE");

        if (ADMIN_ID) {
            client.pushMessage(ADMIN_ID, {
                type: "text",
                text: `❌ ESP32 OFFLINE\n🕒 ${getThaiTime()}`
            }).catch(() => {});
        }
    }

}, 5000);

// ================= REPORT FROM ESP32 =================
app.post('/api/motor/report', (req, res) => {

    const { state, error } = req.body;
    if (!state) return res.sendStatus(200);

    motorData.state = state;
    motorData.lastHeartbeat = Date.now();
    motorData.isOffline = false;

    // ================= NORMAL =================
    if (state === "RUN" || state === "STOP") {
        motorData.fault = false;
        motorData.faultCode = null;
        logSystem(`STATE -> ${state}`);
    }

    // ================= FAULT =================
    if (state === "FAULT") {

        motorData.fault = true;
        motorData.faultCode = error || "UNKNOWN";

        logSystem(`⚠️ FAULT -> ${error}`);

        if (ADMIN_ID) {
            client.pushMessage(ADMIN_ID, {
                type: "text",
                text:
`🚨 MOTOR FAULT
❌ Code: ${motorData.faultCode}
🕒 ${getThaiTime()}`
            }).catch(() => {});
        }
    }

    res.sendStatus(200);
});

// ================= COMMAND =================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    res.json({
        command: cmd,
        state: motorData.state,
        fault: motorData.fault,
        faultCode: motorData.faultCode,
        time: getThaiTime()
    });

    if (cmd !== "NONE") motorCommand = "NONE";
});

// ================= STATUS MESSAGE =================
function helpMessage(role) {
    return `📘 MOTOR SYSTEM

📊 สถานะ = ดูระบบ

${role === "admin"
? "🔐 ADMIN:\n👉 เปิด\n👉 ปิด"
: "🔒 USER (ดูได้อย่างเดียว)"}

🕒 ${getThaiTime()}`;
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        const userId = event.source.userId;
        const text = event.message?.text?.trim();

        if (!userId || !text) return;

        const user = await getUser(userId);
        const isAdmin = user.role === "admin";

        // ================= STATUS =================
        if (text === "สถานะ") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 STATUS
⚙️ ${motorData.state}
📡 ${motorData.isOffline ? "OFFLINE ❌" : "ONLINE ✅"}
⚠️ Fault: ${motorData.fault ? "YES ❌" : "NO ✅"}
🧾 Code: ${motorData.faultCode || "-"}
👤 Role: ${user.role}
🕒 ${getThaiTime()}`
            });
        }

        // ================= OPEN =================
        if (text === "เปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            if (motorData.isOffline) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `⚠️ ESP32 OFFLINE`
                });
            }

            if (motorData.fault) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `⚠️ ไม่สามารถสั่งได้ (FAULT)\n${motorData.faultCode}`
                });
            }

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`⚙️ สั่งเปิดแล้ว
🕒 ${getThaiTime()}`
            });
        }

        // ================= CLOSE =================
        if (text === "ปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            if (motorData.isOffline) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `⚠️ ESP32 OFFLINE`
                });
            }

            if (motorData.fault) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `⚠️ ไม่สามารถสั่งได้ (FAULT)\n${motorData.faultCode}`
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`🛑 สั่งปิดแล้ว
🕒 ${getThaiTime()}`
            });
        }

        return client.replyMessage(event.replyToken, {
            type: "text",
            text: helpMessage(user.role)
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    logSystem("SERVER STARTED");
});
