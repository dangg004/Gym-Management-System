const db = require("../db");

/**
 * Register a member for a recurring class with transaction and row locking
 * @param {number} memberId - Member ID
 * @param {number} classScheduleId - Class Schedule ID
 * @returns {Promise<Object>} Booking details
 * @throws {Error} With specific error codes
 */
async function registerForClass(memberId, classScheduleId) {
  let connection;

  try {
    // 1. Start Transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 2. Acquire Lock (SELECT FOR UPDATE)
    // Lock the class_schedules row to prevent other requests from modifying capacity
    // Also fetch related class information
    const [scheduleRows] = await connection.execute(
      `SELECT cs.schedule_id, cs.capacity, cs.valid_from, cs.valid_until, c.is_active
       FROM class_schedules cs
       INNER JOIN classes c ON cs.class_id = c.class_id
       WHERE cs.schedule_id = ? 
       FOR UPDATE`,
      [classScheduleId]
    );

    // Validation: Schedule not found
    if (scheduleRows.length === 0) {
      await connection.rollback();
      const error = new Error("Class schedule not found");
      error.code = "SCHEDULE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    const schedule = scheduleRows[0];
    const capacity = schedule.capacity;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC format

    // Validation: Class is not active
    if (!schedule.is_active) {
      await connection.rollback();
      const error = new Error("This class is no longer active");
      error.code = "CLASS_INACTIVE";
      error.statusCode = 410; // Gone
      throw error;
    }

    // Convert valid_from and valid_until to YYYY-MM-DD format for comparison
    // Extract date using local date methods to match MySQL DATE values
    const formatLocalDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const validFrom = formatLocalDate(schedule.valid_from);
    const validUntil = formatLocalDate(schedule.valid_until);

    // Validation: Check schedule date validity
    if (validFrom && today < validFrom) {
      await connection.rollback();
      const error = new Error(
        `This class schedule is not yet available. Available from ${validFrom}`
      );
      error.code = "SCHEDULE_NOT_YET_AVAILABLE";
      error.statusCode = 403;
      throw error;
    }

    if (validUntil && today > validUntil) {
      await connection.rollback();
      const error = new Error(
        `This class schedule is no longer available. Ended on ${validUntil}`
      );
      error.code = "SCHEDULE_ENDED";
      error.statusCode = 410;
      throw error;
    }

    // 3. Check for Duplicate Active Booking
    // Ensure member doesn't already have an active booking for this schedule
    const [existingBookings] = await connection.execute(
      `SELECT booking_id FROM class_bookings 
       WHERE class_schedule_id = ? 
         AND member_id = ? 
         AND status = 'Active' 
         AND (booking_end_date IS NULL OR booking_end_date > NOW())`,
      [classScheduleId, memberId]
    );

    if (existingBookings.length > 0) {
      await connection.rollback();
      const error = new Error(
        "Member already has an active booking for this class"
      );
      error.code = "ALREADY_REGISTERED";
      error.statusCode = 409;
      throw error;
    }

    // 4. Check Capacity (Count Active Bookings)
    // Query the number of active bookings for this schedule
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) AS active_count FROM class_bookings 
       WHERE class_schedule_id = ? 
         AND status = 'Active'`,
      [classScheduleId]
    );

    const activeCount = countResult[0].active_count;

    // Validation: Class is full
    if (activeCount >= capacity) {
      await connection.rollback();
      const error = new Error("Class is at full capacity");
      error.code = "CLASS_FULL";
      error.statusCode = 409;
      throw error;
    }

    // 5. Insert Booking Record
    // Create a new active booking starting from today
    const [insertResult] = await connection.execute(
      `INSERT INTO class_bookings 
       (class_schedule_id, member_id, booking_start_date, booking_end_date, status, payment_id, created_at, updated_at) 
       VALUES (?, ?, ?, NULL, 'Active', NULL, NOW(), NOW())`,
      [classScheduleId, memberId, today]
    );

    const bookingId = insertResult.insertId;

    // 6. Commit Transaction
    await connection.commit();

    // 7. Return Success Response
    return {
      booking_id: bookingId,
      member_id: memberId,
      class_schedule_id: classScheduleId,
      booking_start_date: today,
      booking_end_date: null,
      status: "Active",
      message: "Successfully registered for class",
    };
  } catch (error) {
    // Rollback on any error
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }

    // Re-throw the error with proper status code
    throw error;
  } finally {
    // Release connection back to pool
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Cancel a member's booking for a class
 * @param {number} bookingId - Booking ID
 * @param {number} memberId - Member ID (for authorization)
 * @returns {Promise<Object>} Updated booking details
 * @throws {Error} With specific error codes
 */
async function cancelBooking(bookingId, memberId) {
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Get booking and verify ownership
    const [bookingRows] = await connection.execute(
      "SELECT booking_id, member_id, status FROM class_bookings WHERE booking_id = ? FOR UPDATE",
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

    // Verify member owns this booking
    if (booking.member_id !== memberId) {
      await connection.rollback();
      const error = new Error(
        "Unauthorized: Cannot cancel another member's booking"
      );
      error.code = "UNAUTHORIZED";
      error.statusCode = 403;
      throw error;
    }

    // Check if already canceled
    if (booking.status === "Canceled") {
      await connection.rollback();
      const error = new Error("Booking is already canceled");
      error.code = "ALREADY_CANCELED";
      error.statusCode = 409;
      throw error;
    }

    // Update booking to canceled
    const today = new Date().toISOString().split("T")[0];

    await connection.execute(
      "UPDATE class_bookings SET status = 'Canceled', booking_end_date = ?, updated_at = NOW() WHERE booking_id = ?",
      [today, bookingId]
    );

    await connection.commit();

    return {
      booking_id: bookingId,
      status: "Canceled",
      booking_end_date: today,
      message: "Booking canceled successfully",
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

module.exports = {
  registerForClass,
  cancelBooking,
};
