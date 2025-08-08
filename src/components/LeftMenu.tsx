import { useState, useEffect } from 'react';
import { NOTE_FREQUENCIES } from '../constants/notes';

interface LeftMenuProps {
  onNotesChange: (notes: string[]) => void;
}

export const LeftMenu: React.FC<LeftMenuProps> = ({ onNotesChange }) => {
  const defaultNotes = 'B2, C3, D3, E3, F3, G3, A3, B3';
  const [inputValue, setInputValue] = useState(defaultNotes);
  const [currentNotes, setCurrentNotes] = useState<string[]>(['B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    onNotesChange(currentNotes);
  }, []);

  const handleSetNotes = () => {
    setErrorMessage('');
    
    // Parse comma-separated notes
    const notesArray = inputValue
      .split(',')
      .map(note => note.trim().toUpperCase())
      .filter(note => note.length > 0);
    
    if (notesArray.length === 0) {
      setErrorMessage('Please enter at least one note');
      return;
    }
    
    // Validate all notes
    const invalidNotes: string[] = [];
    const validNotes: string[] = [];
    
    notesArray.forEach(note => {
      if (NOTE_FREQUENCIES[note]) {
        validNotes.push(note);
      } else {
        invalidNotes.push(note);
      }
    });
    
    if (invalidNotes.length > 0) {
      setErrorMessage(`Invalid notes: ${invalidNotes.join(', ')}`);
      return;
    }
    
    // Set the valid notes
    setCurrentNotes(validNotes);
    onNotesChange(validNotes);
    setErrorMessage('Notes set successfully!');
    setTimeout(() => setErrorMessage(''), 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSetNotes();
    }
  };

  const handleReset = () => {
    setInputValue(defaultNotes);
    const defaultNotesArray = ['B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];
    setCurrentNotes(defaultNotesArray);
    onNotesChange(defaultNotesArray);
    setErrorMessage('Reset to default notes');
    setTimeout(() => setErrorMessage(''), 2000);
  };

  return (
    <div className="left-menu">
      <h2>Musical Notes</h2>
      
      <div className="note-input-section">
        <label htmlFor="notes-input" className="input-label">
          Enter notes (comma-separated):
        </label>
        <textarea
          id="notes-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="e.g., C4, D4, E4, F4, G4"
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
          <div className={`message ${errorMessage.includes('Invalid') ? 'error' : 'success'}`}>
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};