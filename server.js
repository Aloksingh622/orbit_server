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
const server = createServer(app);

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
const activeMatches = new Map(); // Track active matches to prevent duplicates

const tryToMatchUsers = (io) => {
  debugLog("Attempting to match users", { poolSize: randomCallPool.length });
  
  while (randomCallPool.length >= 2) {
    const user1 = randomCallPool.shift();
    const user2 = randomCallPool.shift();

    // Skip if users are already matched
    if (activeMatches.has(user1.userId) || activeMatches.has(user2.userId)) {
      debugLog("Skipping already matched users", { user1: user1.userId, user2: user2.userId });
      continue;
    }

    // Clear no-match timeouts
    if (noMatchTimeouts[user1.socketId]) clearTimeout(noMatchTimeouts[user1.socketId]);
    if (noMatchTimeouts[user2.socketId]) clearTimeout(noMatchTimeouts[user2.socketId]);
    delete noMatchTimeouts[user1.socketId];
    delete noMatchTimeouts[user2.socketId];

    // Mark users as matched
    activeMatches.set(user1.userId, user2.userId);
    activeMatches.set(user2.userId, user1.userId);

    // Determine who initiates (consistent logic)
    const user1IsInitiator = user1.userId > user2.userId;

    debugLog("Match found! Pairing users.", { 
      user1: user1.userId, 
      user2: user2.userId,
      initiator: user1IsInitiator ? user1.userId : user2.userId
    });

    // Send match notification with initiator information
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

function removeFromPool(userId, socketId) {
  randomCallPool = randomCallPool.filter(user => user.userId !== userId && user.socketId !== socketId);
  if (noMatchTimeouts[socketId]) {
    clearTimeout(noMatchTimeouts[socketId]);
    delete noMatchTimeouts[socketId];
  }
}

function clearMatch(userId) {
  if (activeMatches.has(userId)) {
    const partnerId = activeMatches.get(userId);
    activeMatches.delete(userId);
    activeMatches.delete(partnerId);
    debugLog("Cleared match", { userId, partnerId });
  }
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
    debugLog("User joining random pool", { userId, socketId: socket.id });
    
    // Remove user from pool first (in case they're already there)
    removeFromPool(userId, socket.id);
    
    // Check if user is already matched
    if (activeMatches.has(userId)) {
      debugLog("User already matched, not adding to pool", { userId });
      return;
    }
    
    // Add to pool if not already there
    if (!randomCallPool.some(user => user.userId === userId)) {
      randomCallPool.push({ userId, socketId: socket.id });
      debugLog("Added user to pool", { userId, poolSize: randomCallPool.length });
      
      // Set no-match timeout only if they're alone in the pool
      if (randomCallPool.length === 1) {
        noMatchTimeouts[socket.id] = setTimeout(() => {
          socket.emit('no-match-found');
          removeFromPool(userId, socket.id);
          debugLog("No match found for user", { userId });
        }, 15000);
      }
      
      // Try to match users
      tryToMatchUsers(io);
    }
  });

  socket.on('leave-random-pool', ({ userId }) => {
    debugLog("User leaving random pool", { userId, socketId: socket.id });
    removeFromPool(userId, socket.id);
    clearMatch(userId);
  });

  socket.on('skip-partner', ({ to }) => {
    debugLog("User skipping partner", { from: socket.id, to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("partner-skipped");
    
    // Clear the match and remove both users from active matches
    let userId = null;
    for (const [uid, socketId] of Object.entries(userSocketMap)) {
      if (socketId === socket.id) {
        userId = uid;
        break;
      }
    }
    if (userId) {
      clearMatch(userId);
      clearMatch(to);
    }
  });

  // --- UNIVERSAL HANDLERS ---
  socket.on("callee-ready", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("initiate-offer", {});
  });

  socket.on("hang-up", ({ to }) => {
    debugLog("Call hang-up", { from: socket.id, to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) io.to(toSocketId).emit("call-ended");
    
    // Clear matches for both users
    let userId = null;
    for (const [uid, socketId] of Object.entries(userSocketMap)) {
      if (socketId === socket.id) {
        userId = uid;
        break;
      }
    }
    if (userId) {
      clearMatch(userId);
      clearMatch(to);
    }
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
    // Clean up timeouts
    if (noMatchTimeouts[socket.id]) {
      clearTimeout(noMatchTimeouts[socket.id]);
      delete noMatchTimeouts[socket.id];
    }
    
    // Find and remove user from all data structures
    let disconnectedUserId = null;
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        disconnectedUserId = userId;
        delete userSocketMap[userId];
        break;
      }
    }
    
    // Remove from pool and clear matches
    if (disconnectedUserId) {
      removeFromPool(disconnectedUserId, socket.id);
      clearMatch(disconnectedUserId);
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