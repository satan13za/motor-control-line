const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ======================================
// SYSTEM VARIABLES
// ======================================

let command = "NONE";

let systemStatus = {
  motor: "STOP",
  fault: "NORMAL",
  online: false,
  update: "-"
};

// ======================================
// UPDATE TIME
// ======================================

function updateTime() {
  systemStatus.update =
    new Date().toLocaleString("th-TH");
}

// ======================================
// LINE REPLY
// ======================================

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

// ======================================
// HOME
// ======================================

app.get("/", (req, res) => {

  res.send("Motor Control Server Online");

});

// ======================================
// ESP32 GET COMMAND
// ======================================

app.get("/command", (req, res) => {

  res.json({
    command: command
  });

});

// ======================================
// CLEAR COMMAND
// ======================================

app.get("/clear", (req, res) => {

  command = "NONE";

  res.json({
    result: "OK"
  });

});

// ======================================
// ESP32 UPDATE STATUS
// ======================================

app.post("/updateStatus", (req, res) => {

  try {

    systemStatus.motor =
      req.body.motor || systemStatus.motor;

    systemStatus.fault =
      req.body.fault || systemStatus.fault;

    systemStatus.online = true;

    updateTime();

    console.log("STATUS UPDATE");

    console.log(systemStatus);

    res.json({
      result: "OK"
    });

  }
  catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// ======================================
// GET STATUS
// ======================================

app.get("/status", (req, res) => {

  res.json(systemStatus);

});

// ======================================
// WEBHOOK
// ======================================

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

    const text =
      event.message.text.trim();

    const replyToken =
      event.replyToken;

    console.log("MESSAGE:", text);

    // ==========================
    // START
    // ==========================

    if (text === "เปิด") {

      command = "START";

      await replyMessage(
        replyToken,
        "🟢 ส่งคำสั่งเปิดมอเตอร์แล้ว"
      );

    }

    // ==========================
    // STOP
    // ==========================

    else if (text === "ปิด") {

      command = "STOP";

      await replyMessage(
        replyToken,
        "🔴 ส่งคำสั่งหยุดมอเตอร์แล้ว"
      );

    }

    // ==========================
    // FAULT
    // ==========================

    else if (
      text === "fault" ||
      text === "FAULT"
    ) {

      command = "FAULT";

      await replyMessage(
        replyToken,
        "⚠️ ทดสอบ Fault แล้ว"
      );

    }

    // ==========================
    // RESET
    // ==========================

    else if (
      text === "reset" ||
      text === "RESET"
    ) {

      command = "RESET";

      await replyMessage(
        replyToken,
        "✅ ส่งคำสั่ง Reset แล้ว"
      );

    }

    // ==========================
    // STATUS
    // ==========================

    else if (
      text === "สถานะ" ||
      text === "status"
    ) {

      let msg =

`📋 สถานะระบบ

Motor : ${systemStatus.motor}

Fault : ${systemStatus.fault}

Online : ${systemStatus.online ? "YES" : "NO"}

Update :
${systemStatus.update}`;

      await replyMessage(
        replyToken,
        msg
      );

    }

    // ==========================
    // HELP
    // ==========================

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

// ======================================
// OFFLINE CHECK
// ======================================

setInterval(() => {

  try {

    if (
      systemStatus.update !== "-"
    ) {

      const last =
        new Date(
          systemStatus.update
        ).getTime();

      const now =
        new Date().getTime();

      if (
        now - last > 60000
      ) {

        systemStatus.online = false;

      }

    }

  }
  catch (err) {

    console.error(err);

  }

}, 10000);

// ======================================
// START SERVER
// ======================================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    "================================"
  );

  console.log(
    "Motor Control Server Running"
  );

  console.log(
    "================================"
  );

});
