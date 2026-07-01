# P2P Direct Web Share

A lightweight, high-performance, **Zero-Knowledge End-to-End Encrypted (E2EE)** peer-to-peer file sharing application. Built to bypass traditional server bottlenecks, this application allows users to stream files directly between browsers using WebRTC Data Channels.

**Developer:** Zenas Zephaniah

### Live Deployments
- **Frontend (Client):** [[Click Here](https://p2p-web-share-henna.vercel.app/)]
- **Backend (Signaling):** [[Click Here](https://p2p-web-share-atem.onrender.com)]
- **Demo Video (Hosted URL) :** [[Click Here](https://drive.google.com/drive/folders/1JM74QlhLKrfUzvGLBbcXVNvWMa-aye4O?usp=sharing)]

---

## System Architecture & Zero-Knowledge Flow

The application utilizes a completely decoupled architecture. The Node.js signaling server acts strictly as a telephone switchboard to exchange routing data. **It never touches, processes, or stores any file payloads or encryption keys.**

```text
       [ Sender's Browser ]
       1. Selects File & Generates AES-256 Key
       2. Connects to Node.js Room
                |
                v  (Exchanges SDP Offers & ICE Candidates ONLY)
      [ Socket.io Signaling Server ] 
                ^  (Server NEVER sees the #key=... fragment)
                |
       3. Joins via Invite Link containing #key=...
       [ Receiver's Browser ]

===================================================================
      HANDSHAKE COMPLETE. SERVER DISCONNECTS FROM DATA FLOW.
===================================================================

       [ Sender's Browser ]
                |
                |  Direct WebRTC RTCDataChannel
                |  Streaming 64KB Chunks (AES-GCM Encrypted)
                v
       [ Receiver's Browser ]
       4. Decrypts chunks in-memory, verifies SHA-256, auto-downloads.
```

---

## Problem Statement Fulfillment Matrix

### Core MVP Capabilities (100% Achieved)
| Feature | Implementation Detail |
| :--- | :--- |
| **Share Room Creation** | Sleek UI wizard generates a mathematically secure, unique sandboxed session and a 1-click invite link. Enforces <50MB limit for safe RAM buffering. |
| **Signaling Handshake** | Lightweight Express/Socket.io backend manages WebRTC `offer`, `answer`, and `ice-candidate` packets natively. |
| **Direct P2P Transfer** | Utilizes native `RTCPeerConnection` and `RTCDataChannel`. Reads files using `FileReader.readAsArrayBuffer` and streams raw binary. No wrapper libraries (like PeerJS) were used. |
| **Basic Chunk Verification** | Cryptographic block hashing. The Sender generates a SHA-256 hash of the file. The Receiver reconstructs the payload and computes a matching SHA-256 hash to guarantee **zero data corruption**. |
| **Progress & Telemetry** | Dedicated UI modules track dynamic transfer speeds (MB/s), Estimated Time of Arrival (ETA), and a live percentage progress bar. |
| **Graceful Disconnects** | Actively monitors `onconnectionstatechange`. If a peer drops mid-transfer, the UI safely aborts, alerts the user, and provides a "Dissolve Session" option to wipe memory. |
| **Auto-Download** | Incoming ArrayBuffers are reassembled into a local Blob URL, triggering an automated, native browser download upon hash verification. |

### Advanced Extension (Brownie Point) Achieved

#### Zero-Knowledge End-to-End Encryption (AES-GCM)
This application goes beyond standard WebRTC encryption by implementing an application-layer **Zero-Knowledge Architecture**:
1. The Sender's browser uses the Web Crypto API to generate a 256-bit AES-GCM key.
2. The key is appended to the invite link exclusively as a URL Hash Fragment (`#key=...`).
3. **Crucial Security Detail:** Browsers *do not* send URL hash fragments to servers via HTTP. The signaling server is physically incapable of intercepting the decryption key.
4. Every 64KB chunk is encrypted with a **unique Initialization Vector (IV)** before transmission, preventing cryptographic replay vulnerabilities. 

---

## Features and Highlights

*   **Native WebRTC Backpressure Management:** Instead of using naive `setTimeout` loops to throttle data, this application monitors the `channel.bufferedAmountLowThreshold`. If the browser's buffer fills up, it intelligently halts the `FileReader` and only resumes when the network clears, ensuring maximum throughput without crashing the browser's RAM.
*   **Strict Integrity Protocols:** If the SHA-256 hash of the reconstructed file does not perfectly match the sender's original hash, the file is flagged as corrupted. The application does not utilize bypass fallbacks; cryptographic integrity is absolute.
*   **Memory-Safe Session Dissolution:** A dedicated "Cancel & Dissolve Session" function actively closes WebRTC channels, severs WebSocket connections, and routes the user away, guaranteeing browser garbage collection clears the decrypted file from RAM.

---

## Tech Stack

**Frontend (Client)**
*   React 18 + Vite (Single Page Application)
*   Tailwind CSS + Lucide Icons (UI/UX)
*   React Router (SPA Routing)
*   Web Crypto API (`crypto.subtle`)
*   Native WebRTC (`RTCPeerConnection`, `RTCDataChannel`)

**Backend (Signaling Node)**
*   Node.js + Express.js
*   Socket.io (Real-time pub/sub routing)
*   Render (Hosting)

---

## Local Development & Testing Protocol

### Prerequisites
- Node.js v18+ installed.
- Two browser contexts (e.g., Chrome, and a Chrome Incognito window).

### 1. Launch the Signaling Server
```bash
cd server
npm install
npm run dev
```
Server will initialize on `http://localhost:3000`

### 2. Launch the React Client
Open a second terminal split:
```bash
cd client
npm install
npm run dev
```
Client will initialize on `http://localhost:5173`

### 3. Verification Testing Workflow
1. **Host Node:** Open `http://localhost:5173` in a standard browser window.
2. Click **Create a Room** and drag-and-drop a test file (e.g., a 10MB PDF).
3. Click **Copy Link**. Notice the encryption key is safely embedded in the `#key=` fragment.
4. **Receiver Node:** Open an Incognito Window and paste the link.
5. **Observe Handshake:** Watch the WebRTC tunnel negotiate. Both windows will display a green `Connected` badge.
6. **Execute Transfer:** Click "Send Encrypted File" on the Host Node. Observe the real-time MB/s telemetry and ETA.
7. **Verify & Download:** Upon completion, observe the Receiver node calculate the SHA-256 hash, display the green Integrity badge, and auto-download the file. 

---
