import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { startStockSimulation } from './services/stockService.js';
import { newsQueue } from './queues/queueSetup.js';
import { Sentiment } from './models/Sentiment.js';
import { recalculateDecayedScores } from './services/decayService.js';

/* ================= ENV FIX ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const server = http.createServer(app);

/* ================= SOCKET ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

/* ================= REDIS ================= */
const redis = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  console.log('Connected to Redis successfully');
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

/* ================= SOCKET EVENTS ================= */
io.on('connection', () => {
  console.log('Client connected');
});

subscriber.subscribe("stock_updates");
subscriber.subscribe("sentiment_updates");

subscriber.on("message", (channel, message) => {
  try {
    const data = JSON.parse(message);

    if (channel === "stock_updates") {
      io.emit("price_update", data);
    }

    if (channel === "sentiment_updates") {
      io.emit("sentiment_update", data);
    }
  } catch (err) {
    console.error("Redis message error:", err.message);
  }
});

/* ================= MONGO ================= */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error("MONGO_URI missing in .env file");
    }

    await mongoose.connect(mongoURI);

    console.log("Connected to MongoDB:", mongoose.connection.name);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

/* ================= ROUTES ================= */

// health
app.get('/health', async (req, res) => {
  try {
    const redisPing = await redis.ping();

    res.json({
      status: "OK",
      redis: redisPing === "PONG",
      mongo: mongoose.connection.readyState === 1
    });
  } catch {
    res.status(500).json({ status: "ERROR" });
  }
});

// stocks
app.get('/api/stocks', async (req, res) => {
  try {
    const tickers = ['AAPL','TSLA','GOOGL','AMZN','MSFT','NVDA','META','NFLX','AMD','COIN'];
    const data = [];

    for (const t of tickers) {
      const stock = await redis.hgetall(`stock:${t}:latest`);

      if (stock?.price) {
        data.push({
          ticker: t,
          price: parseFloat(stock.price),
          timestamp: stock.timestamp
        });
      }
    }

    res.json({ success: true, data });
  } catch {
    res.status(500).json({ error: "stocks failed" });
  }
});

// analyze
app.post('/api/analyze', async (req, res) => {
  try {
    const { ticker, headline } = req.body;

    const job = await newsQueue.add("analyze_headline", {
      ticker,
      headline
    });

    res.json({ success: true, jobId: job.id });
  } catch {
    res.status(500).json({ error: "queue failed" });
  }
});

// leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const raw = await redis.zrevrange(
      "stocks:sentiment:leaderboard",
      0,
      -1,
      "WITHSCORES"
    );

    const result = [];

    for (let i = 0; i < raw.length; i += 2) {
      result.push({
        ticker: raw[i],
        score: parseFloat(raw[i + 1])
      });
    }

    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ error: "leaderboard failed" });
  }
});

// news
app.get('/api/news', async (req, res) => {
  try {
    const news = await Sentiment.find()
      .sort({ timestamp: -1 })
      .limit(20);

    res.json({ success: true, data: news });
  } catch {
    res.status(500).json({ error: "news failed" });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  await connectDB();

  await recalculateDecayedScores(redis);

  setInterval(() => {
    recalculateDecayedScores(redis).catch(console.error);
  }, 5 * 60 * 1000);

  startStockSimulation(redis);

  console.log(`Server running on http://localhost:${PORT}`);
});