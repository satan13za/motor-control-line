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

// ================= DB SAFE CONNECT =================
let dbReady = false;

if (process.env.MONGO_URL) {
    mongoose.connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 5000
    })
    .then(() => {
        dbReady = true;
        console.log("MongoDB Connected");
    })
    .catch(err => console.log("MongoDB Error:", err.message));
}

// ================= USER MODEL =================
const User = mongoose.model("User", new mongoose.Schema({
    userId: String,
    role: { type: String, default: "user" },
    approved: { type: Boolean, default: false }, // 🔥 อนุมัติใช้งาน
    createdAt: { type: Date, default: Date.now }
}));

// ================= ADMIN คนเดียว =================
const SUPER_ADMIN_ID = process.env.ADMIN_ID || "";

// ================= GET USER SAFE =================
async function getUser(userId) {
    if (!dbReady) return { userId, role: "user", approved: false };

    let user = await User.findOne({ userId });
    if (!user) user = await User.create({ userId });

    return user;
}

// ================= MOTOR STATE =================
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

// ================= ONLINE =================
function isOnline() {
    return motorData.lastHeartbeat !== 0 &&
        (Date.now() - motorData.lastHeartbeat) < 20000;
}

// ================= WATCHDOG =================
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

// ================= INTRO (ไทยเข้าใจง่าย) =================
function introMessage(user) {

    const isAdmin = user.userId === SUPER_ADMIN_ID;
    const canControl = isAdmin || user.approved;

    return `🤖 ระบบควบคุมมอเตอร์อัจฉริยะ

━━━━━━━━━━━━━━━━━━━━
📡 ESP32 + LINE CONTROL SYSTEM

👤 สถานะผู้ใช้:
- สิทธิ์: ${isAdmin ? "ผู้ดูแลระบบ (ADMIN)" : user.approved ? "ผู้ใช้งานที่อนุมัติแล้ว" : "รอการอนุมัติ"}

━━━━━━━━━━━━━━━━━━━━
📊 สถานะเครื่อง:
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}

━━━━━━━━━━━━━━━━━━━━
📌 คำสั่งที่ใช้ได้:
${!canControl ? "👉 สถานะ (ดูได้อย่างเดียว)" : "👉 เปิด / ปิด / สถานะ"}

🕒 ${getThaiTime()}

💡 พิมพ์ “สถานะ” เพื่อตรวจสอบระบบ`;
}

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 เมนูผู้ดูแลระบบ

━━━━━━━━━━━━━━━━━━━━
👉 users (ดูผู้ใช้)
👉 approve ID (อนุมัติ)
👉 revoke ID (ยกเลิก)
👉 promote ID (ตั้ง admin)
👉 demote ID (ลดสิทธิ์)

⚠️ หมายเหตุ:
มี admin ได้แค่ 1 คนเท่านั้น

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

        const isSuperAdmin = userId === SUPER_ADMIN_ID;
        const canControl = isSuperAdmin || user.approved;

        // ================= START =================
        if (text === "เริ่ม") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(user)
            });
        }

        // ================= STATUS =================
        if (text === "สถานะ") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 สถานะระบบ
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}`
            });
        }

        // ================= ADMIN MENU (SUPER ADMIN ONLY) =================
        if (text === "admin") {
            if (!isSuperAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์เข้าถึงเมนูผู้ดูแล"
                });
            }

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: adminMenu()
            });
        }

        // ================= APPROVE USER =================
        if (text.startsWith("approve ")) {

            if (!isSuperAdmin) return;

            const id = text.split(" ")[1];

            await User.updateOne({ userId: id }, { approved: true });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `✅ อนุมัติผู้ใช้: ${id}`
            });
        }

        // ================= REVOKE =================
        if (text.startsWith("revoke ")) {

            if (!isSuperAdmin) return;

            const id = text.split(" ")[1];

            await User.updateOne({ userId: id }, { approved: false });

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `❌ ถอนสิทธิ์: ${id}`
            });
        }

        // ================= USERS =================
        if (text === "users") {

            if (!isSuperAdmin) return;

            const users = await User.find().limit(10);

            const list = users.map(u =>
                `${u.userId} | ${u.approved ? "อนุมัติแล้ว" : "รออนุมัติ"}`
            ).join("\n");

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `👥 รายชื่อผู้ใช้\n\n${list}`
            });
        }

        // ================= OPEN =================
        if (text === "เปิด") {

            if (!canControl) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ยังไม่ได้รับอนุมัติให้ควบคุมระบบ"
                });
            }

            if (!isOnline()) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ระบบ OFFLINE อยู่ ไม่สามารถสั่งเปิดได้"
                });
            }

            motorCommand = { cmd: "ON", timestamp: Date.now() };

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "⚙️ ส่งคำสั่งเปิดแล้ว"
            });
        }

        // ================= CLOSE =================
        if (text === "ปิด") {

            if (!canControl) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ยังไม่ได้รับอนุมัติ"
                });
            }

            motorCommand = { cmd: "OFF", timestamp: Date.now() };

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "🛑 ส่งคำสั่งปิดแล้ว"
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
