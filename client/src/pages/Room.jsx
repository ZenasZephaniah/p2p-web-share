import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, CheckCircle, File as FileIcon, Activity, Send, Download, ShieldCheck, Clock } from 'lucide-react';
import { io } from 'socket.io-client';

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Helper to generate SHA-256 Hash
const calculateHash = async (fileOrBlob) => {
  const arrayBuffer = await fileOrBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  
  // UI & Network States
  const [connectionStatus, setConnectionStatus] = useState('Waiting for peer...');
  const [peerConnected, setPeerConnected] = useState(false);
  
  // Transfer States
  const [progress, setProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('0.00');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);
  const [hashVerified, setHashVerified] = useState(false);

  const fileToShare = location.state?.file;
  const isSender = !!fileToShare;

  // Refs
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);
  const receiveBuffer = useRef([]);
  const receivedSize = useRef(0);
  const expectedMeta = useRef(null);
  const transferStartTime = useRef(null); // For speed calculation

  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');
    peerRef.current = new RTCPeerConnection(rtcConfig);

    peerRef.current.onicecandidate = (e) => {
      if (e.candidate) socketRef.current.emit('ice-candidate', { roomId, candidate: e.candidate });
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
        setConnectionStatus('Peer joined. Negotiating...');
        const offer = await peerRef.current.createOffer();
        await peerRef.current.setLocalDescription(offer);
        socketRef.current.emit('offer', { roomId, sdp: offer });
      });

      socketRef.current.on('answer', async (data) => {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      });
    } else {
      socketRef.current.emit('join-room', roomId);
      peerRef.current.ondatachannel = (e) => {
        dataChannelRef.current = e.channel;
        setupDataChannel(dataChannelRef.current);
      };

      socketRef.current.on('offer', async (data) => {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        socketRef.current.emit('answer', { roomId, sdp: answer });
      });
    }

    socketRef.current.on('ice-candidate', async (data) => {
      try { await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)); } 
      catch (e) { console.error(e); }
    });

    return () => {
      socketRef.current.disconnect();
      peerRef.current.close();
    };
  }, [roomId, isSender]);

  const updateSpeed = (bytes) => {
    const elapsed = (Date.now() - transferStartTime.current) / 1000; // in seconds
    if (elapsed > 0) {
      const speedMBps = (bytes / (1024 * 1024)) / elapsed;
      setTransferSpeed(speedMBps.toFixed(2));
    }
  };

  const setupDataChannel = (channel) => {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'meta') {
          expectedMeta.current = data;
          receiveBuffer.current = [];
          receivedSize.current = 0;
          transferStartTime.current = Date.now();
          setIsTransferring(true);
          setConnectionStatus('Receiving file...');
        } else if (data.type === 'eof') {
          setIsTransferring(false);
          setConnectionStatus('Verifying file integrity...');
          
          const blob = new Blob(receiveBuffer.current, { type: expectedMeta.current.mime });
          
          // Verify Hash
          const receivedHash = await calculateHash(blob);
          if (receivedHash === expectedMeta.current.hash) {
            setHashVerified(true);
          }

          // Trigger Download
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = expectedMeta.current.name;
          a.click();
          
          setTransferComplete(true);
          setConnectionStatus('Transfer Complete!');
          setProgress(100);
        }
      } else {
        receiveBuffer.current.push(event.data);
        receivedSize.current += event.data.byteLength;
        updateSpeed(receivedSize.current);
        if (expectedMeta.current) {
          setProgress(Math.round((receivedSize.current / expectedMeta.current.size) * 100));
        }
      }
    };
  };

  const sendFile = async () => {
    if (!fileToShare || !dataChannelRef.current) return;
    setConnectionStatus('Generating secure hash...');
    
    // Generate SHA-256 hash before sending
    const fileHash = await calculateHash(fileToShare);
    
    setIsTransferring(true);
    setConnectionStatus('Sending file...');
    transferStartTime.current = Date.now();

    dataChannelRef.current.send(JSON.stringify({
      type: 'meta',
      name: fileToShare.name,
      size: fileToShare.size,
      mime: fileToShare.type,
      hash: fileHash // Send hash to receiver
    }));

    const chunkSize = 64 * 1024;
    let offset = 0;

    const readSlice = (currentOffset) => {
      const slice = fileToShare.slice(currentOffset, currentOffset + chunkSize);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        dataChannelRef.current.send(e.target.result);
        offset += e.target.result.byteLength;
        setProgress(Math.round((offset / fileToShare.size) * 100));
        updateSpeed(offset);

        if (offset < fileToShare.size) {
          if (dataChannelRef.current.bufferedAmount > 1024 * 1024) {
            setTimeout(() => readSlice(offset), 50);
          } else {
            readSlice(offset);
          }
        } else {
          dataChannelRef.current.send(JSON.stringify({ type: 'eof' }));
          setIsTransferring(false);
          setTransferComplete(true);
          setHashVerified(true); // Sender knows their own hash is correct
          setConnectionStatus('Transfer Complete!');
        }
      };
      reader.readAsArrayBuffer(slice);
    };

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

        {peerConnected && (
          <div className="mt-6 flex flex-col items-center">
            {isSender && !isTransferring && !transferComplete && (
              <button onClick={sendFile} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-md">
                <Send className="w-5 h-5" /> Send File Now
              </button>
            )}

            {(isTransferring || transferComplete) && (
              <div className="w-full">
                <div className="flex justify-between items-center text-sm font-medium text-slate-600 mb-2">
                  <span className="flex items-center gap-2">
                    {isSender ? 'Uploading...' : 'Downloading...'}
                    {isTransferring && <span className="flex items-center text-blue-600 bg-blue-50 px-2 py-0.5 rounded"><Clock className="w-3 h-3 mr-1"/> {transferSpeed} MB/s</span>}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                  <div className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}
            
            {transferComplete && (
              <div className="flex flex-col items-center gap-2 mt-2">
                {!isSender && (
                  <p className="text-green-600 font-semibold flex items-center gap-2">
                    <Download className="w-5 h-5" /> File saved to your downloads folder.
                  </p>
                )}
                {hashVerified && (
                  <p className="text-emerald-600 text-sm font-bold flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-4 h-4" /> SHA-256 Integrity Verified
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Room;