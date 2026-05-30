const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

app.get("/", (req, res) => {
  res.send("Motor Control Server Online");
});

async function replyMessage(replyToken, text) {

  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: replyToken,
      messages: [
        {
          type: "text",
          text: text
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

    const text = event.message.text;
    const replyToken = event.replyToken;

    console.log("Message:", text);

    if (text === "เปิด") {

      await replyMessage(
        replyToken,
        "🟢 รับคำสั่งเปิดมอเตอร์แล้ว"
      );

    }

    else if (text === "ปิด") {

      await replyMessage(
        replyToken,
        "🔴 รับคำสั่งปิดมอเตอร์แล้ว"
      );

    }

    else if (text === "สถานะ") {

      await replyMessage(
        replyToken,
        "📋 สถานะปัจจุบัน : STOP"
      );

    }

    else if (text === "reset") {

      await replyMessage(
        replyToken,
        "✅ รีเซ็ตระบบเรียบร้อย"
      );

    }

    else {

      await replyMessage(
        replyToken,
        "คำสั่งที่ใช้ได้:\nเปิด\nปิด\nสถานะ\nreset"
      );

    }

    res.sendStatus(200);

  } catch (err) {

    console.error(err);

    res.sendStatus(500);

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log("Server Running");

});
