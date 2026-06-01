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

// ================= MOTOR STATE =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: 0,
    fault: false,
    faultCode: null
};

// ================= COMMAND QUEUE =================
let commandQueue = [];

// ================= ONLINE CHECK =================
function isOnline() {
    const timeout = 20000;
    if (motorData.lastHeartbeat === 0) return false;
    return (Date.now() - motorData.lastHeartbeat) < timeout;
}

// ================= WATCHDOG =================
setInterval(() => {
    const timeout = 30000;

    if (
        motorData.lastHeartbeat !== 0 &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.state = "OFFLINE";
        motorData.fault = true;
        motorData.faultCode = "WATCHDOG_TIMEOUT";
    }
}, 5000);

// ================= 🧠 SMART INTRO (THAI AI STYLE) =================
function introMessage(isAdmin) {
    return `🤖 สวัสดีครับ ยินดีต้อนรับสู่ระบบควบคุมมอเตอร์อัจฉริยะ

━━━━━━━━━━━━━━━━━━━━
📡 ระบบ: MOTOR CONTROL SYSTEM (IoT + LINE)
⚙️ ควบคุม ESP32 แบบ Real-time
━━━━━━━━━━━━━━━━━━━━

🧠 ฟังก์ชันระบบ
✔ เปิด / ปิดมอเตอร์
✔ ตรวจสอบ ONLINE / OFFLINE
✔ ตรวจจับ Fault อัตโนมัติ
✔ Watchdog ป้องกันระบบค้าง
✔ Command Queue ป้องกันคำสั่งหลุด

━━━━━━━━━━━━━━━━━━━━
📊 คำสั่งใช้งาน
👉 เปิด
👉 ปิด
👉 สถานะ
${isAdmin ? "👉 admin (เมนูผู้ดูแล)\n👉 /users /approve /remove" : ""}

━━━━━━━━━━━━━━━━━━━━
📡 สถานะปัจจุบัน
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE ✅" : "OFFLINE ❌"}
⚠️ Fault: ${motorData.fault ? "YES ❌" : "NO ✅"}
🧾 Code: ${motorData.faultCode || "NORMAL"}

🕒 ${getThaiTime()}

💡 พิมพ์ “เปิด” หรือ “ปิด” เพื่อควบคุม`;
}

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 ADMIN MENU

━━━━━━━━━━━━━━━━━━━━
👉 สถานะ
👉 เปิด
👉 ปิด

👥 USER CONTROL
👉 /users
👉 /approve ID
👉 /remove ID

━━━━━━━━━━━━━━━━━━━━
📡 SYSTEM ACTIVE
✔ Queue Enabled
✔ Watchdog Enabled
✔ Real-time ESP32 Control

🕒 ${getThaiTime()}`;
}

// ================= ESP32 REPORT =================
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

// ================= ESP32 COMMAND =================
app.get('/api/motor/command', (req, res) => {

    let cmd = "NONE";

    if (commandQueue.length > 0) {
        cmd = commandQueue.shift();
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

        // ===== START =====
        if (["เริ่ม", "สวัสดี", "menu"].includes(text)) {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(isAdmin)
            });
        }

        // ===== ADMIN =====
        if (text === "admin") {
            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์เข้าถึง"
                });
            }

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: adminMenu()
            });
        }

        // ===== STATUS =====
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

        // ===== OPEN =====
        if (text === "เปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ เฉพาะ ADMIN เท่านั้น"
                });
            }

            commandQueue.push("ON");

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "⚙️ ส่งคำสั่ง ON แล้ว"
            });
        }

        // ===== CLOSE =====
        if (text === "ปิด") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ เฉพาะ ADMIN เท่านั้น"
                });
            }

            commandQueue.push("OFF");

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "🛑 ส่งคำสั่ง OFF แล้ว"
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
