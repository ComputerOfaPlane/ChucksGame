const express = require("express");
const cors = require("cors");
const authMiddleware = require("../src/middleware/auth.middleware");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth.routes"));

// Test Route
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});


app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user
  });
});

// Health Check Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

module.exports = app;