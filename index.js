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

// ================= USER DB =================
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

// ================= HELP (แยกสิทธิ์จริง) =================
function helpMessage(isAdmin) {
    if (isAdmin) {
        return `📘 ADMIN CONTROL SYSTEM

📊 สถานะ
👉 เปิด
👉 ปิด

🔐 ADMIN TOOLS:
👉 /approve Uxxxx
👉 /remove Uxxxx
👉 /users

🕒 ${getThaiTime()}`;
    }

    return `📘 USER SYSTEM

📊 สถานะ

⚠️ คำสั่งควบคุม (ต้องเป็น ADMIN):
👉 เปิด
👉 ปิด

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
                    text: "❌ ไม่มีสิทธิ์ (ต้องเป็น ADMIN)"
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
                    text: "❌ ไม่มีสิทธิ์ (ต้องเป็น ADMIN)"
                });
            }

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `🛑 สั่งปิดแล้ว\n🕒 ${getThaiTime()}`
            });
        }

        // ================= APPROVE ADMIN =================
        if (text.startsWith("/approve")) {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            const targetId = text.split(" ")[1];

            const target = await User.findOne({ userId: targetId });

            if (!target) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่พบ user"
                });
            }

            target.role = "admin";
            await target.save();

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `✅ อนุมัติเป็น ADMIN แล้ว\n👤 ${targetId}`
            });
        }

        // ================= REMOVE ADMIN =================
        if (text.startsWith("/remove")) {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            const targetId = text.split(" ")[1];

            const target = await User.findOne({ userId: targetId });

            if (!target) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่พบ user"
                });
            }

            target.role = "user";
            await target.save();

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `🟡 ถอนสิทธิ์แล้ว\n👤 ${targetId}`
            });
        }

        // ================= LIST USERS =================
        if (text === "/users") {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์"
                });
            }

            const users = await User.find().limit(10);

            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
users.map(u =>
`👤 ${u.userId}
🔐 ${u.role}`
).join("\n\n")
            });
        }

        // ================= DEFAULT HELP =================
        return client.replyMessage(event.replyToken, {
            type: "text",
            text: helpMessage(isAdmin)
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    logSystem("SERVER STARTED");
});
