const db = require("../db");

/**
 * Convert a date string (YYYY-MM-DD) to day of week abbreviation
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Day of week: 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
 */
function getDayOfWeek(dateString) {
  const date = new Date(dateString + "T00:00:00Z");
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
 * Get available time slots for a trainer on a specific date
 * @param {number} trainerId - Trainer ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of available slots
 * @throws {Error} With specific error codes
 */
async function getTrainerAvailability(trainerId, date) {
  try {
    // 1. Determine weekday
    const dayOfWeek = getDayOfWeek(date);

    // 2. Query trainer_availabilities for this trainer
    const [availabilities] = await db.execute(
      `SELECT 
        availability_id,
        trainer_id,
        day_of_week,
        specific_date,
        start_time,
        end_time,
        max_concurrent_bookings,
        is_recurring
      FROM trainer_availabilities
      WHERE trainer_id = ?
        AND status = 'Active'
        AND (
          (specific_date = ? AND is_recurring = 0)
          OR (day_of_week = ? AND is_recurring = 1)
        )
      ORDER BY start_time ASC`,
      [trainerId, date, dayOfWeek]
    );

    if (availabilities.length === 0) {
      return [];
    }

    // 3. For each availability slot, check capacity and count bookings
    const slotsWithCapacity = await Promise.all(
      availabilities.map(async (slot) => {
        // Format times for the specific date
        const slotDate = date; // YYYY-MM-DD
        const startDateTime = `${slotDate} ${formatTime(slot.start_time)}`;
        const endDateTime = `${slotDate} ${formatTime(slot.end_time)}`;

        // Count bookings that overlap with this slot
        // Valid bookings: status IN ('Pending', 'Confirmed')
        // Overlap detection: booking starts before slot ends AND booking ends after slot starts
        const [countResult] = await db.execute(
          `SELECT COUNT(*) AS booking_count
           FROM trainer_bookings
           WHERE trainer_id = ?
             AND status IN ('Pending', 'Confirmed')
             AND start_time < ?
             AND DATE_ADD(start_time, INTERVAL duration_minutes MINUTE) > ?`,
          [trainerId, endDateTime, startDateTime]
        );

        const currentBookings = countResult[0].booking_count;
        const remainingSpots = Math.max(
          slot.max_concurrent_bookings - currentBookings,
          0
        );

        return {
          availability_id: slot.availability_id,
          trainer_id: slot.trainer_id,
          date,
          start_time: formatTime(slot.start_time),
          end_time: formatTime(slot.end_time),
          max_concurrent_bookings: slot.max_concurrent_bookings,
          current_bookings: currentBookings,
          remaining_spots: remainingSpots,
          is_available: remainingSpots > 0,
          is_recurring: slot.is_recurring,
          type: slot.specific_date ? "one-off" : "recurring",
        };
      })
    );

    // 4. Filter and return only available slots
    return slotsWithCapacity.filter((slot) => slot.is_available);
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Format TIME field to HH:MM:SS string
 * @param {string|Date} time - TIME value from MySQL
 * @returns {string} Formatted time HH:MM:SS
 */
function formatTime(time) {
  if (typeof time === "string") {
    return time; // Already formatted
  }
  // If it's a Date or other type, convert to string
  const str = String(time);
  if (str.includes(":")) {
    return str;
  }
  // Fallback
  return time.toString().padStart(8, "0");
}

/**
 * Request a trainer booking
 * @param {number} memberId - Member ID
 * @param {number} trainerId - Trainer ID
 * @param {string} startTime - Start time in format "YYYY-MM-DD HH:MM:SS"
 * @param {number} duration - Duration in minutes
 * @returns {Promise<Object>} Booking details
 * @throws {Error} With specific error codes
 */
async function requestTrainerBooking(memberId, trainerId, startTime, duration) {
  let connection;

  try {
    // 1. Parse and validate start time
    const startDateTime = new Date(startTime);
    if (startDateTime < new Date()) {
      const error = new Error("Cannot book a slot in the past");
      error.code = "BOOKING_IN_PAST";
      error.statusCode = 400;
      throw error;
    }
    if (isNaN(startDateTime.getTime())) {
      const error = new Error(
        "Invalid startTime format. Use YYYY-MM-DD HH:MM:SS"
      );
      error.code = "INVALID_DATE_FORMAT";
      error.statusCode = 400;
      throw error;
    }

    // Validate duration
    if (!Number.isInteger(duration) || duration <= 0) {
      const error = new Error("Duration must be a positive integer (minutes)");
      error.code = "INVALID_DURATION";
      error.statusCode = 400;
      throw error;
    }

    // 2. Start transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Extract date and time parts
    const date = startTime.substring(0, 10); // YYYY-MM-DD
    const timeStr = startTime.substring(11, 19); // HH:MM:SS
    const dayOfWeek = getDayOfWeek(date);

    // Calculate end time (start_time + duration in minutes)
    // Convert HH:MM:SS to seconds, add duration, convert back
    const [timeCalc] = await connection.execute(
      `SELECT SEC_TO_TIME(TIME_TO_SEC(?) + (? * 60)) AS end_time_calc`,
      [timeStr, duration]
    );
    const endTimeCalc = timeCalc[0].end_time_calc;

    // 3. Validate availability slot exists
    // Check that the availability slot covers the entire booking duration
    const [availSlots] = await connection.execute(
      `SELECT 
        availability_id,
        max_concurrent_bookings,
        start_time,
        end_time
      FROM trainer_availabilities
      WHERE trainer_id = ?
        AND status = 'Active'
        AND (
          (specific_date = ? AND is_recurring = 0)
          OR (day_of_week = ? AND is_recurring = 1)
        )
        AND start_time <= ?
        AND end_time >= SEC_TO_TIME(TIME_TO_SEC(?) + (? * 60))
      FOR UPDATE`,
      [trainerId, date, dayOfWeek, timeStr, timeStr, duration]
    );

    if (availSlots.length === 0) {
      await connection.rollback();
      const error = new Error(
        "No available slot for trainer at this time on this date"
      );
      error.code = "NO_AVAILABILITY_SLOT";
      error.statusCode = 404;
      throw error;
    }

    const availSlot = availSlots[0];

    // Calculate end time properly using TIME arithmetic
    // Extract time component and add duration
    const [endTimeResult] = await connection.execute(
      `SELECT SEC_TO_TIME(TIME_TO_SEC(?) + (? * 60)) AS calculated_end_time`,
      [timeStr, duration]
    );
    const endTimeStr = endTimeResult[0].calculated_end_time;

    // Format times as DATETIME for comparison (keep date intact, only use calculated time)
    const startDateTime_str = startTime; // YYYY-MM-DD HH:MM:SS from input
    const endDateTime_str = `${date} ${endTimeStr}`; // YYYY-MM-DD + calculated HH:MM:SS

    // 4. Check for booking conflicts (overbooking at trainer level)
    // Count existing bookings that overlap with the requested time
    // Overlap: booking_start < requested_end AND booking_end > requested_start

    const [trainerConflictCount] = await connection.execute(
      `SELECT COUNT(*) AS conflict_count
       FROM trainer_bookings
       WHERE trainer_id = ?
         AND status IN ('Pending', 'Confirmed')
         AND start_time < ?
         AND DATE_ADD(start_time, INTERVAL duration_minutes MINUTE) > ?`,
      [trainerId, endDateTime_str, startDateTime_str]
    );

    const currentTrainerBookings = trainerConflictCount[0].conflict_count;
    if (currentTrainerBookings + 1 > availSlot.max_concurrent_bookings) {
      await connection.rollback();
      const error = new Error("Trainer slot is at full capacity");
      error.code = "TRAINER_SLOT_FULL";
      error.statusCode = 409;
      throw error;
    }

    // 5. Check member doesn't have another booking at same time (time conflict)
    const [memberTimeConflict] = await connection.execute(
      `SELECT COUNT(*) AS conflict_count
       FROM trainer_bookings
       WHERE member_id = ?
         AND status IN ('Pending', 'Confirmed')
         AND start_time < ?
         AND DATE_ADD(start_time, INTERVAL duration_minutes MINUTE) > ?`,
      [memberId, endDateTime_str, startDateTime_str]
    );

    if (memberTimeConflict[0].conflict_count > 0) {
      await connection.rollback();
      const error = new Error(
        "Member already has another booking at this time"
      );
      error.code = "MEMBER_TIME_CONFLICT";
      error.statusCode = 409;
      throw error;
    }

    // 6. Create booking
    const [insertResult] = await connection.execute(
      `INSERT INTO trainer_bookings
       (trainer_id, member_id, start_time, duration_minutes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Pending', NOW(), NOW())`,
      [trainerId, memberId, startTime, duration]
    );

    const bookingId = insertResult.insertId;

    // 7. Commit transaction
    await connection.commit();

    // 8. Return success response
    return {
      booking_id: bookingId,
      trainer_id: trainerId,
      member_id: memberId,
      start_time: startTime,
      duration_minutes: duration,
      status: "Pending",
      message:
        "Booking request created successfully. Awaiting trainer confirmation.",
    };
  } catch (error) {
    // Rollback on error
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    throw error;
  } finally {
    // Release connection
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Confirm a trainer booking (for trainer to accept)
 * @param {number} bookingId - Booking ID
 * @param {number} trainerId - Trainer ID (for authorization)
 * @returns {Promise<Object>} Updated booking details
 * @throws {Error} With specific error codes
 */
async function confirmTrainerBooking(bookingId, trainerId) {
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Get booking and verify ownership
    const [bookingRows] = await connection.execute(
      `SELECT booking_id, trainer_id, status, member_id, start_time, duration_minutes
       FROM trainer_bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      const error = new Error("Booking not found");
      error.code = "BOOKING_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    const booking = bookingRows[0];

    // Verify trainer owns this booking
    if (booking.trainer_id !== trainerId) {
      await connection.rollback();
      const error = new Error(
        "Unauthorized: Cannot confirm another trainer's booking"
      );
      error.code = "UNAUTHORIZED";
      error.statusCode = 403;
      throw error;
    }

    // Check if already confirmed
    if (booking.status !== "Pending") {
      await connection.rollback();
      const error = new Error(`Booking is already ${booking.status}`);
      error.code = "INVALID_STATUS";
      error.statusCode = 409;
      throw error;
    }

    // Update status to Confirmed
    await connection.execute(
      `UPDATE trainer_bookings
       SET status = 'Confirmed', updated_at = NOW()
       WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.commit();

    return {
      booking_id: bookingId,
      status: "Confirmed",
      trainer_id: trainerId,
      member_id: booking.member_id,
      start_time: booking.start_time,
      duration_minutes: booking.duration_minutes,
      message: "Booking confirmed successfully",
    };
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Reject a trainer booking
 * @param {number} bookingId - Booking ID
 * @param {number} trainerId - Trainer ID (for authorization)
 * @param {string} reason - Reason for rejection (optional)
 * @returns {Promise<Object>} Updated booking details
 */
async function rejectTrainerBooking(bookingId, trainerId, reason = null) {
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Get booking and lock row
    const [bookingRows] = await connection.execute(
      `SELECT booking_id, trainer_id, status, member_id 
       FROM trainer_bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      const error = new Error("Booking not found");
      error.code = "BOOKING_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    const booking = bookingRows[0];

    // 2. Verify ownership
    if (booking.trainer_id !== trainerId) {
      await connection.rollback();
      const error = new Error(
        "Unauthorized: Cannot reject another trainer's booking"
      );
      error.code = "UNAUTHORIZED";
      error.statusCode = 403;
      throw error;
    }

    // 3. Validate status
    // Chỉ cho phép từ chối nếu đang Pending (hoặc Confirmed nếu muốn cho phép hủy kèo sau khi đã nhận)
    if (booking.status !== "Pending") {
      await connection.rollback();
      const error = new Error(
        `Cannot reject booking. Current status: ${booking.status}`
      );
      error.code = "INVALID_STATUS_TRANSITION";
      error.statusCode = 409;
      throw error;
    }

    // 4. Update status to Rejected
    // Lưu lý do từ chối vào cột 'note' nếu có
    await connection.execute(
      `UPDATE trainer_bookings 
       SET status = 'Rejected', 
           note = ?, 
           updated_at = NOW() 
       WHERE booking_id = ?`,
      [reason ? `Rejection reason: ${reason}` : null, bookingId]
    );

    await connection.commit();

    return {
      booking_id: bookingId,
      status: "Rejected",
      message: "Booking rejected successfully",
    };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getTrainerAvailability,
  requestTrainerBooking,
  confirmTrainerBooking,
  rejectTrainerBooking,
  getDayOfWeek,
};
