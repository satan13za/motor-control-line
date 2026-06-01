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

// ================= LOG SYSTEM =================
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

async function getUser(userId) {
    let user = await User.findOne({ userId });

    if (!user) {
        user = await User.create({ userId });
    }

    return user;
}

let targetUserId = null;

// ================= STATE =================
let motorData = {
    state: "STANDBY",
    lastHeartbeat: Date.now(),
    isOffline: false,
    lastUpdateTime: getThaiTime()
};

let motorCommand = "NONE";

// ================= OFFLINE CHECK =================
setInterval(() => {

    const timeout = 20000;

    if (!motorData.isOffline &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.isOffline = true;

        logSystem("ESP32 OFFLINE DETECTED");

        if (targetUserId) {
            client.pushMessage(targetUserId, {
                type: 'text',
                text:
`❌ ESP32 OFFLINE
🕒 ${getThaiTime()}`
            });
        }
    }

}, 5000);

// ================= REPORT =================
app.post('/api/motor/report', (req, res) => {

    const { state } = req.body;
    if (!state) return res.sendStatus(200);

    const old = motorData.state;

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
        time: getThaiTime(),
        state: motorData.state
    });

    if (cmd !== "NONE") motorCommand = "NONE";
});

// ================= HELP =================
function helpMessage(role) {
    return `📘 SYSTEM MOTOR

⚙️ สถานะ
👉 สถานะ = ดูระบบ

${role === "admin" ? "🔐 คำสั่งแอดมิน\n👉 เปิด\n👉 ปิด" : "🔒 คุณเป็น USER"}

🕒 ${getThaiTime()}
`;
}

// ================= WEBHOOK LINE =================
app.post('/webhook', async (req, res) => {

    res.sendStatus(200);

    for (const event of req.body.events || []) {

        const userId = event.source.userId;
        const text = event.message?.text?.trim();

        const user = await getUser(userId);
        const isAdmin = user.role === "admin";

        if (text === "เปิด") {

            if (!isAdmin)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ไม่มีสิทธิ์"
                });

            motorCommand = "ON";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "⚙️ เปิดแล้ว"
            });
        }

        if (text === "ปิด") {

            if (!isAdmin)
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: "❌ ไม่มีสิทธิ์"
                });

            motorCommand = "OFF";

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: "🛑 ปิดแล้ว"
            });
        }

        if (text === "สถานะ") {

            return client.replyMessage(event.replyToken, {
                type: 'text',
                text:
`📊 STATUS
⚙️ ${motorData.state}
👤 Role: ${user.role}
🕒 ${getThaiTime()}`
            });
        }

        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: helpMessage(user.role)
        });
    }
});

// ================= START =================
app.listen(10000, () => {
    logSystem("SERVER STARTED ON PORT 10000");
});
