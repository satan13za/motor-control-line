const axios = require("axios");

// ==========================
// เปลี่ยนเป็น URL Render ของคุณ
// ==========================
const SERVER = "https://motor-control-line.onrender.com";

let LED = 0;
let RELAY = 0;
let MOTOR = "STOP";

console.log("🟢 ESP32 SIMULATOR START");

// ==========================
// LOOP ทำงานเหมือน ESP32
// ==========================
async function loop() {

  try {

    // ==========================
    // ดึงคำสั่งจาก Server
    // ==========================
    const res = await axios.get(SERVER + "/command");
    const cmd = res.data.command;

    if (cmd !== "NONE") {

      console.log("📩 CMD:", cmd);

      // ==========================
      // START
      // ==========================
      if (cmd === "START") {
        LED = 1;
        RELAY = 1;
        MOTOR = "RUN";
      }

      // ==========================
      // STOP
      // ==========================
      else if (cmd === "STOP") {
        LED = 0;
        RELAY = 0;
        MOTOR = "STOP";
      }

      // ==========================
      // FAULT
      // ==========================
      else if (cmd === "FAULT") {
        LED = 1;
        RELAY = 0;
        MOTOR = "FAULT";
      }

      // ==========================
      // RESET
      // ==========================
      else if (cmd === "RESET") {
        LED = 0;
        RELAY = 0;
        MOTOR = "STOP";
      }

      // ==========================
      // ส่งสถานะกลับ Server
      // ==========================
      await axios.post(SERVER + "/updateStatus", {
        motor: MOTOR,
        fault: MOTOR === "FAULT" ? "ACTIVE" : "NORMAL"
      });

      // clear command
      await axios.get(SERVER + "/clear");

      console.log("💾 STATUS:");
      console.log("LED:", LED);
      console.log("RELAY:", RELAY);
      console.log("MOTOR:", MOTOR);
      console.log("----------------------");

    }

  } catch (err) {
    console.log("❌ ERROR:", err.message);
  }

}

// ==========================
// loop ทุก 2 วินาที
// ==========================
setInterval(loop, 2000);
