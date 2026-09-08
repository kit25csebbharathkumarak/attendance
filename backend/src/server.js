const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const connectDB = require('./config/db');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Setup CORS configuration
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: [clientOrigin, 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

// Standard Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: [clientOrigin, 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach Socket.IO instance to Express app for use in controllers
app.set('io', io);

// Socket.IO Connection Lifecycle
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
  });
});

// API Routes
app.use('/api', apiRoutes);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'auto-attendance-backend',
    socketClients: io.engine.clientsCount,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Attendance Backend Server running on port ${PORT}`);
  console.log(`📡 WebSocket URL: ws://localhost:${PORT}`);
  console.log(`🌐 Allowed Client: ${clientOrigin}`);
  console.log(`====================================================`);
});

module.exports = { app, server, io };
