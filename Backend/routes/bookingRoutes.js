const express = require("express");
const classController = require("../controllers/classController");
const classBookingController = require("../controllers/classBookingController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "running" });
});

// Get available classes for a specific date
router.get("/classes/available", classController.getAvailableClasses);

// Register for a class (with concurrency control)
router.post("/classes", classBookingController.registerForClass);

// Cancel a booking
router.post("/cancel", classBookingController.cancelBooking);

module.exports = router;
