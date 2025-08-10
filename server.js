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
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {}; // Maps your app's userId to a socket.id

function getSocketIdByUserId(userId) {
  return userSocketMap[userId];
}

function getAllConnectedUsers() {
  return Object.keys(userSocketMap);
}

function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

io.on("connection", (socket) => {
  debugLog("User connected", { socketId: socket.id });

  // Have user register their userId upon connection
  socket.on("register", (userId) => {
    if (!userId) {
      debugLog("Registration failed: No userId provided", { socketId: socket.id });
      return;
    }

    // Remove any existing mapping for this user (in case of reconnection)
    for (const existingUserId in userSocketMap) {
      if (userSocketMap[existingUserId] === socket.id) {
        delete userSocketMap[existingUserId];
        debugLog("Removed old mapping for reconnecting user", { 
          oldUserId: existingUserId, 
          socketId: socket.id 
        });
        break;
      }
    }

    userSocketMap[userId] = socket.id;
    debugLog("User registered successfully", { 
      userId, 
      socketId: socket.id,
      totalConnectedUsers: Object.keys(userSocketMap).length,
      allConnectedUsers: getAllConnectedUsers()
    });

    // Send confirmation back to the client
    socket.emit("registration-success", { userId });
  });

  // PRE-CALL SIGNALING =====================
  socket.on("outgoing-call", ({ from, to, type = 'voice' }) => {
    debugLog("Outgoing call request received", { from, to, type });

    if (!from || !to) {
      debugLog("Invalid call request: missing from or to", { from, to });
      socket.emit("call-error", { error: "Invalid call request" });
      return;
    }

    const toSocketId = getSocketIdByUserId(to);
    debugLog("Looking for recipient socket", { 
      to, 
      toSocketId,
      allMappings: userSocketMap 
    });

    if (toSocketId) {
      debugLog("Sending incoming call to recipient", { 
        from, 
        to, 
        toSocketId,
        type 
      });
      
      io.to(toSocketId).emit("incoming-call", { from, type });
      
      // Send confirmation to caller
      socket.emit("call-initiated", { to });
    } else {
      debugLog("Recipient not found or offline", { 
        to, 
        connectedUsers: getAllConnectedUsers() 
      });
      
      socket.emit("call-error", { 
        error: "User is not online or not found",
        to 
      });
    }
  });

  socket.on("call-accepted", ({ to }) => {
    debugLog("Call accepted", { to });
    
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-accepted", {});
      debugLog("Call acceptance sent to caller", { to, toSocketId });
    } else {
      debugLog("Could not find caller to notify of acceptance", { to });
    }
  });

  socket.on("call-rejected", ({ to }) => {
    debugLog("Call rejected", { to });
    
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-rejected", {});
      debugLog("Call rejection sent to caller", { to, toSocketId });
    } else {
      debugLog("Could not find caller to notify of rejection", { to });
    }
  });

  // WEBRTC SIGNALING ============
  socket.on("offer", ({ to, offer }) => {
    debugLog("WebRTC offer received", { to });
    
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("offer", { offer });
      debugLog("WebRTC offer forwarded", { to, toSocketId });
    } else {
      debugLog("Could not forward WebRTC offer - recipient not found", { to });
    }
  });

  socket.on("answer", ({ to, answer }) => {
    debugLog("WebRTC answer received", { to });
    
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("answer", { answer });
      debugLog("WebRTC answer forwarded", { to, toSocketId });
    } else {
      debugLog("Could not forward WebRTC answer - recipient not found", { to });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      socket.to(toSocketId).emit("ice-candidate", { candidate });
      // Don't log every ICE candidate to avoid spam, but uncomment for deep debugging
      // debugLog("ICE candidate forwarded", { to, toSocketId });
    }
  });

  // Handle call end/cleanup
  socket.on("end-call", ({ to }) => {
    debugLog("Call ended", { to });
    
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-ended", {});
    }
  });

  // Ping/pong for connection health
  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", () => {
    // Clean up the map on disconnect
    let disconnectedUserId = null;
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        disconnectedUserId = userId;
        delete userSocketMap[userId];
        break;
      }
    }
    
    debugLog("User disconnected", { 
      socketId: socket.id,
      userId: disconnectedUserId,
      remainingConnectedUsers: getAllConnectedUsers().length 
    });
  });

  // Handle any socket errors
  socket.on("error", (error) => {
    debugLog("Socket error", { socketId: socket.id, error: error.message });
  });
});

// Periodic health check (optional - helps with debugging)
setInterval(() => {
  const connectedCount = Object.keys(userSocketMap).length;
  debugLog(`Health check - Connected users: ${connectedCount}`, {
    users: getAllConnectedUsers()
  });
}, 60000);

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
