# P2P Web Share - Secure Direct File Transfer 🚀

A lightweight, decentralized, and end-to-end encrypted peer-to-peer file sharing web application. Built to bypass traditional server bottlenecks, this app allows users to stream files directly between browsers using WebRTC.

## Key Features
- **True Peer-to-Peer Transfer:** Files are streamed directly from Sender to Receiver via WebRTC `RTCDataChannel`. The server never touches the file data.
- **Zero-Knowledge Encryption (E2E):** Implements the Web Crypto API (AES-GCM). The encryption key is generated locally and passed via the URL hash fragment (`#key=...`), ensuring the signaling server has zero access to the payload.
- **Memory-Safe Chunking:** Large files are read and transmitted in 64KB chunks using the `FileReader` API and ArrayBuffers, preventing browser RAM overflow.
- **Cryptographic Verification:** Generates a SHA-256 hash of the file prior to transfer and verifies it on the receiver's end to guarantee zero data corruption.
- **Real-Time Analytics:** Tracks dynamic transfer speeds (MB/s) and progress percentages.
- **Graceful Disconnects:** Actively monitors connection states and alerts users if a peer drops mid-transfer.

## 🛠️ Tech Stack
- **Frontend:** React.js (Vite), Tailwind CSS, Lucide Icons
- **P2P Networking:** Native WebRTC API (`RTCPeerConnection`)
- **Signaling Server:** Node.js, Express.js, Socket.io
- **Security:** Web Crypto API (AES-GCM, SHA-256)

## Local Setup Instructions

1. **Clone the repository**
   \`\`\`bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/mars-p2p.git
   cd mars-p2p
   \`\`\`

2. **Start the Signaling Server (Backend)**
   \`\`\`bash
   cd server
   npm install
   npm run dev
   \`\`\`
   *Runs on http://localhost:3000*

3. **Start the React App (Frontend)**
   Open a new terminal split:
   \`\`\`bash
   cd client
   npm install
   npm run dev
   \`\`\`
   *Runs on http://localhost:5173*

## System Architecture / Handshake Flow
1. **User A (Sender)** selects a file. A local AES-GCM key is generated.
2. User A joins a Socket.io room on the signaling server.
3. **User B (Receiver)** opens the invite link (containing the key in the URL hash).
4. User A and User B exchange SDP Offers/Answers and ICE Candidates via the signaling server to bypass NATs/Firewalls.
5. A direct WebRTC tunnel is established. The signaling server steps back.
6. User A chunks, encrypts, and sends the file. User B receives, decrypts, and reassembles the Blob.

---
*Developed as a solution for the OpenProjects 2026 Problem Statement.*