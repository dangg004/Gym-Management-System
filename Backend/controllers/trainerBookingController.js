const trainerBookingService = require("../services/trainerBookingService");

/**
 * Validate date format (YYYY-MM-DD)
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid
 */
function isValidDateFormat(dateString) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  const parts = dateString.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth() + 1;
  const utcDay = date.getUTCDate();

  return (
    !isNaN(date.getTime()) &&
    utcYear === year &&
    utcMonth === month &&
    utcDay === day
  );
}

/**
 * GET /api/booking/trainers/:trainerId/availability
 * Get available time slots for a trainer on a specific date
 * @param {Request} req
 * @param {Response} res
 */
async function getTrainerAvailability(req, res) {
  try {
    const { trainerId } = req.params;
    const { date } = req.query;

    // Validate trainerId
    if (
      !trainerId ||
      !Number.isInteger(parseInt(trainerId)) ||
      parseInt(trainerId) <= 0
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "trainerId must be a positive integer",
      });
    }

    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        error: "Missing required parameter",
        message: "Please provide a date query parameter in YYYY-MM-DD format",
      });
    }

    // Validate date format
    if (!isValidDateFormat(date)) {
      return res.status(400).json({
        error: "Invalid date format",
        message: "Date must be in YYYY-MM-DD format (e.g., 2025-11-24)",
      });
    }

    // Get availability slots
    const availableSlots = await trainerBookingService.getTrainerAvailability(
      parseInt(trainerId),
      date
    );

    res.status(200).json({
      success: true,
      data: {
        trainer_id: parseInt(trainerId),
        date,
        available_slots: availableSlots,
        slot_count: availableSlots.length,
      },
      message:
        availableSlots.length > 0
          ? `Found ${availableSlots.length} available slot(s)`
          : "No available slots for this trainer on this date",
    });
  } catch (error) {
    console.error("Error in getTrainerAvailability:", error);

    if (error.message.includes("Database error")) {
      return res.status(500).json({
        error: "Database error",
        message: "Failed to retrieve trainer availability",
      });
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }
}

/**
 * POST /api/booking/trainers
 * Request a trainer booking
 * @param {Request} req
 * @param {Response} res
 */
async function requestTrainerBooking(req, res) {
  try {
    const { memberId, trainerId, startTime, duration } = req.body;

    // Validate required fields
    if (!memberId) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Missing required field: memberId",
      });
    }

    if (!trainerId) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Missing required field: trainerId",
      });
    }

    if (!startTime) {
      return res.status(400).json({
        error: "Validation Error",
        message:
          "Missing required field: startTime (format: YYYY-MM-DD HH:MM:SS)",
      });
    }

    if (!duration) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Missing required field: duration (in minutes)",
      });
    }

    // Validate field types
    if (
      typeof memberId !== "number" ||
      !Number.isInteger(memberId) ||
      memberId <= 0
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "memberId must be a positive integer",
      });
    }

    if (
      typeof trainerId !== "number" ||
      !Number.isInteger(trainerId) ||
      trainerId <= 0
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "trainerId must be a positive integer",
      });
    }

    if (typeof startTime !== "string" || startTime.trim() === "") {
      return res.status(400).json({
        error: "Validation Error",
        message: "startTime must be a non-empty string",
      });
    }

    if (
      typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration <= 0
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "duration must be a positive integer",
      });
    }

    // Validate startTime format
    const timeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!timeRegex.test(startTime)) {
      return res.status(400).json({
        error: "Validation Error",
        message: "startTime must be in YYYY-MM-DD HH:MM:SS format",
      });
    }

    // Request booking
    const booking = await trainerBookingService.requestTrainerBooking(
      memberId,
      trainerId,
      startTime,
      duration
    );

    res.status(201).json({
      success: true,
      data: booking,
      message: booking.message,
    });
  } catch (error) {
    console.error("Error in requestTrainerBooking:", error);

    // Handle service-specific errors
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.code || "Error",
        message: error.message,
      });
    }

    // Handle unexpected errors
    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred while requesting the booking",
    });
  }
}

/**
 * POST /api/booking/trainers/confirm
 * Confirm a trainer booking (trainer accepts)
 * @param {Request} req
 * @param {Response} res
 */
async function confirmTrainerBooking(req, res) {
  try {
    const { bookingId, trainerId } = req.body;

    // Validate required fields
    if (
      !bookingId ||
      typeof bookingId !== "number" ||
      bookingId <= 0 ||
      !Number.isInteger(bookingId)
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "bookingId must be a positive integer",
      });
    }

    if (
      !trainerId ||
      typeof trainerId !== "number" ||
      trainerId <= 0 ||
      !Number.isInteger(trainerId)
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "trainerId must be a positive integer",
      });
    }

    // Confirm booking
    const result = await trainerBookingService.confirmTrainerBooking(
      bookingId,
      trainerId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    console.error("Error in confirmTrainerBooking:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.code || "Error",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred while confirming the booking",
    });
  }
}

module.exports = {
  getTrainerAvailability,
  requestTrainerBooking,
  confirmTrainerBooking,
};
