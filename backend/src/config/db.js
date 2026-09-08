const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auto_attendance';
  
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.warn(`[Database Warning] Could not connect to MongoDB at ${uri}.`);
    console.warn(`[Database Warning] Message: ${error.message}`);
    console.warn(`[Database Warning] The server will still start, but database queries will fail until MongoDB is available.`);
  }

  mongoose.connection.on('error', (err) => {
    console.error(`[Database Error] ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB disconnected.');
  });
};

module.exports = connectDB;
