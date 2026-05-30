const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// =======================
// SYSTEM STATUS
// =======================

let motorStatus = "STOP";
let faultStatus = "NORMAL";
let systemOnline = true;

let lastUpdate = new Date().toLocaleString("th-TH");

// =======================
// UPDATE TIME
// =======================

function updateTime() {
  lastUpdate = new Date().toLocaleString("th-TH");
}

// =======================
// REPLY LINE
// =======================

async function replyMessage(replyToken, text) {

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
}

// =======================
// HOME
// =======================

app.get("/", (req, res) => {

  res.send("Motor Control Server Online");

});

// =======================
// STATUS API
// =======================

app.get("/status", (req, res) => {

  res.json({
    motor: motorStatus,
    fault: faultStatus,
    online: systemOnline,
    update: lastUpdate
  });

});

// =======================
// START API
// =======================

app.get("/start", (req, res) => {

  motorStatus = "RUN";
  faultStatus = "NORMAL";

  updateTime();

  console.log("START MOTOR");

  res.json({
    result: "RUN"
  });

});

// =======================
// STOP API
// =======================

app.get("/stop", (req, res) => {

  motorStatus = "STOP";

  updateTime();

  console.log("STOP MOTOR");

  res.json({
    result: "STOP"
  });

});

// =======================
// FAULT API
// =======================

app.get("/fault", (req, res) => {

  motorStatus = "FAULT";

  faultStatus = "ACTIVE";

  updateTime();

  console.log("FAULT");

  res.json({
    result: "FAULT"
  });

});

// =======================
// RESET API
// =======================

app.get("/reset", (req, res) => {

  motorStatus = "STOP";

  faultStatus = "NORMAL";

  updateTime();

  console.log("RESET");

  res.json({
    result: "RESET"
  });

});

// =======================
// WEBHOOK
// =======================

app.post("/webhook", async (req, res) => {

  try {

    const events = req.body.events;

    if (!events || events.length === 0) {
      return res.sendStatus(200);
    }

    const event = events[0];

    if (event.type !== "message") {
      return res.sendStatus(200);
    }

    const text = event.message.text.trim();

    const replyToken = event.replyToken;

    console.log("MESSAGE:", text);

    // ==================
    // เปิด
    // ==================

    if (text === "เปิด") {

      motorStatus = "RUN";
      faultStatus = "NORMAL";

      updateTime();

      await replyMessage(
        replyToken,
        "🟢 มอเตอร์กำลังทำงาน"
      );

    }

    // ==================
    // ปิด
    // ==================

    else if (text === "ปิด") {

      motorStatus = "STOP";

      updateTime();

      await replyMessage(
        replyToken,
        "🔴 มอเตอร์หยุดทำงาน"
      );

    }

    // ==================
    // TEST FAULT
    // ==================

    else if (
      text === "fault" ||
      text === "FAULT" ||
      text === "test"
    ) {

      motorStatus = "FAULT";
      faultStatus = "ACTIVE";

      updateTime();

      await replyMessage(
        replyToken,
        "⚠️ Motor Fault Detected ระบบมีปัญหา"
      );

    }

    // ==================
    // RESET
    // ==================

    else if (
      text === "reset" ||
      text === "RESET"
    ) {

      motorStatus = "STOP";
      faultStatus = "NORMAL";

      updateTime();

      await replyMessage(
        replyToken,
        "✅ System Reset Complete"
      );

    }

    // ==================
    // STATUS
    // ==================

    else if (
      text === "สถานะ" ||
      text === "status"
    ) {

      let msg =
`📋 สถานะระบบ

Motor : ${motorStatus}

Fault : ${faultStatus}

Online : ${systemOnline ? "YES" : "NO"}

Update : ${lastUpdate}`;

      await replyMessage(
        replyToken,
        msg
      );

    }

    // ==================
    // HELP
    // ==================

    else {

      await replyMessage(
        replyToken,
`คำสั่งที่ใช้งานได้

เปิด
ปิด
สถานะ
fault
reset`
      );

    }

    res.sendStatus(200);

  }
  catch (err) {

    console.error(err);

    res.sendStatus(500);

  }

});

// =======================
// SERVER
// =======================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log("================================");
  console.log("Motor Control Server Running");
  console.log("================================");

});
