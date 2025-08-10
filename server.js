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

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Have user register their userId upon connection
  socket.on("register", (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  // PRE-CALL SIGNALING =====================
  socket.on("outgoing-call", ({ from, to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      // Send invitation to the specific user
      io.to(toSocketId).emit("incoming-call", { from });
    }
  });

  socket.on("call-accepted", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
    if (toSocketId) {
      io.to(toSocketId).emit("call-accepted", {});
    }
  });

  socket.on("call-rejected", ({ to }) => {
    const toSocketId = getSocketIdByUserId(to);
     if (toSocketId) {
      io.to(toSocketId).emit("call-rejected", {});
    }
  });
  
  // WEBRTC SIGNALING (Your existing code is mostly fine) ============
  socket.on("offer", ({ to, offer }) => {
    const toSocketId = getSocketIdByUserId(to);
    if(toSocketId) {
       socket.to(toSocketId).emit("offer", { offer });
    }
  });

  socket.on("answer", ({ to, answer }) => {
    const toSocketId = getSocketIdByUserId(to);
     if(toSocketId) {
       socket.to(toSocketId).emit("answer", { answer });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const toSocketId = getSocketIdByUserId(to);
    if(toSocketId) {
      socket.to(toSocketId).emit("ice-candidate", { candidate });
    }
  });

  socket.on("disconnect", () => {
    // Clean up the map on disconnect
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];
        break;
      }
    }
    console.log("User disconnected:", socket.id);
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
