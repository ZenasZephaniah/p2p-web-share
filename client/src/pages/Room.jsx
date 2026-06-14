import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, CheckCircle, File as FileIcon } from 'lucide-react';

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  
  // If location.state.file exists, this user is the SENDER.
  // If not, they are the RECEIVER joining via a link.
  const fileToShare = location.state?.file;
  const isSender = !!fileToShare;

  const inviteLink = `${window.location.origin}/room/${roomId}`;

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

        {/* Invite Link Section (Only show prominently if Sender) */}
        {isSender && (
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
        <div className="flex items-center p-4 border border-slate-200 rounded-xl bg-slate-50 mb-6">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <FileIcon className="w-8 h-8" />
          </div>
          <div className="flex-1 truncate">
            <p className="font-semibold text-slate-800 truncate">
              {isSender ? fileToShare.name : 'Waiting for file info...'}
            </p>
            <p className="text-sm text-slate-500">
              {isSender ? `${(fileToShare.size / (1024 * 1024)).toFixed(2)} MB` : 'Size unknown'}
            </p>
          </div>
          <div className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full animate-pulse">
            Waiting for peer...
          </div>
        </div>

      </div>
    </div>
  );
};

export default Room;