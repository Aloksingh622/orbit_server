import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { inngest, functions } from './inngest/index.js';
import { serve } from 'inngest/express';
import { clerkMiddleware } from '@clerk/express';
import { createServer } from 'http';
import { Server } from 'socket.io';

import userRouter from './routes/userRotes.js';
import postRouter from './routes/postRoutes.js';
import storyRouter from './routes/storyRoutes.js';
import messageRouter from './routes/messageRoutes.js';

const app = express();
const server = createServer(app); // Create HTTP server for socket.io

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

app.get('/', (req, res) => res.send('Server is running'));
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/user', userRouter);
app.use('/api/post', postRouter);
app.use('/api/story', storyRouter);
app.use('/api/message', messageRouter);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const userSocketMap = {};
let randomCallPool = [];
const noMatchTimeouts = {};
const tryToMatchUsers = (io) => {
  while (randomCallPool.length >= 2) {
    const user1 = randomCallPool.shift();
    const user2 = randomCallPool.shift();

    // Clear timeouts
    if (noMatchTimeouts[user1.socketId]) clearTimeout(noMatchTimeouts[user1.socketId]);
    if (noMatchTimeouts[user2.socketId]) clearTimeout(noMatchTimeouts[user2.socketId]);
    delete noMatchTimeouts[user1.socketId];
    delete noMatchTimeouts[user2.socketId];

    // Randomly decide who initiates (or use user ID comparison)
    const user1IsInitiator = user1.userId > user2.userId;

    debugLog("Match found! Pairing users.", { 
      user1: user1.userId, 
      user2: user2.userId,
      initiator: user1IsInitiator ? user1.userId : user2.userId
    });

    // Send with initiator information
    io.to(user1.socketId).emit('match-found', { 
      partnerId: user2.userId, 
      isInitiator: user1IsInitiator 
    });
    io.to(user2.socketId).emit('match-found', { 
      partnerId: user1.userId, 
      isInitiator: !user1IsInitiator 
    });
  }
};

function getSocketIdByUserId(userId) {
  return userSocketMap[userId];
}

function debugLog(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`, data ? JSON.stringify(data) : '');
}
io.on("connection", (socket) => {
  debugLog("User connected", { socketId: socket.id });

  socket.on("register", (userId) => {
    if (!userId) return;
    userSocketMap[userId] = socket.id;
    debugLog("User registered successfully", { userId, socketId: socket.id });
  });

  // --- DIRECT CALL SIGNALING ---
  socket.on("outgoing-call", ({ from, to, type = 'voice' }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("incoming-call", { from, type });
    else socket.emit("call-error", { error: "User is not online." });
  });

  socket.on("call-accepted", ({ from, to, callType }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("call-accepted", { from, callType });
  });

  socket.on("call-rejected", ({ from, to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("call-rejected", { from });
  });

  socket.on("cancel-call", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("call-canceled");
  });

  // --- RANDOM CALL SIGNALING ---
  socket.on('join-random-pool', ({ userId }) => {
    if (!randomCallPool.some(user => user.userId === userId)) {
      randomCallPool.push({ userId, socketId: socket.id });
      if (randomCallPool.length === 1) {
        noMatchTimeouts[socket.id] = setTimeout(() => {
          socket.emit('no-match-found');
          debugLog("No match found for user", { userId });
        }, 15000);
      }
      tryToMatchUsers(io);
    }
  });

  socket.on('leave-random-pool', () => {
    randomCallPool = randomCallPool.filter(user => user.socketId !== socket.id);
    if (noMatchTimeouts[socket.id]) {
      clearTimeout(noMatchTimeouts[socket.id]);
      delete noMatchTimeouts[socket.id];
    }
  });

  socket.on('skip-partner', ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("partner-skipped");
  });

  // --- UNIVERSAL HANDLERS ---
  socket.on("callee-ready", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("initiate-offer", {});
  });

  socket.on("hang-up", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("call-ended");
  });

  // --- WEBRTC SIGNALING ---
  socket.on("webrtc-offer", ({ to, from, offer }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) socket.to(toSocketId).emit("webrtc-offer", { from, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) socket.to(toSocketId).emit("webrtc-answer", { answer });
  });

  socket.on("webrtc-candidate", ({ to, candidate }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) socket.to(toSocketId).emit("webrtc-candidate", { candidate });
  });

  // --- DISCONNECT & ERROR ---
  socket.on("disconnect", () => {
    if (noMatchTimeouts[socket.id]) {
      clearTimeout(noMatchTimeouts[socket.id]);
      delete noMatchTimeouts[socket.id];
    }
    randomCallPool = randomCallPool.filter(user => user.socketId !== socket.id);

    let disconnectedUserId = null;
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        disconnectedUserId = userId;
        delete userSocketMap[userId];
        break;
      }
    }
    debugLog("User disconnected", { socketId: socket.id, userId: disconnectedUserId });
  });

  socket.on("error", (error) => {
    debugLog("Socket error", { socketId: socket.id, error: error.message });
  });
});

const PORT = process.env.PORT || 4000;

async function connections() {
  try {
    await connectDB();
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.log("Error: " + err);
  }
}

connections();
