import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MonitorUp, Tv2, Users, AlertCircle, RefreshCw, Camera, Maximize, Minimize } from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export function ScreenMirror({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<'idle' | 'host' | 'join'>('idle');
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to the signaling server (uses VITE_SERVER_URL for Capacitor Android or relative host for browser)
    const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;
    socketRef.current = serverUrl ? io(serverUrl) : io();

    const handleFullscreenChange = () => {
      setIsFullscreen(
        Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement)
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      cleanup();
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      const container = videoContainerRef.current;
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement || (document as any).webkitFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        if (container) {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          } else if ((container as any).webkitRequestFullscreen) {
            await (container as any).webkitRequestFullscreen();
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const setupSocketListeners = (isHost: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.off('user-joined');
    socket.off('offer');
    socket.off('answer');
    socket.off('ice-candidate');

    socket.on('user-joined', async (callerId) => {
      if (isHost) {
        setStatus('Viewer joined, connecting...');
        await createOffer(callerId);
      }
    });

    socket.on('offer', async (payload) => {
      if (!isHost) {
        setStatus('Receiving stream...');
        await handleOffer(payload);
      }
    });

    socket.on('answer', async (payload) => {
      if (isHost) {
        setStatus('Connected!');
        await handleAnswer(payload);
      }
    });

    socket.on('ice-candidate', async (payload) => {
      await handleIceCandidate(payload);
    });
  };

  const createPeerConnection = (targetId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          target: targetId,
          caller: socketRef.current.id,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('Disconnected');
      }
    };

    return pc;
  };

  // HOST LOGIC
  const getPersistentRoomId = () => {
    let id = localStorage.getItem('castlink_room_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem('castlink_room_id', id);
    }
    return id;
  };

  const startHosting = async (sourceType: 'screen' | 'camera' = 'screen') => {
    try {
      setError('');
      setStatus(`Requesting ${sourceType} access...`);
      let stream: MediaStream;
      
      if (sourceType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // Try to get back camera by default
          audio: true,
        });
      }
      
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Mute local preview
      }

      const generatedId = getPersistentRoomId();
      setRoomId(generatedId);
      
      const socket = socketRef.current;
      if (socket) {
        socket.emit('join-room', generatedId);
        setupSocketListeners(true);
        setStatus(`Hosting room: ${generatedId}. Waiting for viewer...`);
        setMode('host');
      }

      // Handle user stopping the stream natively
      stream.getVideoTracks()[0].onended = () => {
        stopSession();
      };
    } catch (err: any) {
      setError(err.message || 'Failed to capture screen');
      setStatus('Failed');
    }
  };

  const createOffer = async (targetId: string) => {
    const pc = createPeerConnection(targetId);
    
    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current?.emit('offer', {
      target: targetId,
      caller: socketRef.current.id,
      sdp: pc.localDescription,
    });
  };

  // JOIN LOGIC
  const joinRoom = () => {
    if (!roomId.trim()) {
      setError('Please enter a room code');
      return;
    }
    setError('');
    setStatus('Joining room...');
    
    const socket = socketRef.current;
    if (socket) {
      socket.emit('join-room', roomId.toUpperCase());
      setupSocketListeners(false);
      setMode('join');
    }
  };

  const handleOffer = async (payload: any) => {
    const pc = createPeerConnection(payload.caller);
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current?.emit('answer', {
      target: payload.caller,
      caller: socketRef.current.id,
      sdp: pc.localDescription,
    });
    setStatus('Connected & viewing stream');
  };

  const handleAnswer = async (payload: any) => {
    const pc = peerConnectionRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }
  };

  const handleIceCandidate = async (payload: any) => {
    const pc = peerConnectionRef.current;
    if (pc && payload.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (e) {
        console.error('Error adding ice candidate', e);
      }
    }
  };

  const stopSession = () => {
    cleanup();
    setMode('idle');
    setRoomId('');
    setStatus('Idle');
    
    // Reconnect socket for next session
    const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;
    socketRef.current = serverUrl ? io(serverUrl) : io();
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-white">
            <MonitorUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-slate-900 font-bold text-lg leading-tight">CastLink Enterprise</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold">Proctoring Console</p>
          </div>
        </div>
        <button 
          onClick={onExit}
          className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 shadow-sm"
        >
          Exit Console
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center p-6 overflow-y-auto">
        {mode === 'idle' && (
          <div className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center space-y-8">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-light text-slate-800 mb-2">Select Connection Protocol</h2>
              <p className="text-slate-500 text-sm">Initiate a secure local session or connect to an active host.</p>
            </div>
            
            <div className="grid w-full sm:grid-cols-3 gap-6">
              <button
                onClick={() => startHosting('screen')}
                className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-blue-500 hover:shadow-md hover:-translate-y-1"
              >
                <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <MonitorUp className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">Screen Host</h3>
                <p className="mt-2 text-center text-xs text-slate-500 leading-relaxed">
                  Start transmitting the local display feed.
                </p>
              </button>

              <button
                onClick={() => startHosting('camera')}
                className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-purple-500 hover:shadow-md hover:-translate-y-1"
              >
                <div className="mb-4 rounded-2xl bg-purple-50 p-4 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Camera className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">Camera Host</h3>
                <p className="mt-2 text-center text-xs text-slate-500 leading-relaxed">
                  Start transmitting the live camera feed.
                </p>
              </button>

              <div className="flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-emerald-500 hover:shadow-md">
                <div className="flex flex-col items-center">
                  <div className="mb-4 rounded-2xl bg-emerald-50 p-4 text-emerald-600">
                    <Tv2 className="h-8 w-8" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">Connect</h3>
                </div>
                <div className="mt-4 flex w-full flex-col space-y-3">
                  <input
                    type="text"
                    placeholder="Enter Session ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold tracking-widest text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                  <button
                    onClick={joinRoom}
                    className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 shadow-md shadow-emerald-200"
                  >
                    ESTABLISH LINK
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100 shadow-sm w-full max-w-md">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        {mode !== 'idle' && (
          <div className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center space-y-6">
            {/* Video Container */}
            <div
              ref={videoContainerRef}
              onDoubleClick={toggleFullscreen}
              className={`relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-lg group ${
                isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none aspect-auto bg-black flex items-center justify-center' : ''
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />

              {/* Floating Fullscreen Overlay Button */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 z-20 flex items-center space-x-1.5 rounded-xl bg-black/60 backdrop-blur-md px-3 py-2 text-xs font-semibold text-white shadow-lg transition-all hover:bg-black/80 hover:scale-105 active:scale-95 opacity-80 group-hover:opacity-100"
                title={isFullscreen ? 'Exit Full Screen' : 'View Full Screen (or double-click video)'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize className="h-4 w-4" />
                    <span>Exit Full Screen</span>
                  </>
                ) : (
                  <>
                    <Maximize className="h-4 w-4" />
                    <span>Full Screen</span>
                  </>
                )}
              </button>
              
              {!videoRef.current?.srcObject && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-md">
                  <RefreshCw className="h-8 w-8 animate-spin text-white mb-4" />
                  <p className="text-white font-medium tracking-wide">{status}</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between w-full rounded-2xl border border-slate-200 bg-white p-4 sm:px-8 shadow-sm gap-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-sm font-semibold text-slate-600">
                  <div className={`h-2.5 w-2.5 rounded-full ${status.includes('Connected') ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 animate-pulse'}`} />
                  <span>{status}</span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
                {/* Full Screen Control Button */}
                <button
                  onClick={toggleFullscreen}
                  className="flex items-center space-x-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 shadow-sm"
                  title={isFullscreen ? 'Exit Full Screen' : 'View Full Screen'}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4 text-slate-600" /> : <Maximize className="h-4 w-4 text-slate-600" />}
                  <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>

                {mode === 'host' && (
                  <>
                    <div className="flex items-center space-x-3 border-r border-slate-200 pr-3 sm:pr-4">
                      <span className="text-xs uppercase font-bold text-slate-400">Session ID</span>
                      <span className="select-all rounded-lg bg-slate-50 px-3 py-1 font-mono text-lg font-bold tracking-widest text-slate-800 border border-slate-200">
                        {roomId}
                      </span>
                    </div>
                    <button
                      onClick={onExit}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 shadow-sm hidden sm:block"
                      title="Hide mirror interface and return to game, continuing to stream in background"
                    >
                      Hide Interface
                    </button>
                  </>
                )}
                
                <button
                  onClick={stopSession}
                  className="rounded-xl bg-red-50 border border-red-100 px-5 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 shadow-sm"
                >
                  TERMINATE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
