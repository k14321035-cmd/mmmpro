import React, { useState, useEffect, useRef } from 'react';
import { Camera, MonitorUp, ScanText, X, CheckCircle2, AlertCircle } from 'lucide-react';

export function MathGame({ onUnlock }: { onUnlock: () => void }) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [operator, setOperator] = useState('+');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');

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
            onClick={() => setShowScanner(true)}
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

      {/* Decoy AI Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800">
                <ScanText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg">AI Problem Calibration</h3>
              </div>
              <button onClick={closeScanner} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 flex flex-col items-center justify-center">
              {scanState === 'idle' && (
                <>
                  <p className="text-center text-slate-500 mb-8 leading-relaxed">
                    MathFlow can generate personalized problems by analyzing your recent coursework. Select a source to securely scan your work.
                  </p>
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <button
                      onClick={() => handleStartScan('camera')}
                      className="flex flex-col items-center p-6 border-2 border-slate-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-slate-700"
                    >
                      <Camera className="w-8 h-8 mb-3 text-slate-400" />
                      <span className="font-bold text-sm">Paper Worksheet</span>
                      <span className="text-xs text-slate-400 mt-1">Requires Camera</span>
                    </button>
                    <button
                      onClick={() => handleStartScan('screen')}
                      className="flex flex-col items-center p-6 border-2 border-slate-100 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-slate-700"
                    >
                      <MonitorUp className="w-8 h-8 mb-3 text-slate-400" />
                      <span className="font-bold text-sm">Digital Document</span>
                      <span className="text-xs text-slate-400 mt-1">Requires Screen Share</span>
                    </button>
                  </div>
                </>
              )}

              {scanState === 'prompting' && (
                <div className="flex flex-col items-center py-8 text-slate-600">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="font-medium">Waiting for permission...</p>
                  <p className="text-xs text-slate-400 mt-2 text-center max-w-xs">Please allow access in your browser prompt to proceed with calibration.</p>
                </div>
              )}

              {scanState === 'scanning' && (
                <div className="flex flex-col items-center w-full">
                  <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden mb-4 border-2 border-blue-500/50">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-50"></video>
                    {/* Scanning overlay effect */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)]" style={{ animation: 'scan 2s ease-in-out infinite alternate' }}></div>
                  </div>
                  <p className="font-bold text-blue-600 uppercase tracking-widest text-sm animate-pulse">Analyzing Structure...</p>
                </div>
              )}

              {scanState === 'success' && (
                <div className="flex flex-col items-center py-8">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
                  <p className="font-bold text-slate-800 text-lg">Calibration Complete</p>
                  <p className="text-slate-500 text-sm mt-1">Problem difficulty has been adjusted.</p>
                </div>
              )}

              {scanState === 'error' && (
                <div className="flex flex-col items-center py-8">
                  <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                  <p className="font-bold text-slate-800">Calibration Failed</p>
                  <p className="text-slate-500 text-sm mt-1 text-center">{scanError}</p>
                  <button onClick={() => setScanState('idle')} className="mt-6 px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200">
                    Try Again
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
