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

// ================= MONGODB (FIX SAFE CONNECT) =================
let dbReady = false;

if (process.env.MONGO_URL) {
    mongoose.connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 5000
    })
    .then(() => {
        dbReady = true;
        console.log("MongoDB Connected");
    })
    .catch(err => {
        console.log("MongoDB Error:", err.message);
        dbReady = false;
    });
} else {
    console.log("❌ MONGO_URL missing (RUN WITHOUT DB MODE)");
}

// ================= USER MODEL =================
const userSchema = new mongoose.Schema({
    userId: String,
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ================= SAFE USER GET (NO CRASH) =================
async function getUser(userId) {
    try {
        if (!dbReady) {
            return { userId, role: "user" };
        }

        let user = await User.findOne({ userId });
        if (!user) user = await User.create({ userId });
        return user;

    } catch (err) {
        console.log("DB ERROR getUser:", err.message);
        return { userId, role: "user" };
    }
}

// ================= MOTOR SAFE STATE =================
let motorData = {
    state: "STOP",
    lastHeartbeat: 0,
    fault: false,
    faultCode: null
};

// ================= COMMAND SYSTEM =================
let motorCommand = {
    cmd: "NONE",
    timestamp: 0
};

// ================= ONLINE CHECK =================
function isOnline() {
    return motorData.lastHeartbeat !== 0 &&
        (Date.now() - motorData.lastHeartbeat) < 20000;
}

// ================= WATCHDOG (SAFE MODE) =================
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
📡 ESP32 + LINE SYSTEM
⚙️ Real-time Control

━━━━━━━━━━━━━━━━━━━━
📊 COMMANDS
👉 เริ่ม
👉 สถานะ
👉 เปิด
👉 ปิด
${isAdmin ? "👉 admin\n👉 users / promote / demote" : ""}

━━━━━━━━━━━━━━━━━━━━
📡 STATUS
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}

🕒 ${getThaiTime()}`;
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
✔ Safe Mode ON
✔ Watchdog ON

🕒 ${getThaiTime()}`;
}

// ================= ESP32 REPORT =================
app.post('/api/motor/report', (req, res) => {
    try {
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
    } catch (err) {
        res.sendStatus(500);
    }
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

        // ===== START =====
        if (text === "เริ่ม") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(isAdmin)
            });
        }

        // ===== STATUS =====
        if (text === "สถานะ") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 STATUS
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}`
            });
        }

        // ===== ADMIN MENU =====
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

        // ===== USERS =====
        if (text === "users") {
            if (!isAdmin || !dbReady) return;

            const users = await User.find().limit(10);

            const list = users.map(u =>
                `${u.userId} | ${u.role}`
            ).join("\n");

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `👥 USERS\n\n${list || "ไม่มีข้อมูล"}`
            });
        }

        // ===== PROMOTE =====
        if (text.startsWith("promote ")) {
            if (!dbReady) return;

            const id = text.split(" ")[1];
            await User.updateOne({ userId: id }, { role: "admin" });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `✅ Promote ${id}`
            });
        }

        // ===== DEMOTE =====
        if (text.startsWith("demote ")) {
            if (!dbReady) return;

            const id = text.split(" ")[1];
            await User.updateOne({ userId: id }, { role: "user" });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `⬇️ Demote ${id}`
            });
        }

        // ===== OPEN =====
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
                text: "⚙️ ส่ง ON แล้ว"
            });
        }

        // ===== CLOSE =====
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
                text: "🛑 ส่ง OFF แล้ว"
            });
        }

        return client.replyMessage(event.replyToken, {
            type: "text",
            text: "พิมพ์ 'เริ่ม'"
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("SERVER STARTED");
});
