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

// ================= ENV =================
const MONGO_URL = process.env.MONGO_URL;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.CHANNEL_SECRET;

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

// ================= MOTOR STATE (FULL FIXED) =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: 0,
    fault: false,
    faultCode: null
};

let motorCommand = "NONE";

// ================= ONLINE CHECK =================
function isOnline() {
    const timeout = 20000;
    if (motorData.lastHeartbeat === 0) return false;
    return (Date.now() - motorData.lastHeartbeat) < timeout;
}

// ================= INTRO =================
function introMessage(isAdmin) {
    return `👋 ยินดีต้อนรับ MOTOR CONTROL SYSTEM

📘 ระบบควบคุมมอเตอร์ผ่าน LINE
📡 ตรวจสอบ ESP32 แบบ Real-time
⚠️ แจ้งเตือน OFFLINE / FAULT

📊 คำสั่ง:
👉 สถานะ
👉 เปิด / ปิด ${isAdmin ? '(ADMIN)' : ''}

🕒 ${getThaiTime()}`;
}

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 ADMIN MENU

📊 คำสั่ง:
👉 สถานะ
👉 เปิด
👉 ปิด

👥 USER:
👉 /users
👉 /approve ID
👉 /remove ID

🕒 ${getThaiTime()}`;
}

// ================= 🔥 ESP32 REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state, faultCode } = req.body;

    if (state) {
        motorData.state = state;
        motorData.lastHeartbeat = Date.now();
    }

    if (state === "FAULT") {
        motorData.fault = true;
        motorData.faultCode = faultCode || "UNKNOWN";
    } else {
        motorData.fault = false;
        motorData.faultCode = null;
    }

    res.sendStatus(200);
});

// ================= 🔥 ESP32 COMMAND =================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    if (cmd !== "NONE") {
        motorCommand = "NONE";
    }

    res.json({
        command: cmd,
        state: motorData.state,
        fault: motorData.fault,
        faultCode: motorData.faultCode
    });
});

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        const userId = event.source.userId;
        const text = event.message?.text?.trim();

        if (!userId || !text) continue;

        const user = await getUser(userId);
        const isAdmin = user.role === "admin";
        const online = isOnline();

        // ================= INTRO =================
        if (["เริ่ม", "สวัสดี", "menu"].includes(text)) {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(isAdmin)
            });
        }

        // ================= ADMIN MENU =================
        if (text === "admin") {
            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: adminMenu()
            });
        }

        // ================= STATUS =================
        if (text === "สถานะ") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 STATUS
⚙️ ${motorData.state}
📡 ${online ? "ONLINE ✅" : "OFFLINE ❌"}
⚠️ Fault: ${motorData.fault ? "YES ❌" : "NO ✅"}
🧾 Code: ${motorData.faultCode || "NORMAL"}
👤 Role: ${user.role}
🕒 ${getThaiTime()}`
            });
        }

        // ================= OPEN =================
        if (text === "เปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ เฉพาะ ADMIN เท่านั้น"
                });
            }

            if (!online) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ESP32 OFFLINE"
                });
            }

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `⚙️ สั่งเปิดแล้ว\n🕒 ${getThaiTime()}`
            });
        }

        // ================= CLOSE =================
        if (text === "ปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ เฉพาะ ADMIN เท่านั้น"
                });
            }

            if (!online) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ESP32 OFFLINE"
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `🛑 สั่งปิดแล้ว\n🕒 ${getThaiTime()}`
            });
        }

        return client.replyMessage(event.replyToken, {
            type: "text",
            text: "📘 MOTOR SYSTEM\n👉 พิมพ์ 'เริ่ม'"
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("SERVER STARTED");
});
