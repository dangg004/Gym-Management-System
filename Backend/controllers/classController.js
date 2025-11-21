const classService = require("../services/classService");

/**
 * Validate date format (YYYY-MM-DD) and ensure it's a valid calendar date
 * Uses UTC to avoid timezone shifting issues
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidDateFormat(dateString) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }
  
  // Parse the date components
  const parts = dateString.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Validate ranges
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  
  // Create date using UTC to avoid timezone shifts
  // Date.UTC(year, monthIndex, day) - note: monthIndex is 0-based
  const date = new Date(Date.UTC(year, month - 1, day));
  // Check if the date is valid and matches the input
  // Compare UTC components to ensure no shifting occurred
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth() + 1; // getUTCMonth() is 0-based
  const utcDay = date.getUTCDate();
  
  return (
    !isNaN(date.getTime()) &&
    utcYear === year &&
    utcMonth === month &&
    utcDay === day
  );
}

/**
 * Get available classes for a specific date
 * GET /api/booking/classes/available?date=YYYY-MM-DD
 */
async function getAvailableClasses(req, res) {
  try {
    const { date } = req.query;
    
    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        error: "Missing required parameter: date",
        message: "Please provide a date in YYYY-MM-DD format",
      });
    }
    
    // Validate date format
    if (!isValidDateFormat(date)) {
      return res.status(400).json({
        error: "Invalid date format",
        message: "Date must be in YYYY-MM-DD format (e.g., 2025-11-20)",
      });
    }
    
    // Get available classes from service
    const classes = await classService.getAvailableClasses(date);
    
    // Return the results
    res.json(classes);
  } catch (error) {
    console.error("Error in getAvailableClasses:", error);
    
    // Handle database errors
    if (error.message.includes("Database error")) {
      return res.status(500).json({
        error: "Database error",
        message: "Failed to retrieve available classes. Please try again later.",
      });
    }
    
    // Handle other errors
    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred",
    });
  }
}

module.exports = {
  getAvailableClasses,
};

