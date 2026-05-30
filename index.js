const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===============================
// LINE TOKEN (Render ENV)
// ===============================
const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ===============================
// SYSTEM VARIABLES
// ===============================
let command = "NONE";

let systemStatus = {
  motor: "STOP",
  fault: "NORMAL",
  online: false,
  update: "-"
};

// ===============================
// UPDATE TIME
// ===============================
function updateTime() {
  systemStatus.update = new Date().toLocaleString("th-TH");
}

// ===============================
// LINE REPLY FUNCTION
// ===============================
async function replyMessage(replyToken, text) {

  try {

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
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

    console.log("✅ Reply success");

  } catch (err) {

    console.log("❌ Reply error:");
    console.log(err.response?.data || err.message);

  }

}

// ===============================
// HOME TEST
// ===============================
app.get("/", (req, res) => {
  res.send("Motor Control Server Online");
});

// ===============================
// WEBHOOK (IMPORTANT FIX)
// ===============================
app.post("/webhook", (req, res) => {

  // 🔴 ต้องตอบทันที ห้ามรอ
  res.sendStatus(200);

  const events = req.body.events;

  if (!events || events.length === 0) return;

  const event = events[0];

  if (event.type !== "message") return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log("📩 MESSAGE:", text);

  // ===============================
  // ทำงานแบบ async หลังตอบ 200 แล้ว
  // ===============================
  setTimeout(async () => {

    // 🔵 OPEN
    if (text === "เปิด") {

      command = "START";
      systemStatus.motor = "RUN";
      systemStatus.online = true;
      updateTime();

      await replyMessage(replyToken, "🟢 เปิดมอเตอร์แล้ว");

    }

    // 🔴 STOP
    else if (text === "ปิด") {

      command = "STOP";
      systemStatus.motor = "STOP";
      updateTime();

      await replyMessage(replyToken, "🔴 ปิดมอเตอร์แล้ว");

    }

    // ⚠️ FAULT
    else if (text === "fault") {

      command = "FAULT";
      systemStatus.fault = "ACTIVE";
      updateTime();

      await replyMessage(replyToken, "⚠️ จำลอง Fault แล้ว");

    }

    // 🔄 RESET
    else if (text === "reset") {

      command = "RESET";
      systemStatus.fault = "NORMAL";
      systemStatus.motor = "STOP";
      updateTime();

      await replyMessage(replyToken, "✅ Reset ระบบแล้ว");

    }

    // 📊 STATUS
    else if (text === "สถานะ") {

      await replyMessage(
        replyToken,
`📊 สถานะระบบ

Motor : ${systemStatus.motor}
Fault : ${systemStatus.fault}
Online : ${systemStatus.online ? "YES" : "NO"}
Update : ${systemStatus.update}`
      );

    }

    // ❓ DEFAULT
    else {

      await replyMessage(
        replyToken,
`คำสั่ง:
- เปิด
- ปิด
- สถานะ
- fault
- reset`
      );

    }

  }, 300);

});

// ===============================
// ESP32 GET COMMAND
// ===============================
app.get("/command", (req, res) => {
  res.json({ command });
});

// ===============================
// CLEAR COMMAND
// ===============================
app.get("/clear", (req, res) => {
  command = "NONE";
  res.json({ result: "OK" });
});

// ===============================
// UPDATE STATUS (ESP32)
// ===============================
app.post("/updateStatus", (req, res) => {

  try {

    systemStatus.motor = req.body.motor || systemStatus.motor;
    systemStatus.fault = req.body.fault || systemStatus.fault;
    systemStatus.online = true;

    updateTime();

    console.log("⚙️ STATUS UPDATE:", systemStatus);

    res.json({ result: "OK" });

  } catch (err) {

    console.log(err);
    res.status(500).json({ error: err.message });

  }

});

// ===============================
// STATUS CHECK
// ===============================
app.get("/status", (req, res) => {
  res.json(systemStatus);
});

// ===============================
// OFFLINE CHECK
// ===============================
setInterval(() => {

  try {

    if (systemStatus.update !== "-") {

      const last = new Date(systemStatus.update).getTime();
      const now = new Date().getTime();

      if (now - last > 60000) {
        systemStatus.online = false;
      }

    }

  } catch (err) {
    console.log(err.message);
  }

}, 10000);

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("================================");
  console.log("Motor Control Server Running");
  console.log("================================");
});
