const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===============================
// 🔑 LINE TOKEN
// ===============================
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const USER_ID = process.env.USER_ID;

// ===============================
// ⚙️ SYSTEM STATE
// ===============================
let command = "NONE";

let systemStatus = {
  motor: "STOP",
  fault: "NORMAL",
  online: false,
  lastHeartbeat: 0   // 🔥 ใช้ heartbeat จริง
};

// ===============================
// ⏱️ UPDATE HEARTBEAT
// ===============================
function updateHeartbeat() {
  systemStatus.lastHeartbeat = Date.now();
}

// ===============================
// 📢 LINE PUSH MESSAGE
// ===============================
async function sendLine(text) {

  try {

    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: USER_ID,
        messages: [{ type: "text", text }]
      },
      {
        headers: {
          "Authorization": `Bearer ${TOKEN}`
        }
      }
    );

  } catch (err) {
    console.log("LINE ERROR:", err.message);
  }

}

// ===============================
// 📩 LINE REPLY
// ===============================
async function replyMessage(replyToken, text) {

  try {

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [{ type: "text", text }]
      },
      {
        headers: {
          "Authorization": `Bearer ${TOKEN}`
        }
      }
    );

  } catch (err) {
    console.log("REPLY ERROR:", err.message);
  }

}

// ===============================
// 🟢 WEBHOOK LINE
// ===============================
app.post("/webhook", (req, res) => {

  res.sendStatus(200);

  const events = req.body.events;
  if (!events || events.length === 0) return;

  const event = events[0];
  if (event.type !== "message") return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  setTimeout(async () => {

    if (text === "เปิด") {

      command = "START";
      systemStatus.motor = "RUN";

      await replyMessage(replyToken, "🟢 เปิดระบบแล้ว");

    }

    else if (text === "ปิด") {

      command = "STOP";
      systemStatus.motor = "STOP";

      await replyMessage(replyToken, "🔴 ปิดระบบแล้ว");

      // เคลียร์คำสั่ง
      setTimeout(() => command = "NONE", 2000);

    }

    else if (text === "reset") {

      command = "RESET";
      systemStatus.motor = "STOP";
      systemStatus.fault = "NORMAL";

      await replyMessage(replyToken, "♻️ รีเซ็ตระบบแล้ว");

    }

    else if (text === "สถานะ") {

      await replyMessage(
        replyToken,
`📊 สถานะระบบ
Motor: ${systemStatus.motor}
Fault: ${systemStatus.fault}
Online: ${systemStatus.online ? "YES" : "NO"}`
      );

    }

    else {

      await replyMessage(replyToken, "คำสั่ง: เปิด / ปิด / reset / สถานะ");

    }

  }, 300);

});

// ===============================
// 🤖 ESP32 UPDATE (HEARTBEAT)
// ===============================
app.post("/updateStatus", (req, res) => {

  systemStatus.motor = req.body.motor || systemStatus.motor;
  systemStatus.fault = req.body.fault || systemStatus.fault;

  systemStatus.online = true;
  updateHeartbeat();

  console.log("💓 HEARTBEAT:", systemStatus);

  res.json({ ok: true });

});

// ===============================
// 📡 GET COMMAND
// ===============================
app.get("/command", (req, res) => {
  res.json({ command });
});

// ===============================
// 🧹 CLEAR COMMAND
// ===============================
app.get("/clear", (req, res) => {
  command = "NONE";
  res.json({ ok: true });
});

// ===============================
// 🔴 OFFLINE DETECTION (FIXED)
// ===============================
setInterval(() => {

  const now = Date.now();
  const diff = now - systemStatus.lastHeartbeat;

  if (systemStatus.lastHeartbeat !== 0 && diff > 15000 && systemStatus.online) {

    systemStatus.online = false;

    console.log("🔴 OFFLINE DETECTED");

    sendLine("🔴 ระบบ OFFLINE (ESP32 ไม่ส่ง Heartbeat)");

  }

}, 5000);

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🟢 SERVER ONLINE");
});
