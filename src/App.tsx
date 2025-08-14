import { useState, useEffect, useRef } from 'react';
import './App.css';
import { LeftMenu } from './components/LeftMenu';
import { FrequencyDisplay } from './components/FrequencyDisplay';
import { WaveformCanvas } from './components/WaveformCanvas';
import { VocalGameCanvas } from './components/VocalGameCanvas';
import { PitchDetector } from './utils/PitchDetector';
import type { PitchData } from './utils/PitchDetector';

function App() {
  const [notes, setNotes] = useState<string[]>(['B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']);
  const [noteDurations, setNoteDurations] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]); // 0 means use BPM
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0);
  const [currentFrequency, setCurrentFrequency] = useState<number>(0);
  const [currentCents, setCurrentCents] = useState<number | null>(null);
  const [waveformBuffer, setWaveformBuffer] = useState<Float32Array | null>(null);
  const [isAfterGap, setIsAfterGap] = useState<boolean>(false);
  const [isListening, setIsListening] = useState(false);
  const [bpm, setBpm] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isGameMode, setIsGameMode] = useState(false);
  const [isGamePlaying, setIsGamePlaying] = useState(false);
  const pitchDetectorRef = useRef<PitchDetector | null>(null);

  useEffect(() => {
    pitchDetectorRef.current = new PitchDetector();
    return () => {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stopListening();
      }
    };
  }, []);

  const handleNotesChange = (newNotes: string[], durations: number[], isReset?: boolean) => {
    setNotes(newNotes);
    setNoteDurations(durations);
    if (currentNoteIndex >= newNotes.length) {
      setCurrentNoteIndex(0);
    }
    // Trigger canvas reset if this is from a reset action
    if (isReset) {
      setResetTrigger(prev => prev + 1);
      // Also clear the current performance data
      setCurrentFrequency(0);
      setCurrentNote(null);
      setCurrentCents(null);
    }
  };

  const handlePitchData = (data: PitchData) => {
    if (data.frequency > 0) {
      setCurrentFrequency(data.frequency);
      setCurrentNote(data.noteString);
      setCurrentCents(data.cents);
      setWaveformBuffer(data.buffer);
      setIsAfterGap(data.isAfterGap); // Pass gap information
    } else {
      // When there's no voice input, only update the waveform buffer
      // Keep the last detected note info for reference
      setCurrentFrequency(0);
      setWaveformBuffer(data.buffer);
      setIsAfterGap(false);
    }
  };


  return (
    <div className="app">
      <header className="app-header">
        <h1>Music Pitch Detector</h1>
        <div className="header-controls">
          <div className="bpm-selector">
            <label>BPM:</label>
            <select value={bpm} onChange={(e) => setBpm(Number(e.target.value))}>
              <option value={40}>40</option>
              <option value={60}>60</option>
              <option value={120}>120</option>
            </select>
          </div>
          <button
            className="game-mode-button"
            onClick={async () => {
              if (!isGameMode) {
                // Entering game mode - start listening
                setIsGameMode(true);
                if (!isListening) {
                  try {
                    await pitchDetectorRef.current?.startListening(handlePitchData);
                    setIsListening(true);
                  } catch (error: any) {
                    console.error('Failed to start listening in game mode:', error);
                    setIsGameMode(false); // Revert if listening fails
                    let errorMessage = 'Failed to access microphone. ';
                    if (error.name === 'NotAllowedError') {
                      errorMessage += 'Please allow microphone access in your browser settings.';
                    } else if (error.name === 'NotFoundError') {
                      errorMessage += 'No microphone found. Please connect a microphone.';
                    } else {
                      errorMessage += 'Error: ' + error.message;
                    }
                    alert(errorMessage);
                  }
                }
              } else {
                // Exiting game mode - stop listening if it was started by game mode
                setIsGameMode(false);
                if (isListening && !isPlaying) {
                  pitchDetectorRef.current?.stopListening();
                  setIsListening(false);
                  setCurrentFrequency(0);
                  setCurrentNote(null);
                  setCurrentCents(null);
                  setWaveformBuffer(null);
                }
              }
            }}
          >
            {isGameMode ? 'Exit Game' : 'Game Mode'}
          </button>
          {!isGameMode && (
            <button 
              className={`play-button ${isPlaying ? 'playing' : ''}`}
            onClick={async () => {
              if (!isPlaying) {
                // Start playing and automatically start listening
                setIsPlaying(true);
                if (!isListening) {
                  try {
                    await pitchDetectorRef.current?.startListening(handlePitchData);
                    setIsListening(true);
                  } catch (error: any) {
                    console.error('Failed to start listening:', error);
                    setIsPlaying(false); // Stop playing if listening fails
                    let errorMessage = 'Failed to access microphone. ';
                    if (error.name === 'NotAllowedError') {
                      errorMessage += 'Please allow microphone access in your browser settings.';
                    } else if (error.name === 'NotFoundError') {
                      errorMessage += 'No microphone found. Please connect a microphone.';
                    } else {
                      errorMessage += 'Error: ' + error.message;
                    }
                    alert(errorMessage);
                  }
                }
              } else {
                // Stop playing and listening
                setIsPlaying(false);
                if (isListening) {
                  pitchDetectorRef.current?.stopListening();
                  setIsListening(false);
                  setCurrentFrequency(0);
                  setCurrentNote(null);
                  setCurrentCents(null);
                  setWaveformBuffer(null);
                }
              }
            }}
          >
            {isPlaying ? 'Stop' : 'Start'}
          </button>
          )}
          {/* <button 
            className={`listen-button ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            disabled={isPlaying}
            title={isPlaying ? "Listening is controlled by Start/Stop button" : ""}
          >
            {isListening ? '🎤 Stop Listening' : '🎙️ Start Listening'}
          </button> */}
        </div>
      </header>
      
      <div className="app-content">
        <aside className="left-sidebar">
          <LeftMenu onNotesChange={handleNotesChange} isPlaying={isPlaying} isGameMode={isGameMode} isGamePlaying={isGamePlaying} />
          
          <div className="frequency-section-sidebar">
            <FrequencyDisplay
              targetNote={notes[currentNoteIndex] || null}
              currentFrequency={currentFrequency}
              currentNote={currentNote}
              currentCents={currentCents}
            />
          </div>
        </aside>
        
        <main className="main-content">
          {isGameMode ? (
            <VocalGameCanvas 
              onClose={() => {
                setIsGameMode(false);
                setIsGamePlaying(false);
              }}
              onGameStateChange={setIsGamePlaying}
              onTargetNoteChange={(targetNote) => {
                if (targetNote) {
                  const noteIndex = notes.findIndex(note => note === targetNote);
                  if (noteIndex !== -1) {
                    setCurrentNoteIndex(noteIndex);
                  }
                }
              }}
              notes={notes}
              noteDurations={noteDurations}
              bpm={bpm}
              currentFrequency={currentFrequency}
              currentNote={currentNote}
              currentCents={currentCents}
              targetNote={notes[currentNoteIndex] || null}
            />
          ) : (
            <WaveformCanvas
              notes={notes}
              noteDurations={noteDurations}
              buffer={waveformBuffer}
              currentFrequency={currentFrequency}
              targetNotes={notes}
              bpm={bpm}
              isPlaying={isPlaying}
              isListening={isListening}
              onNoteChange={setCurrentNoteIndex}
              resetTrigger={resetTrigger}
              isGameMode={isGameMode}
              isAfterGap={isAfterGap}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App






