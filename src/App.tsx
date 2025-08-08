import { useState, useEffect, useRef } from 'react';
import './App.css';
import { LeftMenu } from './components/LeftMenu';
import { FrequencyDisplay } from './components/FrequencyDisplay';
import { WaveformCanvas } from './components/WaveformCanvas';
import { PitchDetector } from './utils/PitchDetector';
import type { PitchData } from './utils/PitchDetector';

function App() {
  const [notes, setNotes] = useState<string[]>(['B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']);
  const [noteDurations, setNoteDurations] = useState<number[]>([2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0);
  const [currentFrequency, setCurrentFrequency] = useState<number>(0);
  const [currentCents, setCurrentCents] = useState<number | null>(null);
  const [waveformBuffer, setWaveformBuffer] = useState<Float32Array | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [bpm, setBpm] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const pitchDetectorRef = useRef<PitchDetector | null>(null);

  useEffect(() => {
    pitchDetectorRef.current = new PitchDetector();
    return () => {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stopListening();
      }
    };
  }, []);

  const handleNotesChange = (newNotes: string[], durations: number[]) => {
    setNotes(newNotes);
    setNoteDurations(durations);
    if (currentNoteIndex >= newNotes.length) {
      setCurrentNoteIndex(0);
    }
  };

  const handlePitchData = (data: PitchData) => {
    if (data.frequency > 0) {
      setCurrentFrequency(data.frequency);
      setCurrentNote(data.noteString);
      setCurrentCents(data.cents);
      setWaveformBuffer(data.buffer);
    }
  };

  const toggleListening = async () => {
    if (!pitchDetectorRef.current) return;

    if (isListening) {
      pitchDetectorRef.current.stopListening();
      setIsListening(false);
      setCurrentFrequency(0);
      setCurrentNote(null);
      setCurrentCents(null);
      setWaveformBuffer(null);
    } else {
      try {
        await pitchDetectorRef.current.startListening(handlePitchData);
        setIsListening(true);
      } catch (error: any) {
        console.error('Failed to start listening:', error);
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
          <LeftMenu onNotesChange={handleNotesChange} />
          
          <div className="frequency-section-sidebar">
            <FrequencyDisplay
              targetNote={notes[currentNoteIndex] || null}
              currentFrequency={currentFrequency}
              currentNote={currentNote}
              currentCents={currentCents}
            />
            {isListening && (
              <div className="mic-status">
                <span className="mic-indicator">🎤</span> Microphone Active
                {currentFrequency > 0 && (
                  <div className="debug-info">
                    Detecting: {currentFrequency.toFixed(1)} Hz
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
        
        <main className="main-content">
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
          />
        </main>
      </div>
    </div>
  );
}

export default App
