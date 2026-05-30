const axios = require("axios");

const server = "https://motor-control-server.onrender.com";

let motor = "STOP";
let fault = "NORMAL";

console.log("SIMULATOR START");

async function loop() {

  try {

    const res = await axios.get(server + "/command");

    const cmd = res.data.command;

    if (cmd !== "NONE") {

      console.log("CMD:", cmd);

      if (cmd === "START") motor = "RUN";
      if (cmd === "STOP") motor = "STOP";
      if (cmd === "FAULT") fault = "ACTIVE";
      if (cmd === "RESET") {
        motor = "STOP";
        fault = "NORMAL";
      }

      await axios.post(server + "/updateStatus", {
        motor,
        fault
      });

      await axios.get(server + "/clear");

      console.log("STATUS UPDATED");

    }

  } catch (err) {
    console.log("ERROR:", err.message);
  }

}

setInterval(loop, 2000);
