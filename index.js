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

// ================= LINE =================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || "",
    channelSecret: process.env.CHANNEL_SECRET || ""
});

// ================= MONGODB USER =================
const User = mongoose.model("User", new mongoose.Schema({
    userId: String,
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now }
}));

async function getUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) user = await User.create({ userId });
    return user;
}

// ================= MOTOR SAFE STATE =================
let motorData = {
    state: "STOP",
    lastHeartbeat: 0,
    fault: false,
    faultCode: null
};

// ================= COMMAND =================
let motorCommand = {
    cmd: "NONE",
    timestamp: 0
};

// ================= ONLINE CHECK =================
function isOnline() {
    return motorData.lastHeartbeat !== 0 &&
        (Date.now() - motorData.lastHeartbeat) < 20000;
}

// ================= WATCHDOG SAFETY =================
setInterval(() => {
    const timeout = 30000;

    if (motorData.lastHeartbeat !== 0 &&
        Date.now() - motorData.lastHeartbeat > timeout) {

        motorData.state = "STOP";
        motorData.fault = true;
        motorData.faultCode = "WATCHDOG_TIMEOUT";

        motorCommand = { cmd: "NONE", timestamp: 0 };
    }
}, 5000);

// ================= INTRO MESSAGE =================
function introMessage(isAdmin) {
    return `🤖 MOTOR CONTROL SYSTEM

━━━━━━━━━━━━━━━━━━━━
📡 LINE + ESP32 REALTIME CONTROL
⚙️ SYSTEM STATUS MONITOR

━━━━━━━━━━━━━━━━━━━━
📊 COMMANDS
👉 เริ่ม
👉 สถานะ
👉 เปิด
👉 ปิด
${isAdmin ? "👉 admin (menu)\n👉 users / promote / demote" : ""}

━━━━━━━━━━━━━━━━━━━━
📡 STATUS
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}

🕒 ${getThaiTime()}

💡 พิมพ์ “เปิด” หรือ “ปิด”`;
}

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 ADMIN MENU

━━━━━━━━━━━━━━━━━━━━
👉 สถานะ
👉 เปิด
👉 ปิด
👉 users
👉 promote ID
👉 demote ID

━━━━━━━━━━━━━━━━━━━━
🧠 SYSTEM ACTIVE
✔ Watchdog ON
✔ Safe STOP MODE
✔ ACK READY

🕒 ${getThaiTime()}`;
}

// ================= ESP32 REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state, faultCode } = req.body;

    motorData.lastHeartbeat = Date.now();

    if (state) motorData.state = state;

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

    const cmd = motorCommand.cmd;

    if (motorCommand.timestamp !== 0 &&
        Date.now() - motorCommand.timestamp > 10000) {

        motorCommand = { cmd: "NONE", timestamp: 0 };
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

        // ================= START =================
        if (text === "เริ่ม") {
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
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}
🧾 Code: ${motorData.faultCode || "NORMAL"}`
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

        // ================= USERS =================
        if (text === "users") {

            if (!isAdmin) return;

            const users = await User.find().limit(10);

            const list = users.map(u =>
                `${u.userId} | ${u.role}`
            ).join("\n");

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `👥 USERS\n\n${list || "ไม่มีข้อมูล"}`
            });
        }

        // ================= PROMOTE =================
        if (text.startsWith("promote ")) {

            const id = text.split(" ")[1];

            await User.updateOne({ userId: id }, { role: "admin" });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `✅ Promote: ${id}`
            });
        }

        // ================= DEMOTE =================
        if (text.startsWith("demote ")) {

            const id = text.split(" ")[1];

            await User.updateOne({ userId: id }, { role: "user" });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `⬇️ Demote: ${id}`
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

            motorCommand = {
                cmd: "ON",
                timestamp: Date.now()
            };

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "⚙️ ส่ง ON แล้ว (รอ ESP32)"
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

            motorCommand = {
                cmd: "OFF",
                timestamp: Date.now()
            };

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "🛑 ส่ง OFF แล้ว (รอ ESP32)"
            });
        }

        return client.replyMessage(event.replyToken, {
            type: "text",
            text: "พิมพ์ 'เริ่ม' เพื่อใช้งานระบบ"
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("SERVER STARTED");
});
