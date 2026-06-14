import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const Home = () => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4">
    <h1 className="text-4xl font-bold text-blue-600 mb-4">P2P Web Share</h1>
    <p className="text-gray-600 mb-8">Drop a file to generate a secure, peer-to-peer sharing room.</p>
    <div className="w-full max-w-md p-10 border-2 border-dashed border-blue-400 rounded-xl bg-white text-center hover:bg-blue-50 transition cursor-pointer">
      <p className="text-blue-500 font-medium">Drag & Drop files here (Phase 3)</p>
    </div>
  </div>
);

const Room = () => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4">
    <h1 className="text-3xl font-bold text-green-600 mb-4">Transfer Room</h1>
    <p className="text-gray-600">Connecting to peer... (WebRTC logic goes here)</p>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </Router>
  );
}

export default App;