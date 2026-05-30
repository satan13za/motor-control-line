const axios = require("axios");

// 🔥 เปลี่ยนเป็น Render URL ของคุณ
const SERVER = "https://motor-control-line.onrender.com";

let LED = 0;
let RELAY = 0;
let MOTOR = "STOP";

console.log("🤖 ESP32 SIMULATOR START");

async function loop() {

  try {

    const res = await axios.get(SERVER + "/command");
    const cmd = res.data.command;

    if (cmd !== "NONE") {

      console.log("📩 CMD:", cmd);

      if (cmd === "START") {
        LED = 1;
        RELAY = 1;
        MOTOR = "RUN";
      }

      else if (cmd === "STOP") {
        LED = 0;
        RELAY = 0;
        MOTOR = "STOP";
      }

      else if (cmd === "FAULT") {
        LED = 1;
        RELAY = 0;
        MOTOR = "FAULT";
      }

      else if (cmd === "RESET") {
        LED = 0;
        RELAY = 0;
        MOTOR = "STOP";
      }

      await axios.post(SERVER + "/updateStatus", {
        motor: MOTOR,
        fault: MOTOR === "FAULT" ? "ACTIVE" : "NORMAL"
      });

      await axios.get(SERVER + "/clear");

      console.log("⚙️ STATUS:");
      console.log("LED:", LED);
      console.log("RELAY:", RELAY);
      console.log("MOTOR:", MOTOR);

    }

  } catch (err) {
    console.log("❌ ERROR:", err.message);
  }

}

setInterval(loop, 2000);
