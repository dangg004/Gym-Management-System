const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = {
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    name: process.env.DB_NAME || "gym_management",
  },
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  messageQueueUrl:
    process.env.MESSAGE_QUEUE_URL || "amqp://guest:guest@localhost:5672",
};

module.exports = config;

