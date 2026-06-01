const express = require('express');
const { Client } = require('@line/bot-sdk');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// ================= TIME THAILAND =================
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
function logSystem(message) {
    console.log(`[${getThaiTime()}] ${message}`);
}

// ================= LINE =================
const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
});

// ================= MONGODB =================
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

const userSchema = new mongoose.Schema({
    userId: String,
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// auto register user
async function getUser(userId) {
    let user = await User.findOne({ userId });

    if (!user) {
        user = await User.create({ userId });
        console.log("NEW USER:", userId);
    }

    return user;
}

// ================= STATE =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: Date.now(),
    isOffline: false
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

        client.pushMessage(process.env.ADMIN_ID, {
            type: 'text',
            text: `❌ ESP32 OFFLINE\n🕒 ${getThaiTime()}`
        }).catch(()=>{});
    }

}, 5000);

// ================= REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;
    if (!state) return res.sendStatus(200);

    motorData.state = state;
    motorData.lastHeartbeat = Date.now();
    motorData.isOffline = false;

    logSystem(`REPORT -> ${state}`);

    res.sendStatus(200);
});

// ================= COMMAND =================
app.get('/api/motor/command', (req, res) => {

    const cmd = motorCommand;

    res.json({
        command: cmd,
        state: motorData.state,
        time: getThaiTime()
    });

    if (cmd !== "NONE") motorCommand = "NONE";
});

// ================= HELP =================
function helpMessage(role) {
    return `📘 MOTOR SYSTEM

📊 สถานะ = ดูระบบ

${role === "admin"
? "🔐 ADMIN:\n👉 เปิด\n👉 ปิด\n👉 /setadmin"
: "🔒 USER (ดูได้อย่างเดียว)"}

🕒 ${getThaiTime()}
`;
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        const userId = event.source.userId;
        const text = event.message?.text?.trim();

        const user = await getUser(userId);
        const isAdmin = user.role === "admin";

        // ================= SET ADMIN =================
        if (text?.startsWith("/setadmin")) {

            if (!isAdmin) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่มีสิทธิ์ตั้ง admin"
                });
            }

            const targetId = text.split(" ")[1];

            const target = await User.findOne({ userId: targetId });

            if (!target) {
                return client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "❌ ไม่พบ user นี้"
                });
            }

            target.role = "admin";
            await target.save();

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: `✅ ตั้ง admin แล้ว\n👤 ${targetId}`
            });
        }

        // ================= UNSET ADMIN =================
        if (text?.startsWith("/unsetadmin")) {

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
                text: `🟡 ถอน admin แล้ว`
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

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "⚙️ เปิดแล้ว"
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

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: "text",
                text: "🛑 ปิดแล้ว"
            });
        }

        // ================= STATUS =================
        if (text === "สถานะ") {

            return client.replyMessage(event.replyToken, {
                type: "text",
                text:
`📊 STATUS
⚙️ ${motorData.state}
👤 Role: ${user.role}
🕒 ${getThaiTime()}`
            });
        }

        // ================= HELP =================
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
