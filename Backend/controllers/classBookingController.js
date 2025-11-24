const classBookingService = require("../services/classBookingService");

/**
 * Validate request body for class registration
 * @param {Object} body - Request body
 * @returns {Object} Validation result with error if invalid
 */
function validateRegisterRequest(body) {
  // Check if body exists
  if (!body || typeof body !== "object") {
    return {
      valid: false,
      error: "Request body is required and must be valid JSON",
      statusCode: 400,
    };
  }

  if (!body.memberId) {
    return {
      valid: false,
      error: "Missing required field: memberId",
      statusCode: 400,
    };
  }

  if (!body.classScheduleId) {
    return {
      valid: false,
      error: "Missing required field: classScheduleId",
      statusCode: 400,
    };
  }

  if (typeof body.memberId !== "number" || body.memberId <= 0) {
    return {
      valid: false,
      error: "memberId must be a positive integer",
      statusCode: 400,
    };
  }

  if (typeof body.classScheduleId !== "number" || body.classScheduleId <= 0) {
    return {
      valid: false,
      error: "classScheduleId must be a positive integer",
      statusCode: 400,
    };
  }

  if (!Number.isInteger(body.memberId)) {
    return {
      valid: false,
      error: "memberId must be an integer",
      statusCode: 400,
    };
  }

  if (!Number.isInteger(body.classScheduleId)) {
    return {
      valid: false,
      error: "classScheduleId must be an integer",
      statusCode: 400,
    };
  }

  return { valid: true };
}

/**
 * POST /api/booking/classes
 * Register a member for a recurring class
 * @param {Request} req
 * @param {Response} res
 */
async function registerForClass(req, res) {
  try {
    // Validate request body
    const validation = validateRegisterRequest(req.body);
    if (!validation.valid) {
      return res.status(validation.statusCode).json({
        error: "Validation Error",
        message: validation.error,
      });
    }

    const { memberId, classScheduleId } = req.body;

    // Call service to register for class
    const booking = await classBookingService.registerForClass(
      memberId,
      classScheduleId
    );

    // Return 201 Created with booking details
    res.status(201).json({
      success: true,
      data: booking,
      message: "Successfully registered for class",
    });
  } catch (error) {
    console.error("Error in registerForClass:", error);

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
      message: "An unexpected error occurred while registering for the class",
    });
  }
}

/**
 * POST /api/booking/cancel
 * Cancel a member's class booking
 * @param {Request} req
 * @param {Response} res
 */
async function cancelBooking(req, res) {
  try {
    // Validate request body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Validation Error",
        message: "Request body is required and must be valid JSON",
      });
    }

    if (!req.body.bookingId) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Missing required field: bookingId",
      });
    }

    if (
      typeof req.body.bookingId !== "number" ||
      req.body.bookingId <= 0 ||
      !Number.isInteger(req.body.bookingId)
    ) {
      return res.status(400).json({
        error: "Validation Error",
        message: "bookingId must be a positive integer",
      });
    }

    const { bookingId } = req.body;
    const memberId = req.body.memberId || req.user?.id; // Get from request body or authenticated user

    if (!memberId) {
      return res.status(400).json({
        error: "Validation Error",
        message: "memberId is required (provide in body or authenticate)",
      });
    }

    if (typeof memberId !== "number" || memberId <= 0) {
      return res.status(400).json({
        error: "Validation Error",
        message: "memberId must be a positive integer",
      });
    }

    // Call service to cancel booking
    const result = await classBookingService.cancelBooking(bookingId, memberId);

    res.status(200).json({
      success: true,
      data: result,
      message: "Booking canceled successfully",
    });
  } catch (error) {
    console.error("Error in cancelBooking:", error);

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
      message: "An unexpected error occurred while canceling the booking",
    });
  }
}

module.exports = {
  registerForClass,
  cancelBooking,
};
