import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileWarning, Lock } from 'lucide-react';
import { generateEncryptionKey } from '../utils/crypto';

const Home = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      setError('File is too large. Please select a file under 50MB.');
      return;
    }

    const file = acceptedFiles[0];
    if (file) {
      setIsGenerating(true);
      setError(''); // Clear previous errors
      
      try {
        console.log("[+] 1. Generating Room ID...");
        const roomId = Math.random().toString(36).substring(2, 8);
        
        console.log("[+] 2. Generating Encryption Key...");
        const urlSafeKey = await generateEncryptionKey();
        
        console.log("[+] 3. Success! Key is:", urlSafeKey);
        
        console.log("[+] 4. Navigating to room...");
        // Using standard string interpolation for React Router v6
        navigate(`/room/${roomId}#key=${urlSafeKey}`, { state: { file } });
        
      } catch (err) {
        console.error("[-] CRYPTO ERROR:", err);
        setError('Failed to generate secure encryption keys. Check console.');
        setIsGenerating(false);
      }
    }
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50">
      
      <div className="absolute top-6 right-6 flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 text-sm font-semibold shadow-sm">
        <Lock className="w-4 h-4 mr-1.5" /> End-to-End Encrypted
      </div>

      <h1 className="text-5xl font-extrabold text-blue-600 mb-2 tracking-tight">P2P Web Share</h1>
      <p className="text-gray-500 mb-10 text-lg">Direct, secure, serverless file transfer.</p>

      <div 
        {...getRootProps()} 
        className={`w-full max-w-lg p-12 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer 
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'}
          ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
        
        {isGenerating ? (
          <p className="text-xl font-semibold text-blue-500 animate-pulse">Generating AES-256 Keys...</p>
        ) : isDragActive ? (
          <p className="text-xl font-semibold text-blue-500">Drop the file here...</p>
        ) : (
          <div>
            <p className="text-xl font-medium text-gray-700">Drag & drop a file here</p>
            <p className="text-sm text-gray-400 mt-2">or click to browse from your device</p>
            <p className="text-xs text-gray-400 mt-4">Max file size: 50MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 flex items-center text-red-500 bg-red-50 py-2 px-4 rounded-lg">
          <FileWarning className="w-5 h-5 mr-2" />
          <span className="font-medium">{error}</span>
        </div>
      )}
    </div>
  );
};

export default Home;