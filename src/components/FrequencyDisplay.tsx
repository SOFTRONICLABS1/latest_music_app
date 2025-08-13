import { NOTE_FREQUENCIES } from "../constants/notes";

interface FrequencyDisplayProps {
  targetNote: string | null;
  currentFrequency: number;
  currentNote: string | null;
  currentCents: number | null;
}

export const FrequencyDisplay: React.FC<FrequencyDisplayProps> = ({
  targetNote,
  currentFrequency,
  currentNote,
  currentCents,
}) => {
  const targetFrequency = targetNote ? NOTE_FREQUENCIES[targetNote] : null;

  const getCentsColor = (cents: number | null) => {
    if (cents === null) return "";
    const absCents = Math.abs(cents);
    if (absCents <= 5) return "perfect";
    if (absCents <= 10) return "good";
    if (absCents <= 20) return "ok";
    return "poor";
  };

  const getCentsDirection = (cents: number | null) => {
    if (cents === null || cents === 0) return "";
    return cents < 0 ? "flat" : "sharp";
  };

  return (
    <div className="frequency-display">
        <div className="frequency-box target-box">
          <h3>Target</h3>
          {targetNote ? (
            <>
              <div className="note-value">{targetNote}</div>
              <div className="frequency-value">
                {targetFrequency?.toFixed(2)} Hz
              </div>
            </>
          ) : (
            <div className="no-target">No target selected</div>
          )}
        </div>
      

      <div className="frequency-box current-box">
        <h3>Your Performance</h3>
        {currentFrequency > 0 ? (
          <>
            <div className="note-value">{currentNote}</div>
            <div className="frequency-value">
              {currentFrequency.toFixed(2)} Hz
            </div>
            <div
              className={`cents-value ${getCentsColor(
                currentCents
              )} ${getCentsDirection(currentCents)}`}
            >
              {currentCents !== null && (
                <>
                  {currentCents > 0 ? "+" : ""}
                  {currentCents} cents
                  {currentCents !== 0 && (
                    <span className="cents-indicator">
                      {currentCents < 0 ? " ♭" : " ♯"}
                    </span>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="no-signal">No signal detected</div>
        )}
      </div>
    </div>
  );
};
