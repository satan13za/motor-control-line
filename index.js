require('dotenv').config(); // เพิ่มบรรทัดนี้เพื่อให้ใช้งานไฟล์ .env ได้
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
    faultCode: null,
    pending: false // เพิ่มการประกาศตั้งแต่เริ่มต้น
}; 

let pendingCmdId = null;

// ================= COMMAND =================
let motorCommand = {
    cmd: "NONE",
    timestamp: 0
};
let lastCommandTime = {};
let offlineNotified = false;
let wasOffline = false;

// ================= ONLINE =================
function isOnline() {
    return motorData.lastHeartbeat !== 0 &&
        (Date.now() - motorData.lastHeartbeat) < 20000;
}

// ================= WATCHDOG =================
setInterval(() => {
    if (motorData.pending && motorCommand.timestamp) {
        if (Date.now() - motorCommand.timestamp > 8000) {
            motorData.pending = false;
            pendingCmdId = null;
            motorCommand = { cmd: "NONE", timestamp: 0 };
        }
    }

    const timeout = 30000;

    if (
        motorData.lastHeartbeat !== 0 &&
        Date.now() - motorData.lastHeartbeat > timeout
    ) {
        motorData.state = "STOP";
        motorData.fault = true;
        motorData.faultCode = "ESP32_OFFLINE";

        if (!offlineNotified && SUPER_ADMIN_ID) {
            offlineNotified = true;
            wasOffline = true;

            client.pushMessage(SUPER_ADMIN_ID, {
                type: "text",
                text: "⚠️ ESP32 OFFLINE"
            }).catch(console.error);
        }

        motorCommand = { cmd: "NONE", timestamp: 0 };
    }
}, 5000);

// ================= ADMIN MENU =================
function adminMenu() {
    return `👑 เมนูผู้ดูแลระบบ

📋 users
ดูรายชื่อผู้ใช้ทั้งหมด

✅ approve USER_ID
อนุมัติผู้ใช้

🛑 revoke USER_ID
ยกเลิกสิทธิ์

👑 promote USER_ID
ตั้ง ADMIN

⬇️ demote USER_ID
ลดสิทธิ์ ADMIN

📊 สถานะ
⚙️ เปิด / ปิด

♻️ reset
รีเซ็ต fault

━━━━━━━━━━━━━━
🕒 ${getThaiTime()}`;
}

// ================= INTRO =================
function introMessage(user, isSuperAdmin) {
    const role = (user?.role || "").toLowerCase().trim();

    const canControl =
        isSuperAdmin ||
        role === "admin" ||
        user?.approved === true;

    return `🤖 ระบบควบคุมมอเตอร์อัจฉริยะ

━━━━━━━━━━━━━━━━━━━━
👤 สิทธิ์: ${
        isSuperAdmin
            ? "👑 SUPER ADMIN"
            : role === "admin"
            ? "👑 ADMIN"
            : user?.approved
            ? "USER APPROVED"
            : "USER VIEW ONLY"
    }

━━━━━━━━━━━━━━━━━━━━
📊 สถานะ:
⚙️ มอเตอร์: ${motorData.state}
📶 อุปกรณ์: ${isOnline() ? "ออนไลน์" : "ออฟไลน์"}
⚠️ Fault: ${motorData.fault ? "ผิดปกติ" : "ปกติ"}

━━━━━━━━━━━━━━━━━━━━
📌 คำสั่ง:
${!canControl ? "👉 ดูสถานะได้เท่านั้น" : "👉 เปิด / ปิด / สถานะ"}

🕒 ${getThaiTime()}`;
}

