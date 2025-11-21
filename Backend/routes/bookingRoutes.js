const express = require("express");
const classController = require("../controllers/classController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "running" });
});

// Get available classes for a specific date
router.get("/classes/available", classController.getAvailableClasses);

module.exports = router;

