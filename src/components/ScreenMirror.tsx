import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MonitorUp, Tv2, AlertCircle, RefreshCw, Camera, Maximize, Minimize, Wifi, WifiOff } from 'lucide-react';
import { startBackgroundStreaming, stopBackgroundStreaming } from '../backgroundStreaming';
import { isAndroidNative, getAndroidScreenStream, stopAndroidScreenCapture, onScreenFrame } from '../screenCapture';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://math-pro-jq8m.onrender.com';

const getSocketServerUrl = () => {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost') {
    return undefined;
  }
  return DEFAULT_SERVER_URL;
};

export function ScreenMirror({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<'idle' | 'host' | 'join'>('idle');
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [latestSocketFrame, setLatestSocketFrame] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  
  const modeRef = useRef<'idle' | 'host' | 'join'>('idle');
  const roomIdRef = useRef('');
  const isTerminatedRef = useRef(false);
  const lastViewerIdRef = useRef<string | null>(null);

  modeRef.current = mode;
  roomIdRef.current = roomId;

  useEffect(() => {
    isTerminatedRef.current = false;
    connectSocket();

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

  // Frame forwarding from Android native host to viewers via socket fallback
  useEffect(() => {
    if (mode === 'host' && isAndroidNative()) {
      const unsubscribe = onScreenFrame((base64Jpeg) => {
        if (socketRef.current?.connected && roomIdRef.current && !isTerminatedRef.current) {
          socketRef.current.emit('screen-frame', {
            roomId: roomIdRef.current,
            frame: base64Jpeg,
          });
        }
      });
      return unsubscribe;
    }
  }, [mode]);

  const connectSocket = () => {
    const serverUrl = getSocketServerUrl();
    const socket = serverUrl
      ? io(serverUrl, { reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 })
      : io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected to signaling server, ID:', socket.id);
      if (!isTerminatedRef.current && modeRef.current !== 'idle' && roomIdRef.current) {
        setStatus(`Reconnected! Re-joining room: ${roomIdRef.current}...`);
        socket.emit('join-room', roomIdRef.current);
        setupSocketListeners(modeRef.current === 'host');
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      if (!isTerminatedRef.current && modeRef.current !== 'idle') {
        setStatus('Network reconnecting...');
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
      if (!isTerminatedRef.current && modeRef.current !== 'idle') {
        setStatus('Reconnecting to server...');
      }
    });
  };

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
    stopAndroidScreenCapture();
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
    iceCandidateQueueRef.current = [];
    setHasRemoteVideo(false);
    setLatestSocketFrame(null);
  };

  const drainIceCandidates = async (pc: RTCPeerConnection) => {
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding queued ICE candidate', e);
        }
      }
    }
  };

  const setupSocketListeners = (isHost: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.off('user-joined');
    socket.off('offer');
    socket.off('answer');
    socket.off('ice-candidate');
    socket.off('screen-frame');

    socket.on('user-joined', async (callerId) => {
      if (isHost && !isTerminatedRef.current) {
        lastViewerIdRef.current = callerId;
        setStatus('Viewer joined, establishing live link...');
        await createOffer(callerId);
      }
    });

    socket.on('offer', async (payload) => {
      if (!isHost && !isTerminatedRef.current) {
        setStatus('Receiving live feed...');
        await handleOffer(payload);
      }
    });

    socket.on('answer', async (payload) => {
      if (isHost && !isTerminatedRef.current) {
        setStatus('Streaming Live to Viewer!');
        await handleAnswer(payload);
      }
    });

    socket.on('ice-candidate', async (payload) => {
      if (!isTerminatedRef.current) {
        await handleIceCandidate(payload);
      }
    });

    // Fallback socket frame listener for viewer
    if (!isHost) {
      socket.on('screen-frame', (frameBase64: string) => {
        if (!isTerminatedRef.current) {
          setLatestSocketFrame(frameBase64);
        }
      });
    }
  };

  const createPeerConnection = (targetId: string) => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (ignored) {}
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;
    iceCandidateQueueRef.current = [];

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.connected) {
        socketRef.current.emit('ice-candidate', {
          target: targetId,
          caller: socketRef.current.id,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        videoRef.current.muted = true;
        videoRef.current.play().then(() => {
          setHasRemoteVideo(true);
          setStatus('Connected & Streaming Live');
        }).catch((err) => {
          console.warn('[WebRTC] Video play caught:', err);
          setHasRemoteVideo(true);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setStatus('Connected & Streaming Live');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (!isTerminatedRef.current) {
          setStatus('Stream fluctuating. Auto-reconnecting...');
          // Attempt graceful renegotiation if host
          setTimeout(() => {
            if (!isTerminatedRef.current && modeRef.current === 'host' && lastViewerIdRef.current) {
              createOffer(lastViewerIdRef.current);
            }
          }, 1500);
        }
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

  const isDisplayMediaSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const startHosting = async (sourceType: 'screen' | 'camera' = 'screen') => {
    try {
      setError('');
      isTerminatedRef.current = false;
      let stream: MediaStream | null = null;

      if (sourceType === 'screen') {
        if (isAndroidNative()) {
          setStatus('Requesting screen capture permission...');
          stream = await getAndroidScreenStream();
          if (!stream) {
            setError('Screen capture permission denied. Tap Start Now when prompted.');
            setStatus('Failed');
            return;
          }
          setStatus('Screen capture active!');
        } else if (isDisplayMediaSupported) {
          setStatus('Requesting screen access...');
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
          setStatus('Screen capture unavailable. Using camera...');
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: true,
          });
        }
      } else {
        setStatus('Requesting camera access...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true,
        });
        // Start foreground service for camera streaming
        await startBackgroundStreaming();
      }
      
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
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
      if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => {
          stopSession();
        };
      }
    } catch (err: any) {
      setError(err.message || 'Failed to capture screen');
      setStatus('Failed');
    }
  };

  const createOffer = async (targetId: string) => {
    try {
      const pc = createPeerConnection(targetId);
      
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
    } catch (err) {
      console.error('[WebRTC] createOffer error:', err);
    }
  };

  // JOIN LOGIC
  const joinRoom = () => {
    if (!roomId.trim()) {
      setError('Please enter a room code');
      return;
    }
    setError('');
    isTerminatedRef.current = false;
    setStatus('Joining room...');
    
    const socket = socketRef.current;
    if (socket) {
      socket.emit('join-room', roomId.toUpperCase());
      setupSocketListeners(false);
      setMode('join');
      setStatus(`Connected to room ${roomId.toUpperCase()}. Awaiting stream...`);
    }
  };

  const handleOffer = async (payload: any) => {
    try {
      const pc = createPeerConnection(payload.caller);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await drainIceCandidates(pc);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('answer', {
        target: payload.caller,
        caller: socketRef.current.id,
        sdp: pc.localDescription,
      });
      setStatus('Connected & viewing stream');
    } catch (err) {
      console.error('[WebRTC] handleOffer error:', err);
    }
  };

  const handleAnswer = async (payload: any) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await drainIceCandidates(pc);
      }
    } catch (err) {
      console.error('[WebRTC] handleAnswer error:', err);
    }
  };

  const handleIceCandidate = async (payload: any) => {
    const pc = peerConnectionRef.current;
    if (pc && payload.candidate) {
      if (!pc.remoteDescription) {
        iceCandidateQueueRef.current.push(payload.candidate);
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.warn('[WebRTC] addIceCandidate error:', e);
        }
      }
    }
  };

  const stopSession = () => {
    isTerminatedRef.current = true;
    cleanup();
    setMode('idle');
    setRoomId('');
    setStatus('Idle');
    stopBackgroundStreaming();
    connectSocket();
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
              <p className="text-slate-500 text-sm">Transmits screen or camera continuously, even when backgrounded.</p>
            </div>
            
            <div className="grid w-full sm:grid-cols-3 gap-6">
              <button
                onClick={() => startHosting('screen')}
                className="group relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-blue-500 hover:shadow-md hover:-translate-y-1 text-center"
              >
                {!isDisplayMediaSupported && !isAndroidNative() && (
                  <span className="absolute top-3 right-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    Desktop
                  </span>
                )}
                {isAndroidNative() && (
                  <span className="absolute top-3 right-3 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                    Android Native
                  </span>
                )}
                <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <MonitorUp className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">Screen Host</h3>
                <p className="mt-2 text-center text-xs text-slate-500 leading-relaxed">
                  Shares entire device screen in real time. Runs in background even if minimized.
                </p>
              </button>

              <button
                onClick={() => startHosting('camera')}
                className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-purple-500 hover:shadow-md hover:-translate-y-1 text-center"
              >
                <div className="mb-4 rounded-2xl bg-purple-50 p-4 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Camera className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">Camera Host</h3>
                <p className="mt-2 text-center text-xs text-slate-500 leading-relaxed">
                  Transmits the live camera feed with background persistence.
                </p>
              </button>

              <div className="flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-emerald-500 hover:shadow-md text-center">
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
              {/* WebRTC Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-contain ${
                  mode === 'join' && !hasRemoteVideo && latestSocketFrame ? 'hidden' : 'block'
                }`}
              />

              {/* Instant Socket Frame Fallback (Visible if WebRTC stream is still handshaking) */}
              {mode === 'join' && !hasRemoteVideo && latestSocketFrame && (
                <img
                  src={`data:image/jpeg;base64,${latestSocketFrame}`}
                  alt="Remote Screen Stream"
                  className="h-full w-full object-contain"
                />
              )}

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
              
              {!videoRef.current?.srcObject && !latestSocketFrame && (
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
                  <div className={`h-2.5 w-2.5 rounded-full ${
                    status.includes('Connected') || status.includes('Streaming') || latestSocketFrame
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : 'bg-amber-500 animate-pulse'
                  }`} />
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

