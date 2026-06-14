import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, CheckCircle, File as FileIcon, Activity, Send, Download } from 'lucide-react';
import { io } from 'socket.io-client';

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
  
  // Transfer States
  const [progress, setProgress] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);

  const fileToShare = location.state?.file;
  const isSender = !!fileToShare;

  // Refs for Networking & Transfer
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);
  
  // Refs for Receiver Reassembly
  const receiveBuffer = useRef([]);
  const receivedSize = useRef(0);
  const expectedMeta = useRef(null);

  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');
    peerRef.current = new RTCPeerConnection(rtcConfig);

    peerRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { roomId, candidate: event.candidate });
      }
    };

    peerRef.current.onconnectionstatechange = () => {
      if (peerRef.current.connectionState === 'connected') {
        setConnectionStatus('Connected! Ready to transfer.');
        setPeerConnected(true);
      } else if (peerRef.current.connectionState === 'disconnected' || peerRef.current.connectionState === 'failed') {
        setConnectionStatus('Peer disconnected.');
        setPeerConnected(false);
      }
    };

    if (isSender) {
      dataChannelRef.current = peerRef.current.createDataChannel('file-transfer-channel');
      setupDataChannel(dataChannelRef.current);
      socketRef.current.emit('join-room', roomId);

      socketRef.current.on('user-joined', async () => {
        setConnectionStatus('Peer joined. Negotiating connection...');
        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);
        socketRef.current.emit('offer', { roomId, sdp: offer });
      });

      socketRef.current.on('answer', async (data) => {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      });
    } else {
      socketRef.current.emit('join-room', roomId);

      peerRef.current.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        setupDataChannel(dataChannelRef.current);
      };

      socketRef.current.on('offer', async (data) => {
        setConnectionStatus('Offer received. Connecting...');
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        socketRef.current.emit('answer', { roomId, sdp: answer });
      });
    }

    socketRef.current.on('ice-candidate', async (data) => {
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ICE candidate', e);
      }
    });

    return () => {
      socketRef.current.disconnect();
      peerRef.current.close();
    };
  }, [roomId, isSender]);

  // ---------------------------------------------------------
  // THE RECEIVER LOGIC
  // ---------------------------------------------------------
  const setupDataChannel = (channel) => {
    channel.binaryType = 'arraybuffer'; // Crucial for receiving raw file bytes
    
    channel.onmessage = (event) => {
      // 1. If it's a string, it's metadata (JSON)
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'meta') {
          expectedMeta.current = data;
          receiveBuffer.current = [];
          receivedSize.current = 0;
          setIsTransferring(true);
          setConnectionStatus('Receiving file...');
        } else if (data.type === 'eof') {
          // End of File! Reassemble and Download
          const blob = new Blob(receiveBuffer.current, { type: expectedMeta.current.mime });
          const downloadUrl = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = expectedMeta.current.name;
          a.click(); // Trigger native browser download
          
          setIsTransferring(false);
          setTransferComplete(true);
          setConnectionStatus('Transfer Complete!');
          setProgress(100);
        }
      } 
      // 2. If it's an ArrayBuffer, it's a chunk of the file
      else {
        receiveBuffer.current.push(event.data);
        receivedSize.current += event.data.byteLength;
        
        // Calculate progress %
        if (expectedMeta.current) {
          const currentProgress = Math.round((receivedSize.current / expectedMeta.current.size) * 100);
          setProgress(currentProgress);
        }
      }
    };
  };

  // ---------------------------------------------------------
  // THE SENDER LOGIC (Chunking & Backpressure)
  // ---------------------------------------------------------
  const sendFile = () => {
    if (!fileToShare || !dataChannelRef.current) return;
    setIsTransferring(true);
    setConnectionStatus('Sending file...');

    const chunkSize = 64 * 1024; // 64 KB per chunk
    let offset = 0;

    // 1. Send Metadata first
    dataChannelRef.current.send(JSON.stringify({
      type: 'meta',
      name: fileToShare.name,
      size: fileToShare.size,
      mime: fileToShare.type
    }));

    // 2. Read and send chunks sequentially
    const readSlice = (currentOffset) => {
      const slice = fileToShare.slice(currentOffset, currentOffset + chunkSize);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        // Send the raw byte array
        dataChannelRef.current.send(e.target.result);
        offset += e.target.result.byteLength;
        setProgress(Math.round((offset / fileToShare.size) * 100));

        if (offset < fileToShare.size) {
          // BACKPRESSURE CONTROL: If WebRTC buffer gets over 1MB, wait 50ms before sending more
          if (dataChannelRef.current.bufferedAmount > 1024 * 1024) {
            setTimeout(() => readSlice(offset), 50);
          } else {
            readSlice(offset);
          }
        } else {
          // File reading complete, send EOF signal
          dataChannelRef.current.send(JSON.stringify({ type: 'eof' }));
          setIsTransferring(false);
          setTransferComplete(true);
          setConnectionStatus('Transfer Complete!');
        }
      };
      
      reader.readAsArrayBuffer(slice);
    };

    // Small delay to ensure metadata arrives before binary chunks
    setTimeout(() => readSlice(0), 100);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-2xl">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Transfer Room</h1>
          <p className="text-slate-500 mt-2">Room ID: <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{roomId}</span></p>
        </div>

        {isSender && !peerConnected && (
          <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider">Share this link to connect</p>
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={inviteLink} className="flex-1 p-3 bg-white border border-gray-300 rounded-lg text-gray-600 font-mono text-sm focus:outline-none"/>
              <button onClick={copyToClipboard} className="flex items-center justify-center p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors min-w-[100px]">
                {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="ml-2 font-medium">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center p-4 border border-slate-200 rounded-xl bg-slate-50 mb-6 transition-all">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <FileIcon className="w-8 h-8" />
          </div>
          <div className="flex-1 truncate">
            <p className="font-semibold text-slate-800 truncate">
              {isSender ? fileToShare.name : (expectedMeta.current ? expectedMeta.current.name : 'Awaiting file info...')}
            </p>
            <p className="text-sm text-slate-500">
              {isSender ? `${(fileToShare.size / (1024 * 1024)).toFixed(2)} MB` : (expectedMeta.current ? `${(expectedMeta.current.size / (1024 * 1024)).toFixed(2)} MB` : 'Size unknown')}
            </p>
          </div>
          <div className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-colors duration-300
            ${peerConnected ? (transferComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700') : 'bg-amber-100 text-amber-700 animate-pulse'}`}
          >
            {peerConnected && !transferComplete && <Activity className="w-4 h-4 animate-bounce" />}
            {transferComplete && <CheckCircle className="w-4 h-4" />}
            {connectionStatus}
          </div>
        </div>

        {/* Transfer Controls & Progress Bar */}
        {peerConnected && (
          <div className="mt-6 flex flex-col items-center">
            {isSender && !isTransferring && !transferComplete && (
              <button 
                onClick={sendFile}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-md"
              >
                <Send className="w-5 h-5" />
                Send File Now
              </button>
            )}

            {(isTransferring || transferComplete) && (
              <div className="w-full">
                <div className="flex justify-between text-sm font-medium text-slate-600 mb-2">
                  <span>{isSender ? 'Uploading...' : 'Downloading...'}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {transferComplete && !isSender && (
              <p className="text-green-600 font-semibold flex items-center gap-2 mt-2">
                <Download className="w-5 h-5" /> File saved to your downloads folder.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Room;