import { useState, useEffect } from "react";
import { NOTE_FREQUENCIES } from "../constants/notes";
import { useIsMobileOrTablet } from "../hooks/useMediaQuery";

interface LeftMenuProps {
  onNotesChange: (
    notes: string[],
    durations: number[],
    isReset?: boolean
  ) => void;
  isPlaying?: boolean;
}

export const LeftMenu: React.FC<LeftMenuProps> = ({
  onNotesChange,
  isPlaying = false,
}) => {
  const defaultNotes = "C3,B2, D3, E3, F3, G3, A3, B3";
  const [inputValue, setInputValue] = useState(defaultNotes);
  const [currentNotes, setCurrentNotes] = useState<string[]>([
    "C3",
    "B2",
    "D3",
    "E3",
    "F3",
    "G3",
    "A3",
    "B3",
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

  const shouldHideInput = isMobileOrTablet && isPlaying;

  return (
    <div className="left-menu">
      {!shouldHideInput && (
        <div className="left-menu-content">
          <h2>Musical Notes</h2>

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
        </div>
      )}
    </div>
  );
};
