const db = require("../db");

/**
 * Convert a date string (YYYY-MM-DD) to day of week abbreviation
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Day of week: 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
 */
function getDayOfWeek(dateString) {
  const date = new Date(dateString + "T00:00:00Z"); // Avoid timezone drift
  const day = date.getUTCDay();

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
  // 4. Count bookings that are active on the requested date
  // 5. A booking is active on a date if: booking_start_date <= date AND (booking_end_date IS NULL OR booking_end_date >= date)
  const query = `
    SELECT 
      cs.schedule_id,
      c.class_name,
      cs.start_time,
      cs.end_time,
      cs.capacity,
      cs.trainer_id,
      ? AS date,
      COALESCE(cb_counts.booked_count, 0) AS booked_count
    FROM class_schedules cs
    INNER JOIN classes c ON cs.class_id = c.class_id
    LEFT JOIN (
      SELECT 
        class_schedule_id,
        COUNT(*) AS booked_count
      FROM class_bookings
      WHERE status = 'Active'
        AND booking_start_date <= ?
        AND (booking_end_date IS NULL OR booking_end_date >= ?)
      GROUP BY class_schedule_id
    ) AS cb_counts
      ON cb_counts.class_schedule_id = cs.schedule_id
    WHERE 
      c.is_active = 1
      AND cs.day_of_week = ?
      AND (cs.valid_from IS NULL OR cs.valid_from <= ?)
      AND (cs.valid_until IS NULL OR cs.valid_until >= ?)
    ORDER BY cs.start_time ASC
  `;

  try {
    const [rows] = await db.execute(query, [
      date, // Selected date placeholder
      date, // booking_start_date <= date (for active subscriptions check)
      date, // booking_end_date >= date (for active subscriptions check)
      dayOfWeek, // Day of week match
      date, // valid_from <= date
      date, // valid_until >= date
    ]);

    return rows.map((row) => {
      const bookedCount = Number(row.booked_count) || 0;
      const availableSlots = Math.max(Number(row.capacity) - bookedCount, 0);

      return {
        ...row,
        booked_count: bookedCount,
        available_slots: availableSlots,
        is_full: availableSlots <= 0,
      };
    });
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

module.exports = {
  getAvailableClasses,
  getDayOfWeek, // Export for testing/validation if needed
};
