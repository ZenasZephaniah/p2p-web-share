const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Express and HTTP server
const app = express();
app.use(cors());

const server = http.createServer(app);

// Initialize Socket.io with CORS enabled for our future React app
const io = new Server(server, {
    cors: {
        origin: "*", // In production, we will change this to your Vercel URL
        methods: ["GET", "POST"]
    }
});

// Basic health check route
app.get('/', (req, res) => {
    res.send('P2P Signaling Server is running.');
});

// Core Signaling Logic
io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

    // 1. User joins a specific room using a Room ID
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        // Notify others in the room that a new peer has joined
        socket.to(roomId).emit('user-joined', socket.id);
    });

    // 2. WebRTC Handshake: Sender creates an Offer
    socket.on('offer', (data) => {
        // Relay the offer to the specific room, but NOT back to the sender
        socket.to(data.roomId).emit('offer', {
            senderId: socket.id,
            sdp: data.sdp
        });
    });

    // 3. WebRTC Handshake: Receiver replies with an Answer
    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', {
            senderId: socket.id,
            sdp: data.sdp
        });
    });

    // 4. WebRTC Handshake: Exchanging ICE Candidates (Network routing info)
    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', {
            senderId: socket.id,
            candidate: data.candidate
        });
    });

    // 5. Graceful Disconnect Handling
    socket.on('disconnect', () => {
        console.log(`[-] User disconnected: ${socket.id}`);
        // Socket.io automatically handles leaving the room
        // We broadcast to all rooms this socket was in (handled dynamically on frontend)
        socket.broadcast.emit('peer-disconnected', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Signaling Server running on http://localhost:${PORT}`);
});