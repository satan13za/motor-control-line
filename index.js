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

// ================= INTRO MESSAGE =================
function introMessage(isAdmin) {
    return `👋 สวัสดี ยินดีต้อนรับสู่ MOTOR CONTROL SYSTEM

📘 ระบบนี้ใช้สำหรับ:
- ควบคุมมอเตอร์ผ่าน LINE
- ตรวจสอบสถานะเครื่องจักรแบบ Real-time
- แจ้งเตือน ESP32 Offline
- แจ้งเตือน Fault (OVERLOAD / CONTACTOR)

⚙️ คำสั่ง:
👉 สถานะ
👉 เปิด / ปิด ${isAdmin ? '(Admin)' : ''}

📡 ระบบจะตรวจสอบ ESP32 และมอเตอร์อัตโนมัติ

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

        const online = isOnline();

        // ================= INTRO =================
        if (text === "เริ่ม" || text === "สวัสดี" || text === "menu") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(isAdmin)
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
🧾 Code: ${motorData.faultCode ? motorData.faultCode : "NORMAL (ไม่มี Fault)"}
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

            if (!online) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ESP32 OFFLINE\nไม่สามารถสั่งงานได้"
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
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            if (!online) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ESP32 OFFLINE\nไม่สามารถสั่งงานได้"
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `🛑 สั่งปิดแล้ว\n🕒 ${getThaiTime()}`
            });
        }

        // ================= DEFAULT =================
        return client.replyMessage(event.replyToken, {
            type: "text",
            text:
`📘 MOTOR SYSTEM
👉 พิมพ์ "เริ่ม" เพื่อดูแนะนำระบบ
👉 สถานะ
👉 เปิด / ปิด (Admin)`
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    logSystem("SERVER STARTED");
});
