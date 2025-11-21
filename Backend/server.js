// 1. Import dependencies
const express = require("express");
const config = require("./config");
const bookingRouter = require("./routes/bookingRoutes");

// 2. Create an instance of Express
const app = express();

// Middleware for parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Define a port from environment configuration
const port = config.port;

// 4. Define a simple route (GET request to the root URL)
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.use("/api/booking", bookingRouter);

// 5. Start the server and listen on the port
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
