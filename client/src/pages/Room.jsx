import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, CheckCircle, File as FileIcon, Activity } from 'lucide-react';
import { io } from 'socket.io-client';

// Standard Google STUN servers to help browsers find each other over the internet
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  
  // UI States
  const [connectionStatus, setConnectionStatus] = useState('Waiting for peer...');
  const [peerConnected, setPeerConnected] = useState(false);

  const fileToShare = location.state?.file;
  const isSender = !!fileToShare;

  // Mutable refs to hold our network objects without triggering re-renders
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);

  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    // 1. Connect to our Signaling Server
    socketRef.current = io('http://localhost:3000');
    
    // 2. Initialize WebRTC Peer Connection
    peerRef.current = new RTCPeerConnection(rtcConfig);

    // ---------------------------------------------------------
    // WEBRTC EVENT LISTENERS
    // ---------------------------------------------------------
    
    // Send ICE candidates to the peer via the server
    peerRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { roomId, candidate: event.candidate });
      }
    };

    // Listen for the connection status changing
    peerRef.current.onconnectionstatechange = () => {
      console.log('Connection state:', peerRef.current.connectionState);
      if (peerRef.current.connectionState === 'connected') {
        setConnectionStatus('Connected! Ready to transfer.');
        setPeerConnected(true);
      } else if (peerRef.current.connectionState === 'disconnected' || peerRef.current.connectionState === 'failed') {
        setConnectionStatus('Peer disconnected.');
        setPeerConnected(false);
      }
    };

    // ---------------------------------------------------------
    // SENDER LOGIC (Creates the Offer)
    // ---------------------------------------------------------
    if (isSender) {
      // Create the Data Channel (The tunnel for our file)
      dataChannelRef.current = peerRef.current.createDataChannel('file-transfer-channel');
      setupDataChannel(dataChannelRef.current);

      socketRef.current.emit('join-room', roomId);

      // When Receiver joins, Sender creates the Offer
      socketRef.current.on('user-joined', async () => {
        setConnectionStatus('Peer joined. Negotiating connection...');
        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);
        socketRef.current.emit('offer', { roomId, sdp: offer });
      });

      // Sender receives the Answer from Receiver
      socketRef.current.on('answer', async (data) => {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      });
    } 
    
    // ---------------------------------------------------------
    // RECEIVER LOGIC (Creates the Answer)
    // ---------------------------------------------------------
    else {
      socketRef.current.emit('join-room', roomId);

      // Receiver listens for the Data Channel from the Sender
      peerRef.current.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        setupDataChannel(dataChannelRef.current);
      };

      // Receiver gets the Offer, sets it, and creates Answer
      socketRef.current.on('offer', async (data) => {
        setConnectionStatus('Offer received. Connecting...');
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        socketRef.current.emit('answer', { roomId, sdp: answer });
      });
    }

    // ---------------------------------------------------------
    // SHARED LOGIC (Handling ICE Candidates)
    // ---------------------------------------------------------
    socketRef.current.on('ice-candidate', async (data) => {
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ICE candidate', e);
      }
    });

    // Cleanup when component unmounts
    return () => {
      socketRef.current.disconnect();
      peerRef.current.close();
    };
  }, [roomId, isSender]);

  // Helper to attach listeners to the data channel once it opens
  const setupDataChannel = (channel) => {
    channel.onopen = () => console.log('Data channel opened!');
    channel.onclose = () => console.log('Data channel closed!');
    channel.onmessage = (event) => {
      // We will handle receiving file chunks here in Phase 5!
      console.log('Received message:', event.data);
    };
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-2xl">
        
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Transfer Room</h1>
          <p className="text-slate-500 mt-2">Room ID: <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{roomId}</span></p>
        </div>

        {/* Invite Link Section */}
        {isSender && !peerConnected && (
          <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider">Share this link to connect</p>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                readOnly 
                value={inviteLink} 
                className="flex-1 p-3 bg-white border border-gray-300 rounded-lg text-gray-600 font-mono text-sm focus:outline-none"
              />
              <button 
                onClick={copyToClipboard}
                className="flex items-center justify-center p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors min-w-[100px]"
              >
                {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="ml-2 font-medium">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* File Info Section */}
        <div className="flex items-center p-4 border border-slate-200 rounded-xl bg-slate-50 mb-6 transition-all">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <FileIcon className="w-8 h-8" />
          </div>
          <div className="flex-1 truncate">
            <p className="font-semibold text-slate-800 truncate">
              {isSender ? fileToShare.name : 'Awaiting file transfer...'}
            </p>
            <p className="text-sm text-slate-500">
              {isSender ? `${(fileToShare.size / (1024 * 1024)).toFixed(2)} MB` : 'Size unknown'}
            </p>
          </div>
          
          {/* Dynamic Connection Status Badge */}
          <div className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-colors duration-300
            ${peerConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 animate-pulse'}`}
          >
            {peerConnected && <Activity className="w-4 h-4 animate-bounce" />}
            {connectionStatus}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Room;