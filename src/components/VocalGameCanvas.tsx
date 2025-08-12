import React, { useMemo, useRef, useState, useEffect } from 'react';
import DuckVoiceGameSDK from './DuckVoiceGameSDK';
import { FrequencyDisplay } from './FrequencyDisplay';
import type { GameNote } from './DuckVoiceGameSDK';

interface VocalGameCanvasProps {
  onClose: () => void;
  onGameStateChange?: (isPlaying: boolean) => void;
  notes?: string[];
  noteDurations?: number[];
  bpm?: number;
  currentFrequency?: number;
  currentNote?: string | null;
  currentCents?: number | null;
  targetNote?: string | null;
}

export const VocalGameCanvas: React.FC<VocalGameCanvasProps> = ({ 
  onClose, 
  onGameStateChange,
  notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
  noteDurations = [0, 0, 0, 0, 0, 0, 0, 0],
  bpm = 120,
  currentFrequency = 0,
  currentNote = null,
  currentCents = null,
  targetNote = null
}) => {
  const gameRef = useRef<any>(null);
  const [gameTargetNote, setGameTargetNote] = useState<string | null>(targetNote);
  
  // Update game target note when the game progresses
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameRef.current && typeof gameRef.current.getGameState === 'function') {
        const gameState = gameRef.current.getGameState();
        console.log('Game state:', gameState); // Debug log
        
        // Check if currentNote exists and has changed
        if (gameState.currentNote) {
          const newTargetNote = gameState.currentNote.note || gameState.currentNote;
          if (newTargetNote !== gameTargetNote) {
            console.log('Updating target note to:', newTargetNote); // Debug log
            setGameTargetNote(newTargetNote);
          }
        }
      }
    }, 200); // Check every 200ms (slightly less frequent)
    
    return () => clearInterval(interval);
  }, [gameTargetNote]);
  // Convert notes to game format and memoize to trigger re-render when notes change
  const gameNotes: GameNote[] = useMemo(() => 
    notes.map((note, index) => ({
      note: note,
      duration: (index < noteDurations.length && noteDurations[index] > 0) 
        ? noteDurations[index] / 1000 // Convert ms to seconds 
        : 1 // Default 1 beat if no duration specified
    })), [notes, noteDurations]
  );

  // Create a unique key that changes when notes, durations, or bpm change to force component remount
  const gameKey = useMemo(() => 
    `game-${notes.join('-')}-${noteDurations.join('-')}-${bpm}`, [notes, noteDurations, bpm]
  );

  return (
    <div className="vocal-game-container">
      <div className="game-header">
        <div className="game-title-section">
          <h2>Vocal Music Playground</h2>
        </div>
        <div className="game-controls">
          <button 
            className="game-control-btn play-btn"
            onClick={async () => {
              if (gameRef.current?.play) {
                try {
                  await gameRef.current.play();
                  onGameStateChange?.(true);
                } catch (error) {
                  console.error('Failed to start game:', error);
                }
              }
            }}
          >
            ▶️ Play
          </button>
          <button 
            className="game-control-btn pause-btn"
            onClick={() => {
              gameRef.current?.pause();
              onGameStateChange?.(false);
            }}
          >
            ⏸️ Pause
          </button>
          <button 
            className="game-control-btn stop-btn"
            onClick={() => {
              gameRef.current?.stop();
              onGameStateChange?.(false);
            }}
          >
            ⏹️ Stop
          </button>
          <button 
            className="game-control-btn restart-btn"
            onClick={async () => {
              gameRef.current?.restart();
              onGameStateChange?.(true);
            }}
          >
            🔄 Restart
          </button>
          <button 
            className="game-control-btn harmonics-btn"
            onClick={async () => {
              if (gameRef.current?.toggleHarmonics) {
                try {
                  await gameRef.current.toggleHarmonics();
                } catch (error) {
                  console.error('Failed to toggle harmonics:', error);
                }
              }
            }}
          >
            🎵 Harmonics
          </button>
        </div>
      </div>
      <div className="game-content">
        <DuckVoiceGameSDK
          ref={gameRef}
          key={gameKey}
          gameId="vocal-game-1"
          bpm={bpm}
          notes={gameNotes}
          mode="easy"
        />
      </div>
    </div>
  );
};