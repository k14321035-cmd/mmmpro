import { useState } from 'react';
import { MathGame } from './components/MathGame';
import { ScreenMirror } from './components/ScreenMirror';
import { Mode } from './types';

export default function App() {
  const [mode, setMode] = useState<Mode>('game');

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
