const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Motor Control Server Online");
});

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

    console.log("Message:", text);

    if (text === "เปิด") {
      console.log("START MOTOR");
    }

    else if (text === "ปิด") {
      console.log("STOP MOTOR");
    }

    else if (text === "สถานะ") {
      console.log("STATUS");
    }

    else if (text === "reset") {
      console.log("RESET");
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
