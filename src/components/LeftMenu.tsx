import { useState, useEffect } from "react";
import { NOTE_FREQUENCIES } from "../constants/notes";
import { KANNADA_SONG_MELODY, TWINKLE_TWINKLE_MELODY } from "./constants/kannadaMelody";
import { useIsMobileOrTablet } from "../hooks/useMediaQuery";

interface LeftMenuProps {
  onNotesChange: (
    notes: string[],
    durations: number[],
    isReset?: boolean
  ) => void;
  isPlaying?: boolean;
  isGameMode?: boolean;
  isGamePlaying?: boolean;
}

export const LeftMenu: React.FC<LeftMenuProps> = ({
  onNotesChange,
  isPlaying = false,
  isGameMode = false,
  isGamePlaying = false,
}) => {
  const defaultNotes = "C3,D3, E3, F3, G3, A3, B3, C4, B3, A3, G3, F3, E3, D3, C3";
  const [inputValue, setInputValue] = useState(defaultNotes);
  const [currentNotes, setCurrentNotes] = useState<string[]>([
    "C3","D3", "E3", "F3", "G3", "A3", "B3", "C4", "B3", "A3", "G3", "F3", "E3", "D3", "C3"
  ]);
  const [currentDurations, setCurrentDurations] = useState<number[]>([
    0, 0, 0, 0, 0, 0, 0, 0, // 0 means use BPM
  ]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const isMobileOrTablet = useIsMobileOrTablet();

  useEffect(() => {
    onNotesChange(currentNotes, currentDurations);
  }, []);

  const handleSetNotes = () => {
    setErrorMessage("");

    // Parse comma-separated notes with optional duration (note:milliseconds)
    const notesArray = inputValue
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (notesArray.length === 0) {
      setErrorMessage("Please enter at least one note");
      return;
    }

    // Validate all notes and extract durations
    const invalidNotes: string[] = [];
    const validNotes: string[] = [];
    const durations: number[] = [];

    notesArray.forEach((item) => {
      // Check if item contains duration (format: note:milliseconds)
      const parts = item.split(":");
      const note = parts[0].toUpperCase();
      let duration = 0; // 0 means "use BPM"

      if (parts.length === 2) {
        // Parse as milliseconds
        const customDuration = parseInt(parts[1]);
        if (!isNaN(customDuration) && customDuration > 0) {
          duration = customDuration; // Keep as milliseconds
        } else {
          invalidNotes.push(item + " (invalid duration)");
          return;
        }
      } else if (parts.length > 2) {
        invalidNotes.push(item + " (invalid format)");
        return;
      }

      if (NOTE_FREQUENCIES[note]) {
        validNotes.push(note);
        durations.push(duration);
      } else {
        invalidNotes.push(note);
      }
    });

    if (invalidNotes.length > 0) {
      setErrorMessage(`Invalid notes: ${invalidNotes.join(", ")}`);
      return;
    }

    // Set the valid notes and durations
    setCurrentNotes(validNotes);
    setCurrentDurations(durations);
    onNotesChange(validNotes, durations);
    setErrorMessage("Notes set successfully!");
    setTimeout(() => setErrorMessage(""), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSetNotes();
    }
  };

  const handleReset = () => {
    setInputValue(defaultNotes);
    const defaultNotesArray = ["B2", "C3", "D3", "E3", "F3", "G3", "A3", "B3"];
    const defaultDurations = [0, 0, 0, 0, 0, 0, 0, 0];
    setCurrentNotes(defaultNotesArray);
    setCurrentDurations(defaultDurations);
    onNotesChange(defaultNotesArray, defaultDurations, true); // Pass true to indicate reset
    setErrorMessage("Reset to default notes");
    setTimeout(() => setErrorMessage(""), 2000);
  };

  // Helper function to convert melody to input string format
  const melodyToString = (melody: typeof KANNADA_SONG_MELODY) => {
    return melody.map(note => `${note.note}:${note.duration}`).join(', ');
  };

  // Handle Twinkle Twinkle melody
  const handleTwinkleTwinkle = () => {
    const melodyString = melodyToString(TWINKLE_TWINKLE_MELODY);
    setInputValue(melodyString);
    
    const notes = TWINKLE_TWINKLE_MELODY.map(m => m.note);
    const durations = TWINKLE_TWINKLE_MELODY.map(m => m.duration);
    
    setCurrentNotes(notes);
    setCurrentDurations(durations);
    onNotesChange(notes, durations, true);
    setErrorMessage("Loaded Twinkle Twinkle Little Star melody");
    setTimeout(() => setErrorMessage(""), 2000);
  };

  // Handle Kannada melody
  const handleKannadaMelody = () => {
    const melodyString = melodyToString(KANNADA_SONG_MELODY);
    setInputValue(melodyString);
    
    const notes = KANNADA_SONG_MELODY.map(m => m.note);
    const durations = KANNADA_SONG_MELODY.map(m => m.duration);
    
    setCurrentNotes(notes);
    setCurrentDurations(durations);
    onNotesChange(notes, durations, true);
    setErrorMessage("Loaded Jenina Holeyu Kannada melody");
    setTimeout(() => setErrorMessage(""), 2000);
  };

  const shouldHideInput = isMobileOrTablet && isPlaying;
  const shouldHideInLandscape = isGameMode && window.innerWidth > window.innerHeight && window.innerHeight <= 500;
  const shouldHideInGamePlayingMobileLandscape = isGameMode && isGamePlaying && window.innerWidth > window.innerHeight && window.innerHeight <= 500;

  return (
    <div className="left-menu">
      {!shouldHideInput && (
        <div className="left-menu-content">
          <h2>Musical Notes</h2>

          {!shouldHideInLandscape && !shouldHideInGamePlayingMobileLandscape && (
            <div className="note-input-section">
              <label htmlFor="notes-input" className="input-label">
                Enter notes (comma-separated, optional duration in ms - e.g.,
                C4:1500):
              </label>
              <textarea
                id="notes-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., C4, D4:1500, E4, F4:3000, G4"
                className="notes-textarea"
                rows={3}
              />

              <div className="button-group">
                <button onClick={handleSetNotes} className="set-notes-button">
                  Set Notes
                </button>
                <button onClick={handleReset} className="reset-button">
                  Reset to Default
                </button>
              </div>

              {isGameMode && (
                <div className="melody-button-group" style={{ marginTop: '10px' }}>
                  <button onClick={handleTwinkleTwinkle} className="melody-button" style={{ 
                    backgroundColor: '#4CAF50', 
                    color: 'white', 
                    marginRight: '10px',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}>
                    🌟 Twinkle Twinkle
                  </button>
                  <button onClick={handleKannadaMelody} className="melody-button" style={{ 
                    backgroundColor: '#2196F3', 
                    color: 'white',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}>
                    🎵 Jenina Holeyu
                  </button>
                </div>
              )}

              {errorMessage && (
                <div
                  className={`message ${
                    errorMessage.includes("Invalid") ? "error" : "success"
                  }`}
                >
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
