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
    approved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

// ================= ADMIN =================
const SUPER_ADMIN_ID = process.env.ADMIN_ID || "";

// ================= GET USER SAFE =================
async function getUser(userId) {
    if (!dbReady) {
        console.log("DB NOT READY");
        return null;
    }

    let user = await User.findOne({ userId });

    if (!user) {
        user = await User.create({
            userId,
            role: "user",
            approved: false
        });
    }

    if (!user.role) user.role = "user";

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

// ================= ADMIN MENU (THAI) =================
function adminMenu() {
    return `👑 เมนูผู้ดูแลระบบ

📌 คำสั่ง:
- users = ดูผู้ใช้ทั้งหมด
- approve = อนุมัติผู้ใช้
- revoke = ยกเลิกผู้ใช้
- promote = ตั้งแอดมิน
- demote = ลดสิทธิ์แอดมิน

━━━━━━━━━━━━━━
🕒 ${getThaiTime()}`;
}

// ================= INTRO =================
function introMessage(user, isAdmin) {

    const canControl = isAdmin || user?.approved === true;

    return `🤖 ระบบควบคุมมอเตอร์อัจฉริยะ

━━━━━━━━━━━━━━━━━━━━
👤 สิทธิ์: ${isAdmin ? "👑 ADMIN" : user?.approved ? "USER APPROVED" : "USER VIEW ONLY"}

━━━━━━━━━━━━━━━━━━━━
📊 สถานะ:
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}

━━━━━━━━━━━━━━━━━━━━
📌 คำสั่ง:
${!canControl ? "👉 ดูสถานะได้เท่านั้น" : "👉 เปิด / ปิด / สถานะ"}

🕒 ${getThaiTime()}`;
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        const userId = event.source.userId;
        const text = event.message?.text?.trim();

        if (!userId || !text) continue;

        const user = await getUser(userId);

        if (!user) return;

        const role = (user?.role || "").toLowerCase().trim();

        // ✅ FIX: admin ตรวจจาก ENV เท่านั้น (กัน user ปลอม role)
        const isAdmin =
            userId === SUPER_ADMIN_ID;

        const canControl = isAdmin || user.approved === true;

        // ================= START =================
        if (text === "เริ่ม") {

            if (isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: adminMenu()
                });
            }

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: introMessage(user, isAdmin)
            });
        }

        // ================= STATUS =================
        if (text === "สถานะ") {
            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 สถานะ
⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}
⚠️ Fault: ${motorData.fault ? "YES" : "NO"}`
            });
        }

        // ================= OPEN =================
        if (text === "เปิด") {

            if (!canControl) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์ควบคุม"
                });
            }

            if (!isOnline()) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ระบบ OFFLINE อยู่"
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
                    text: "❌ ไม่มีสิทธิ์ควบคุม"
                });
            }

            if (!isOnline()) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ ระบบ OFFLINE อยู่"
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
            text: "พิมพ์ 'เริ่ม' เพื่อใช้งาน"
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("SERVER STARTED");
});
