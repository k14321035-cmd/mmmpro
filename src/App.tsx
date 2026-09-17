import { useState, useEffect } from 'react';
import { MathGame } from './components/MathGame';
import { ScreenMirror } from './components/ScreenMirror';
import { Mode } from './types';

export default function App() {
  const [mode, setMode] = useState<Mode>('game');

  useEffect(() => {
    // Exposed to Android native via evaluateJavascript from MainActivity.
    // When the tiny floating Math overlay is tapped, this navigates back
    // to the Math game section instead of the proctoring terminal.
    (window as any).__goToMathGame = () => setMode('game');
    return () => {
      delete (window as any).__goToMathGame;
    };
  }, []);

  return (
    <>
      <div style={{ display: mode === 'game' ? 'block' : 'none' }}>
        <MathGame onUnlock={() => setMode('mirror')} />
      </div>
      <div style={{ display: mode === 'mirror' ? 'block' : 'none' }}>
        <ScreenMirror onExit={() => setMode('game')} />
      </div>
    </>
  );
}
