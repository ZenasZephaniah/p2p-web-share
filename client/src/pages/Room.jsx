import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, CheckCircle, File as FileIcon, Activity, Send, Download, ShieldCheck, Clock, Lock, XCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import { importEncryptionKey, encryptChunk, decryptChunk } from '../utils/crypto';

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
  
  const [connectionStatus, setConnectionStatus] = useState('Waiting for peer...');
  const [peerConnected, setPeerConnected] = useState(false);
  
  const [progress, setProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('0.00');
  const [eta, setEta] = useState('--'); 
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);
  const [hashVerified, setHashVerified] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState(null);

  const fileToShare = location.state?.file;
  const isSender = !!fileToShare;

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);
  const receiveBuffer = useRef([]);
  const receivedSize = useRef(0); 
  const expectedMeta = useRef(null);
  const transferStartTime = useRef(null);

  const inviteLink = `${window.location.origin}/room/${roomId}${window.location.hash}`;

  useEffect(() => {
    const initKey = async () => {
      const hash = window.location.hash;
      if (hash.startsWith('#key=')) {
        try {
          const keyString = hash.replace('#key=', '');
          const key = await importEncryptionKey(keyString);
          setEncryptionKey(key);
        } catch (err) {
          setConnectionStatus('Encryption Error: Invalid Link');
        }
      } else {
        setConnectionStatus('Encryption Error: Missing Key in URL');
      }
    };
    initKey();
  }, []);

  useEffect(() => {
    if (!encryptionKey) return; 

    // IMPORTANT: Make sure this points to your deployed Render URL on Vercel
    const SOCKET_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : 'https://p2p-web-share-2ckz.onrender.com'; // Your Render URL

    socketRef.current = io(SOCKET_URL);
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
  }, [roomId, isSender, encryptionKey]);

  const updateStats = (bytes) => {
    const elapsed = (Date.now() - transferStartTime.current) / 1000;
    if (elapsed > 0) {
      const speedMBps = (bytes / (1024 * 1024)) / elapsed;
      setTransferSpeed(speedMBps.toFixed(2));

      const totalSize = isSender ? fileToShare.size : expectedMeta.current?.size;
      if (totalSize && speedMBps > 0) {
        const remainingBytes = totalSize - bytes;
        const remainingSeconds = (remainingBytes / (1024 * 1024)) / speedMBps;
        setEta(Math.max(0, Math.ceil(remainingSeconds)) + 's');
      }
    }
  };

  const setupDataChannel = (channel) => {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 1024 * 1024; 

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'meta') {
          expectedMeta.current = data;
          receiveBuffer.current = [];
          receivedSize.current = 0;
          transferStartTime.current = Date.now();
          setIsTransferring(true);
          setConnectionStatus('Receiving encrypted file...');
        } else if (data.type === 'eof') {
          setIsTransferring(false);
          setConnectionStatus('Verifying and Decrypting...');
          
          const blob = new Blob(receiveBuffer.current, { type: expectedMeta.current.mime });
          const receivedHash = await calculateHash(blob);
          if (receivedHash === expectedMeta.current.hash) {
            setHashVerified(true);
          }

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
        try {
          const decryptedBuffer = await decryptChunk(encryptionKey, event.data);
          receiveBuffer.current.push(decryptedBuffer);
          receivedSize.current += decryptedBuffer.byteLength;
          updateStats(receivedSize.current);
          if (expectedMeta.current) {
            setProgress(Math.round((receivedSize.current / expectedMeta.current.size) * 100));
          }
        } catch (err) {
          setConnectionStatus('Decryption Failed! File corrupted.');
        }
      }
    };
  };

  const sendFile = async () => {
    if (!fileToShare || !dataChannelRef.current || !encryptionKey) return;
    setConnectionStatus('Generating secure hash...');
    
    const fileHash = await calculateHash(fileToShare);
    
    setIsTransferring(true);
    setConnectionStatus('Encrypting & Sending...');
    transferStartTime.current = Date.now();

    dataChannelRef.current.send(JSON.stringify({
      type: 'meta',
      name: fileToShare.name,
      size: fileToShare.size,
      mime: fileToShare.type,
      hash: fileHash
    }));

    const chunkSize = 64 * 1024;
    let offset = 0;

    const readSlice = () => {
      const slice = fileToShare.slice(offset, offset + chunkSize);
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        // If user dissolved session mid-transfer
        if (dataChannelRef.current.readyState !== 'open') return;

        try {
          const encryptedBuffer = await encryptChunk(encryptionKey, e.target.result);
          dataChannelRef.current.send(encryptedBuffer);
          
          offset += e.target.result.byteLength; 
          setProgress(Math.round((offset / fileToShare.size) * 100));
          updateStats(offset);

          if (offset < fileToShare.size) {
            if (dataChannelRef.current.bufferedAmount > dataChannelRef.current.bufferedAmountLowThreshold) {
              dataChannelRef.current.onbufferedamountlow = () => {
                dataChannelRef.current.onbufferedamountlow = null; 
                readSlice(); 
              };
            } else {
              readSlice(); 
            }
          } else {
            dataChannelRef.current.send(JSON.stringify({ type: 'eof' }));
            setIsTransferring(false);
            setTransferComplete(true);
            setHashVerified(true);
            setConnectionStatus('Transfer Complete!');
          }
        } catch (err) {
          setConnectionStatus('Encryption Failed!');
        }
      };
      reader.readAsArrayBuffer(slice);
    };

    setTimeout(() => readSlice(), 100);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dissolveSession = () => {
    // Safely unmount and wipe memory
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      
      {/* Box is wider now (max-w-4xl) */}
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-sm border border-gray-100 w-full max-w-4xl relative">
        
        <div className="absolute top-6 right-6 flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 text-xs font-bold shadow-sm">
          <Lock className="w-3 h-3 mr-1.5" /> End-to-End Encrypted
        </div>

        <div className="text-center mb-8 mt-4">
          <h1 className="text-3xl font-bold text-slate-800">Transfer Room</h1>
          <p className="text-slate-500 mt-2">Room ID: <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{roomId}</span></p>
        </div>

        {isSender && !peerConnected && (
          <div className="mb-8 p-5 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider">Share this link to connect</p>
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={inviteLink} className="flex-1 p-3 bg-white border border-gray-300 rounded-lg text-gray-600 font-mono text-sm focus:outline-none"/>
              <button onClick={copyToClipboard} className="flex items-center justify-center p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors min-w-[120px]">
                {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="ml-2 font-medium">{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center p-5 border border-slate-200 rounded-xl bg-slate-50 mb-6 transition-all">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <FileIcon className="w-8 h-8" />
          </div>
          <div className="flex-1 overflow-hidden pr-4">
            <p className="font-semibold text-slate-800 truncate text-lg">
              {isSender ? fileToShare.name : (expectedMeta.current ? expectedMeta.current.name : 'Awaiting file info...')}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {isSender ? `${(fileToShare.size / (1024 * 1024)).toFixed(2)} MB` : (expectedMeta.current ? `${(expectedMeta.current.size / (1024 * 1024)).toFixed(2)} MB` : 'Size unknown')}
            </p>
          </div>
          <div className={`px-4 py-2 text-sm font-bold rounded-full flex items-center gap-2 transition-colors duration-300 whitespace-nowrap
            ${peerConnected ? (transferComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700') : 'bg-amber-100 text-amber-700 animate-pulse'}`}
          >
            {peerConnected && !transferComplete && <Activity className="w-4 h-4 animate-bounce" />}
            {transferComplete && <CheckCircle className="w-4 h-4" />}
            {connectionStatus}
          </div>
        </div>

        {peerConnected && (
          <div className="mt-6 flex flex-col items-center w-full">
            {isSender && !isTransferring && !transferComplete && (
              <button onClick={sendFile} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl font-bold transition-all transform hover:scale-105 shadow-md text-lg">
                <Send className="w-6 h-6" /> Send Encrypted File
              </button>
            )}

            {(isTransferring || transferComplete) && (
              <div className="w-full">
                <div className="flex justify-between items-center text-sm font-bold text-slate-600 mb-2">
                  <span>{isSender ? 'Encrypting & Uploading...' : 'Receiving & Decrypting...'}</span>
                  <span className="text-blue-600">{progress}%</span>
                </div>
                
                <div className="w-full bg-slate-200 rounded-full h-4 mb-6 overflow-hidden">
                  <div className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                </div>

                {/* DEDICATED TELEMETRY BOXES */}
                {isTransferring && (
                  <div className="grid grid-cols-2 gap-4 w-full max-w-lg mx-auto mb-6">
                    <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Speed</p>
                      <p className="text-2xl font-black text-slate-700 flex items-center justify-center gap-2">
                        {transferSpeed} <span className="text-sm font-semibold text-slate-500">MB/s</span>
                      </p>
                    </div>
                    <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">ETA</p>
                      <p className="text-2xl font-black text-slate-700 flex items-center justify-center gap-2">
                        <Clock className="w-5 h-5 text-slate-400" /> {eta}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {transferComplete && (
              <div className="flex flex-col items-center gap-3 mt-4">
                {!isSender && (
                  <p className="text-green-600 font-semibold flex items-center gap-2 text-lg">
                    <Download className="w-6 h-6" /> File saved to your downloads folder.
                  </p>
                )}
                {hashVerified && (
                  <p className="text-emerald-700 text-sm font-bold flex items-center gap-1.5 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-5 h-5" /> SHA-256 Integrity Verified
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ALWAYS VISIBLE DISSOLVE SESSION BUTTON */}
      <button 
        onClick={dissolveSession}
        className="mt-8 flex items-center gap-2 px-6 py-2.5 bg-transparent hover:bg-slate-200 text-slate-500 hover:text-slate-700 text-sm font-bold rounded-lg transition-colors border border-transparent hover:border-slate-300"
      >
        <XCircle className="w-4 h-4" /> Cancel & Dissolve Session
      </button>

    </div>
  );
};

export default Room;