const express = require("express");
const classController = require("../controllers/classController");
const classBookingController = require("../controllers/classBookingController");
const trainerBookingController = require("../controllers/trainerBookingController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "running" });
});

// ===== CLASS BOOKING ENDPOINTS =====
// Get available classes for a specific date
router.get("/classes/available", classController.getAvailableClasses);

// Register for a class (with concurrency control)
router.post("/classes", classBookingController.registerForClass);

// Cancel a class booking
router.post("/cancel", classBookingController.cancelBooking);

// ===== TRAINER BOOKING ENDPOINTS =====
// Get available time slots for a trainer on a specific date
router.get(
  "/trainers/:trainerId/availability",
  trainerBookingController.getTrainerAvailability
);

// Request a trainer booking
router.post("/trainers", trainerBookingController.requestTrainerBooking);

// Confirm a trainer booking (trainer accepts)
router.post(
  "/trainers/confirm",
  trainerBookingController.confirmTrainerBooking
);

module.exports = router;
