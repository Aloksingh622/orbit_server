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
  debugLog("Attempting to match users", { poolSize: randomCallPool.length });
  while (randomCallPool.length >= 2) {
    const user1 = randomCallPool.shift();
    const user2 = randomCallPool.shift();

    // Clear any pending "no match" timeouts for these users
    if (noMatchTimeouts[user1.socketId]) clearTimeout(noMatchTimeouts[user1.socketId]);
    if (noMatchTimeouts[user2.socketId]) clearTimeout(noMatchTimeouts[user2.socketId]);
    delete noMatchTimeouts[user1.socketId];
    delete noMatchTimeouts[user2.socketId];

    debugLog("Match found!", { user1: user1.userId, user2: user2.userId });

    io.to(user1.socketId).emit('match-found', { partnerId: user2.userId });
    io.to(user2.socketId).emit('match-found', { partnerId: user1.userId });
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
    if (!userId) {
      debugLog("Registration failed: No userId provided", { socketId: socket.id });
      return;
    }
    userSocketMap[userId] = socket.id;
    debugLog("User registered successfully", { userId, socketId: socket.id });
  });

  // PRE-CALL SIGNALING =====================

  // MODIFICATION 1: Added 'type'
  socket.on("outgoing-call", ({ from, to, type = 'voice' }) => {
    debugLog("Outgoing call request", { from, to, type });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("incoming-call", { from, type }); // Forwarding 'type'
      debugLog("Sending incoming call to recipient", { from, to, toSocketId, type });
    } else {
      socket.emit("call-error", { error: "User is not online." });
      debugLog("Recipient not found", { to });
    }
  });

  // MODIFICATION 2: Richer payload for specific confirmation
  socket.on("call-accepted", ({ from, to, callType }) => {
    debugLog("Call accepted", { from, to, callType });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-accepted", { from, callType }); // Forward 'from' and 'callType'
    }
  });

   socket.on('join-random-pool', ({ userId }) => {
    if (!randomCallPool.some(user => user.userId === userId)) {
      debugLog("User joined random call pool", { userId });
      randomCallPool.push({ userId, socketId: socket.id });

      // If user is alone in the pool, set a timeout to notify them
      if (randomCallPool.length === 1) {
        noMatchTimeouts[socket.id] = setTimeout(() => {
          socket.emit('no-match-found');
          debugLog("No match found for user", { userId });
        }, 15000); // 15-second timeout
      }

      tryToMatchUsers(io);
    }
  });

  socket.on('leave-random-pool', () => {
    const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
    randomCallPool = randomCallPool.filter(user => user.socketId !== socket.id);
    if (noMatchTimeouts[socket.id]) {
      clearTimeout(noMatchTimeouts[socket.id]);
      delete noMatchTimeouts[socket.id];
    }
    debugLog("User left random call pool", { userId });
  });

  // ▼▼ NEW HANDLER FOR SKIP ACTION ▼▼
  socket.on('skip-partner', ({ to }) => {
    debugLog("User skipped partner", { to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      // Notify the other user that their partner skipped
      io.to(toSocketId).emit("partner-skipped");
    }
  });

  // In server.js

socket.on("callee-ready", ({ to }) => {
  debugLog("Callee is ready, telling caller to initiate", { to });
  const toSocketId = getSocketIdByUserId(to);
  if (toSocketId) {
    // Tell the original caller to start the offer process
    io.to(toSocketId).emit("initiate-offer", {});
  }
});
socket.on("hang-up", ({ to }) => {
  debugLog("Hang-up signal received", { to });
  const toSocketId = getSocketIdByUserId(to);
  if (toSocketId) {
    // Notify the other user that the call has ended
    io.to(toSocketId).emit("call-ended");
  }
});


  socket.on("call-rejected", ({ from, to }) => { // It's good practice to also send 'from' here
    debugLog("Call rejected", { from, to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-rejected", { from }); // Tell the caller WHO rejected
    }
  });

  socket.on("cancel-call", ({ to }) => {
  debugLog("Call canceled by caller", { to });
  const toSocketId = getSocketIdByUserId(to);
  if (toSocketId) {
    // Tell the recipient's modal to close
    io.to(toSocketId).emit("call-canceled");
  }
});


  // WEBRTC SIGNALING (This part is already correct) ===================
  socket.on("webrtc-offer", ({ to, from, offer }) => {
    debugLog("WebRTC offer received", { to, from });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("webrtc-offer", { from, offer });
      debugLog("WebRTC offer forwarded", { to, toSocketId });
    }
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    debugLog("WebRTC answer received", { to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("webrtc-answer", { answer });
      debugLog("WebRTC answer forwarded", { to, toSocketId });
    }
  });

  socket.on("webrtc-candidate", ({ to, candidate }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("webrtc-candidate", { candidate });
    }
  });
  
  // OTHER HANDLERS (These are fine) =================================
  socket.on("end-call", ({ to }) => {
    debugLog("Call ended", { to });
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-ended", {});
    }
  });

  socket.on("disconnect", () => {
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
