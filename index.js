const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===============================
// 🔑 LINE TOKEN
// ===============================
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ===============================
// 📡 SYSTEM STATE
// ===============================
let command = "NONE";

let systemStatus = {
  motor: "STOP",
  fault: "NORMAL",
  online: false,
  lastUpdate: null
};

// ===============================
// ⏰ อัปเดตเวลา
// ===============================
function updateTime() {
  systemStatus.lastUpdate = Date.now();
}

// ===============================
// 📢 ส่งข้อความ LINE
// ===============================
async function sendLine(text) {

  try {

    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: process.env.USER_ID, // 🔥 ใส่ LINE USER ID ของคุณ
        messages: [
          {
            type: "text",
            text
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKEN}`
        }
      }
    );

    console.log("📩 LINE SENT:", text);

  } catch (err) {
    console.log("❌ LINE ERROR:", err.message);
  }

}

// ===============================
// 📢 REPLY (ใช้ตอนกดใน LINE)
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

  res.sendStatus(200); // 🔥 ต้องมาก่อน

  const events = req.body.events;
  if (!events || events.length === 0) return;

  const event = events[0];
  if (event.type !== "message") return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log("📩 LINE:", text);

  setTimeout(async () => {

    if (text === "เปิด") {

      command = "START";
      systemStatus.motor = "RUN";
      systemStatus.online = true;
      updateTime();

      await replyMessage(replyToken, "🟢 เปิดมอเตอร์แล้ว");

    }

    else if (text === "ปิด") {

      command = "STOP";
      systemStatus.motor = "STOP";
      updateTime();

      await replyMessage(replyToken, "🔴 ปิดมอเตอร์แล้ว");

    }

    else if (text === "สถานะ") {

      await replyMessage(
        replyToken,
`📊 สถานะระบบ

มอเตอร์: ${systemStatus.motor}
Fault: ${systemStatus.fault}
Online: ${systemStatus.online ? "YES" : "NO"}`
      );

    }

    else {

      await replyMessage(replyToken, "คำสั่ง: เปิด / ปิด / สถานะ");

    }

  }, 300);

});

// ===============================
// 🤖 ESP32 SIMULATOR UPDATE
// ===============================
app.post("/updateStatus", (req, res) => {

  systemStatus.motor = req.body.motor;
  systemStatus.fault = req.body.fault;

  systemStatus.online = true;
  updateTime();

  console.log("🤖 ESP32 UPDATE:", systemStatus);

  res.json({ ok: true });

});

// ===============================
// 📡 ESP32 ดึงคำสั่ง
// ===============================
app.get("/command", (req, res) => {
  res.json({ command });
});

// ===============================
// 🧹 ล้างคำสั่ง
// ===============================
app.get("/clear", (req, res) => {
  command = "NONE";
  res.json({ ok: true });
});

// ===============================
// 🔴 OFFLINE DETECTION SYSTEM
// ===============================
setInterval(() => {

  const now = Date.now();

  if (systemStatus.lastUpdate) {

    const diff = now - systemStatus.lastUpdate;

    if (diff > 60000 && systemStatus.online) {

      systemStatus.online = false;

      console.log("🔴 SYSTEM OFFLINE");

      // 📢 แจ้ง LINE ทันที
      sendLine("🔴 ระบบ OFFLINE: ไม่มีการเชื่อมต่อ ESP32");

    }

  }

}, 10000);

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("================================");
  console.log("🟢 Motor Control Server ONLINE");
  console.log("================================");
});