// ================= REPORT =================
app.post('/api/motor/report', async (req, res) => {
    const { state, faultCode } = req.body;

    motorData.lastHeartbeat = Date.now();

    // 🔥 ADD THIS
    motorData.pending = false;
    pendingCmdId = null;
    
    if (state === "RUN" || state === "STOP") {
        motorCommand = { cmd: "NONE", timestamp: 0 };
    }
    
    if (wasOffline && SUPER_ADMIN_ID) {
        wasOffline = false;
        offlineNotified = false;

        client.pushMessage(SUPER_ADMIN_ID, {
            type: "text",
            text: "✅ ESP32 ONLINE"
        }).catch(console.error);
    }

    if (state && state !== motorData.state) {
        motorData.state = state;

        // ================= NOTIFY ADMIN =================
        if (SUPER_ADMIN_ID) {
            let msg = "";

            if (state === "RUN") {
                msg = "✅ มอเตอร์ทำงานแล้ว";
            } else if (state === "STOP") {
                msg = "🛑 มอเตอร์หยุดแล้ว";
            } else if (state === "FAULT") {
                msg = `⚠️ FAULT: ${faultCode || "UNKNOWN"}`;
            }

            if (msg) {
                client.pushMessage(SUPER_ADMIN_ID, {
                    type: "text",
                    text: msg
                }).catch(console.error);
            }
        }
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

// ================= COMMAND API =================
app.get('/api/motor/command', (req, res) => {
    if (motorData.pending && pendingCmdId) {
        if (Date.now() - pendingCmdId > 8000) {
            motorData.pending = false;
            pendingCmdId = null;
            motorCommand = { cmd: "NONE", timestamp: 0 };
        }
    }
    
    res.json({
        command: motorCommand.cmd,
        pending: motorData.pending,
        state: motorData.state,
        fault: motorData.fault,
        faultCode: motorData.faultCode
    });
});

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // รีบตอบกลับ LINE ก่อนเพื่อไม่ให้ Timeout

    for (const event of req.body.events || []) {
        try {
            const userId = event.source.userId;
            const text = event.message?.text?.trim();

            if (!userId || !text) continue;

            const user = await getUser(userId);
            if (!user) continue;

            const isAdmin = userId === SUPER_ADMIN_ID;
            const role = (user?.role || "").toLowerCase().trim();

            const canControl = isAdmin || role === "admin" || user.approved === true;
            const isManageAdmin = isAdmin || role === "admin";

            // ================= START =================
            if (text === "เริ่ม") {
                if (isManageAdmin) {
                    await client.replyMessage(event.replyToken, {
                        type: "text",
                        text: `${introMessage(user, isAdmin)}\n\n━━━━━━━━━━━━━━\n\n${adminMenu()}`
                    });
                } else {
                    await client.replyMessage(event.replyToken, {
                        type: "text",
                        text: introMessage(user, isAdmin)
                    });
                }
                continue;
            }

            // ================= USERS =================
            if (text === "users") {
                if (!isManageAdmin) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์" });
                    continue;
                }

                const users = await User.find().sort({ createdAt: -1 });

                if (!users.length) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "ไม่มีข้อมูลผู้ใช้" });
                    continue;
                }

                let msg = "👥 รายชื่อผู้ใช้\n\n";
                users.forEach((u, i) => {
                    const uRole = (u.role || "").toLowerCase().trim();
                    const status =
                        u.userId === SUPER_ADMIN_ID ? "👑 SUPER ADMIN" :
                        uRole === "admin" ? "👑 ADMIN" :
                        u.approved ? "✅ APPROVED" : "⏳ WAIT";

                    msg += `${i + 1}. ${status}\n${u.userId}\n\n`;
                });

                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: msg.substring(0, 4900)
                });
                continue;
            }

            // ================= APPROVE =================
            if (text.startsWith("approve ")) {
                if (!isManageAdmin) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์" });
                    continue;
                }

                const targetId = text.replace("approve ", "").trim();
                const target = await User.findOne({ userId: targetId });

                if (!target) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่พบ USER ID" });
                    continue;
                }

                target.approved = true;
                await target.save();

                await client.replyMessage(event.replyToken, { type: "text", text: "✅ อนุมัติผู้ใช้แล้ว" });
                continue;
            }

            // ================= REVOKE =================
            if (text.startsWith("revoke ")) {
                if (!isManageAdmin) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์" });
                    continue;
                }

                const targetId = text.replace("revoke ", "").trim();
                const target = await User.findOne({ userId: targetId });

                if (!target) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่พบ USER ID" });
                    continue;
                }

                target.approved = false;
                if (target.role === "admin") target.role = "user";
                await target.save();

                await client.replyMessage(event.replyToken, { type: "text", text: "🛑 ยกเลิกสิทธิ์แล้ว" });
                continue;
            }

            // ================= PROMOTE =================
            if (text.startsWith("promote ")) {
                if (!isManageAdmin) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์" });
                    continue;
                }

                const targetId = text.replace("promote ", "").trim();
                const target = await User.findOne({ userId: targetId });

                if (!target) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่พบ USER ID" });
                    continue;
                }

                target.role = "admin";
                target.approved = true;
                await target.save();

                await client.replyMessage(event.replyToken, { type: "text", text: "👑 ตั้งเป็น ADMIN แล้ว" });
                continue;
            }

            // ================= DEMOTE =================
            if (text.startsWith("demote ")) {
                if (!isManageAdmin) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์" });
                    continue;
                }

                const targetId = text.replace("demote ", "").trim();
                const target = await User.findOne({ userId: targetId });

                if (!target) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่พบ USER ID" });
                    continue;
                }

                target.role = "user";
                await target.save();

                await client.replyMessage(event.replyToken, { type: "text", text: "🛑 ลดสิทธิ์ ADMIN แล้ว" });
                continue;
            }

            // ================= RESET =================
            if (text === "reset") {
                if (!canControl) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์ควบคุม" });
                    continue;
                }
                if (!isOnline()) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⚠️ ระบบ OFFLINE อยู่" });
                    continue;
                }
                if (!motorData.fault) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "✅ ระบบไม่มี FAULT" });
                    continue;
                }
                if (lastCommandTime[userId] && Date.now() - lastCommandTime[userId] < 2000) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⏳ กรุณารอ 2 วินาที" });
                    continue;
                }

                lastCommandTime[userId] = Date.now();
                motorCommand = { cmd: "RESET", timestamp: Date.now() };

                await client.replyMessage(event.replyToken, { type: "text", text: "♻️ ส่งคำสั่ง RESET แล้ว" });
                continue;
            }
            
            // ================= STATUS =================
            if (text === "สถานะ") {
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `📊 สถานะ\n⚙️ ${motorData.state}\n📶 ${isOnline() ? "ONLINE" : "OFFLINE"}\n⚠️ Fault: ${motorData.fault ? "YES" : "NO"}`
                });
                continue;
            }

            // ================= OPEN =================
            if (text === "เปิด") {
                if (motorData.pending) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⏳ กำลังส่งคำสั่งอยู่..." });
                    continue;
                }
                if (!canControl) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์ควบคุม" });
                    continue;
                }
                if (!isOnline()) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⚠️ ระบบ OFFLINE อยู่" });
                    continue;
                }
                if (motorData.state === "RUN") {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⚠️ มอเตอร์กำลังทำงานอยู่" });
                    continue;
                }
                if (lastCommandTime[userId] && Date.now() - lastCommandTime[userId] < 2000) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⏳ กรุณารอ 2 วินาที" });
                    continue;
                }

                lastCommandTime[userId] = Date.now();
                motorData.pending = true;
                
                const cmdId = Date.now();
                pendingCmdId = cmdId;
                motorCommand = { cmd: "ON", timestamp: cmdId };

                await client.replyMessage(event.replyToken, { type: "text", text: "⚙️ ส่งคำสั่งเปิดแล้ว" });
                continue;
            }

            // ================= CLOSE =================
            if (text === "ปิด") {
                if (motorData.pending) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⏳ กำลังส่งคำสั่งอยู่..." });
                    continue;
                }
                if (!canControl) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่มีสิทธิ์ควบคุม" });
                    continue;
                }
                if (!isOnline()) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⚠️ ระบบ OFFLINE อยู่" });
                    continue;
                }
                if (motorData.state === "STOP") {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⚠️ มอเตอร์หยุดอยู่แล้ว" });
                    continue;
                }
                if (lastCommandTime[userId] && Date.now() - lastCommandTime[userId] < 2000) {
                    await client.replyMessage(event.replyToken, { type: "text", text: "⏳ กรุณารอ 2 วินาที" });
                    continue;
                }

                lastCommandTime[userId] = Date.now();
                motorData.pending = true;
                
                const cmdId = Date.now();
                pendingCmdId = cmdId;
                motorCommand = { cmd: "OFF", timestamp: cmdId };

                await client.replyMessage(event.replyToken, { type: "text", text: "🛑 ส่งคำสั่งปิดแล้ว" });
                continue;
            }

            // ================= UNKNOWN COMMAND =================
            await client.replyMessage(event.replyToken, {
                type: "text",
                text: "พิมพ์ 'เริ่ม' เพื่อใช้งาน"
            });

        } catch (error) {
            console.error("Webhook Error:", error);
        }
    }
});

// ================= START =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`SERVER STARTED ON PORT ${PORT}`);
});
