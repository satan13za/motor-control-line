const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Motor Control Server Online");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server Running");
});
