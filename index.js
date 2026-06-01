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

// ================= INTRO =================
function introMessage(user) {
    const isAdmin = user.userId === SUPER_ADMIN_ID;
    const canControl = isAdmin || user.approved;

    return `🤖 ระบบควบคุมมอเตอร์อัจฉริยะ

━━━━━━━━━━━━━━━━━━━━
📡 SYSTEM READY

👤 สถานะ: ${isAdmin ? "ADMIN" : user.approved ? "APPROVED" : "WAIT"}

⚙️ ${motorData.state}
📶 ${isOnline() ? "ONLINE" : "OFFLINE"}

━━━━━━━━━━━━━━━━━━━━
${canControl ? "👉 เปิด / ปิด / สถานะ" : "👉 สถานะเท่านั้น"}

🕒 ${getThaiTime()}`;
}

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 ADMIN MENU
👉 users
👉 approve ID
👉 revoke ID

🕒 ${getThaiTime()}`;
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        try {

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

            // ================= ADMIN =================
            if (text === "admin") {
                if (!isSuperAdmin) {
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

            // ================= OPEN =================
            if (text === "เปิด") {

                if (!canControl) {
                    return client.replyMessage(event.replyToken, {
                        type: "text",
                        text: "❌ ไม่มีสิทธิ์"
                    });
                }

                if (!isOnline()) {
                    return client.replyMessage(event.replyToken, {
                        type: "text",
                        text: "⚠️ ระบบ OFFLINE"
                    });
                }

                motorCommand = { cmd: "ON", timestamp: Date.now() };

                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚙️ ส่งเปิดแล้ว"
                });
            }

            // ================= FIXED CLOSE (IMPORTANT) =================
            if (text === "ปิด") {

                if (!canControl) {
                    return client.replyMessage(event.replyToken, {
                        type: "text",
                        text: "❌ ไม่มีสิทธิ์"
                    });
                }

                motorCommand = {
                    cmd: "OFF",
                    timestamp: Date.now()
                };

                // 🔥 FIX: บังคับ await + confirm response
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "🛑 ส่งคำสั่งปิดแล้ว"
                });

                continue; // กันหลุด flow
            }

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "พิมพ์ 'เริ่ม'"
            });

        } catch (err) {
            console.log("ERROR:", err.message);
        }
    }
});

// ================= START =================
app.listen(10000, () => {
    console.log("SERVER STARTED");
});
