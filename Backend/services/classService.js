const db = require("../db");

/**
 * Convert a date string (YYYY-MM-DD) to day of week abbreviation
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Day of week: 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
 */
function getDayOfWeek(dateString) {
  const date = new Date(dateString + "T00:00:00"); // Add time to avoid timezone issues
  const day = date.getDay();
  
  const daysMap = {
    0: "SUN",
    1: "MON",
    2: "TUE",
    3: "WED",
    4: "THU",
    5: "FRI",
    6: "SAT",
  };
  
  return daysMap[day];
}

/**
 * Get available classes for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of available classes
 */
async function getAvailableClasses(date) {
  // Convert date to day of week
  const dayOfWeek = getDayOfWeek(date);
  
  // SQL Query with JOIN and conditions
  // Conditions:
  // 1. Class must be active
  // 2. Day of week must match
  // 3. Date must be within validity range (NULL means no limit)
  const query = `
    SELECT 
      cs.schedule_id,
      c.class_name,
      cs.start_time,
      cs.end_time,
      cs.capacity,
      cs.trainer_id,
      ? as date
    FROM class_schedules cs
    INNER JOIN classes c ON cs.class_id = c.class_id
    WHERE 
      c.is_active = 1
      AND cs.day_of_week = ?
      AND (cs.valid_from IS NULL OR cs.valid_from <= ?)
      AND (cs.valid_until IS NULL OR cs.valid_until >= ?)
    ORDER BY cs.start_time ASC
  `;
  
  try {
    const [rows] = await db.execute(query, [
      date,       // For the date field in SELECT
      dayOfWeek,  // For day_of_week condition
      date,       // For valid_from <= date
      date,       // For valid_until >= date
    ]);
    
    return rows;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

module.exports = {
  getAvailableClasses,
  getDayOfWeek, // Export for testing/validation if needed
};

