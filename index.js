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
  lastUpdate: Date.now()
};

// ===============================
// ⏱️ UPDATE TIME
// ===============================
function updateTime() {
  systemStatus.lastUpdate = Date.now();
}

// ===============================
// 📢 SEND LINE (PUSH ALERT)
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
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("📩 LINE:", text);

  } catch (err) {
    console.log("❌ LINE ERROR:", err.message);
  }

}

// ===============================
// 📩 REPLY LINE
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
// 🟢 WEBHOOK
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
      systemStatus.online = true;
      updateTime();

      await replyMessage(replyToken, "🟢 เปิดระบบแล้ว");

    }

    else if (text === "ปิด") {

      command = "STOP";
      systemStatus.motor = "STOP";
      updateTime();

      await replyMessage(replyToken, "🔴 ปิดระบบแล้ว");

      // 🔥 RESET หลังปิด (เพิ่มใหม่)
      setTimeout(() => {
        command = "NONE";
      }, 3000);

    }

    else if (text === "reset") {

      command = "RESET";
      systemStatus.motor = "STOP";
      systemStatus.fault = "NORMAL";
      systemStatus.online = false;
      updateTime();

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
// 🤖 ESP32 UPDATE STATUS
// ===============================
app.post("/updateStatus", (req, res) => {

  systemStatus.motor = req.body.motor || systemStatus.motor;
  systemStatus.fault = req.body.fault || systemStatus.fault;
  systemStatus.online = true;

  updateTime();

  console.log("🤖 UPDATE:", systemStatus);

  res.json({ ok: true });

});

// ===============================
// 📡 COMMAND
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
// 🔴 OFFLINE + AUTO RESET SYSTEM (FIXED)
// ===============================
setInterval(() => {

  const now = Date.now();
  const diff = now - systemStatus.lastUpdate;

  // 🔴 OFFLINE DETECT
  if (diff > 30000 && systemStatus.online) {

    systemStatus.online = false;

    console.log("🔴 SYSTEM OFFLINE");

    sendLine("🔴 แจ้งเตือน: ระบบ OFFLINE (ESP32 ไม่ตอบสนอง)");

  }

  // 🔥 AUTO RESET ถ้าค้างนาน
  if (diff > 120000) {

    command = "RESET";
    systemStatus.motor = "STOP";
    systemStatus.fault = "NORMAL";

    console.log("♻️ AUTO RESET SYSTEM");

  }

}, 5000);

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🟢 SYSTEM ONLINE");
});
