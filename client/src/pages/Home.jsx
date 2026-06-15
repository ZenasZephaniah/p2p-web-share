import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileWarning, Lock, Link as LinkIcon, ArrowRight, Shield, Zap, ServerOff, PlusCircle, LogIn, ArrowLeft } from 'lucide-react';
import { generateEncryptionKey } from '../utils/crypto';

const Home = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('initial'); // 'initial', 'create', 'join'
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [joinLink, setJoinLink] = useState('');

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      setError('File is too large. Please select a file under 50MB for optimal browser memory.');
      return;
    }

    const file = acceptedFiles[0];
    if (file) {
      setIsGenerating(true);
      setError(''); 
      try {
        const roomId = Math.random().toString(36).substring(2, 8);
        const urlSafeKey = await generateEncryptionKey();
        navigate(`/room/${roomId}#key=${urlSafeKey}`, { state: { file } });
      } catch (err) {
        setError('Failed to generate secure encryption keys. Check console.');
        setIsGenerating(false);
      }
    }
  }, [navigate]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!joinLink.trim()) return;
    
    try {
      const url = new URL(joinLink);
      if (url.pathname.includes('/room/') && url.hash.includes('#key=')) {
        navigate(url.pathname + url.hash);
      } else {
        setError('Invalid secure link. You must paste the full URL containing the #key fragment to decrypt files.');
      }
    } catch {
      setError('Invalid link format. Please paste the full URL (e.g., https://...)');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50 relative">
      
      {/* Top Badge */}
      <div className="absolute top-6 right-6 flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 text-sm font-semibold shadow-sm">
        <Lock className="w-4 h-4 mr-1.5" /> End-to-End Encrypted
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col items-center mt-12">
        <h1 className="text-5xl font-extrabold text-blue-600 mb-2 tracking-tight text-center">P2P Web Share</h1>
        <p className="text-gray-500 mb-10 text-lg text-center">Direct, secure, serverless file transfer.</p>

        {/* WIZARD FLOW */}
        <div className="w-full max-w-2xl mx-auto">
          
          {/* MODE 1: INITIAL SELECTION */}
          {mode === 'initial' && (
            <div className="grid md:grid-cols-2 gap-6 w-full">
              <button 
                onClick={() => setMode('create')}
                className="flex flex-col items-center text-center p-8 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-blue-400 hover:shadow-md hover:-translate-y-1 transition-all group"
              >
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <PlusCircle className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Create a Room</h2>
                <p className="text-sm text-slate-500">Generate a secure environment and encryption keys to send a file.</p>
              </button>

              <button 
                onClick={() => setMode('join')}
                className="flex flex-col items-center text-center p-8 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-slate-800 hover:shadow-md hover:-translate-y-1 transition-all group"
              >
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mb-4 group-hover:bg-slate-200 transition-colors">
                  <LogIn className="w-8 h-8 text-slate-800" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Join a Room</h2>
                <p className="text-sm text-slate-500">Enter an existing room using a secure invite link to receive a file.</p>
              </button>
            </div>
          )}

          {/* MODE 2: CREATE ROOM (DRAG & DROP) */}
          {mode === 'create' && (
            <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button onClick={() => {setMode('initial'); setError('');}} className="self-start flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <div 
                {...getRootProps()} 
                className={`p-12 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer flex flex-col justify-center
                  ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'}
                  ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                <UploadCloud className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                {isGenerating ? (
                  <p className="text-xl font-semibold text-blue-500 animate-pulse">Generating AES Keys...</p>
                ) : isDragActive ? (
                  <p className="text-xl font-semibold text-blue-500">Drop to secure & share...</p>
                ) : (
                  <div>
                    <p className="text-xl font-medium text-gray-700">Drag & drop a file here</p>
                    <p className="text-sm text-gray-400 mt-2">or click to browse from your device</p>
                    <p className="text-xs text-gray-400 mt-6 font-bold uppercase tracking-wider">Max file size: 50MB</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODE 3: JOIN ROOM */}
          {mode === 'join' && (
            <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button onClick={() => {setMode('initial'); setError('');}} className="self-start flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <div className="p-10 border border-gray-200 rounded-2xl bg-white shadow-sm flex flex-col items-center">
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                  <LinkIcon className="w-8 h-8 text-slate-700" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Paste Invite Link</h2>
                <p className="text-center text-gray-500 mb-6">You need the full URL containing the secure key fragment to decrypt incoming files.</p>
                
                <form onSubmit={handleJoin} className="flex flex-col gap-4 w-full max-w-md">
                  <input 
                    type="text" 
                    placeholder="https://...#key=..." 
                    value={joinLink}
                    onChange={(e) => setJoinLink(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button 
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white p-4 rounded-xl font-bold transition-all text-lg"
                  >
                    Join Secure Room <ArrowRight className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 flex items-center text-red-500 bg-red-50 py-3 px-5 rounded-xl w-full max-w-2xl border border-red-100 animate-in fade-in">
            <FileWarning className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="font-medium text-sm">{error}</span>
          </div>
        )}

        {/* DOCS / HOW IT WORKS */}
        <div className="mt-20 w-full max-w-4xl border-t border-slate-200 pt-10 pb-10">
          <h3 className="text-center text-sm font-bold text-slate-400 uppercase tracking-wider mb-8">How it works</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center px-4">
              <ServerOff className="w-8 h-8 text-slate-400 mb-3" />
              <h4 className="font-bold text-slate-700 mb-2">Direct P2P Transfer</h4>
              <p className="text-sm text-slate-500">Files are streamed directly between browsers using WebRTC. No servers store your data.</p>
            </div>
            <div className="flex flex-col items-center text-center px-4">
              <Shield className="w-8 h-8 text-slate-400 mb-3" />
              <h4 className="font-bold text-slate-700 mb-2">Zero-Knowledge Security</h4>
              <p className="text-sm text-slate-500">Files are AES-GCM encrypted in memory. The decryption key is passed in the URL hash, hidden from servers.</p>
            </div>
            <div className="flex flex-col items-center text-center px-4">
              <Zap className="w-8 h-8 text-slate-400 mb-3" />
              <h4 className="font-bold text-slate-700 mb-2">Cryptographic Verification</h4>
              <p className="text-sm text-slate-500">Each file generates a SHA-256 hash. The receiver automatically verifies it to guarantee zero corruption.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;