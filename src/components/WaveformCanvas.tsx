import { useRef, useEffect } from "react";
import { NOTE_FREQUENCIES } from "../constants/notes";
import { GuitarHarmonics } from "../utils/GuitarHarmonics";

interface WaveformCanvasProps {
  notes: string[];
  noteDurations: number[];
  buffer: Float32Array | null;
  currentFrequency: number;
  targetNotes: string[];
  bpm: number;
  isPlaying: boolean;
  isListening: boolean;
  onNoteChange: (index: number) => void;
  resetTrigger?: number;
  isGameMode?: boolean;
  isAfterGap?: boolean;
}

interface WavePoint {
  x: number;
  frequency: number;
  timestamp: number;
  noteIndex: number;
  note: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  notes,
  noteDurations,
  currentFrequency,
  targetNotes,
  bpm,
  isPlaying,
  isListening,
  onNoteChange,
  resetTrigger,
  isGameMode = false,
  isAfterGap = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const targetWaveRef = useRef<WavePoint[]>([]);
  const userWaveRef = useRef<WavePoint[]>([]);
  const currentFrequencyRef = useRef<number>(0);
  const isListeningRef = useRef<boolean>(false);
  const currentTargetIndexRef = useRef<number>(0);
  const userFrequencyHistory = useRef<
    { frequency: number; timestamp: number; color: string; isAfterGap: boolean }[]
  >([]);
  const dataCompressionCounter = useRef<number>(0);
  const lastStoredFrequency = useRef<number>(0);
  const renderCache = useRef<{ lastUpdate: number }>({ lastUpdate: 0 });
  const guitarHarmonicsRef = useRef<GuitarHarmonics | null>(null);
  const lastPlayedNoteRef = useRef<{ note: string; startTime: number } | null>(
    null
  );
  const scrollOffsetRef = useRef<number>(0);
  const targetScrollOffsetRef = useRef<number>(0);

  // Calculate pixels per second based on BPM (notes per minute)
  // BPM 120 = 120 notes/min = 2 notes/sec = 0.5 sec per note
  // BPM 60 = 60 notes/min = 1 note/sec = 1 sec per note  
  // BPM 40 = 40 notes/min = 0.667 notes/sec = 1.5 sec per note
  const secondsPerNote = 60 / bpm; // Direct calculation: 60 seconds / BPM = seconds per note
  const pixelsPerSecond = 100 / secondsPerNote; // 100 pixels per note duration

  // Get all notes for display - show the full range in ascending frequency order
  const getAllNotes = (): string[] => {
    return Object.keys(NOTE_FREQUENCIES).sort((a, b) => NOTE_FREQUENCIES[a] - NOTE_FREQUENCIES[b]);
  };

  // Get all notes for display
  const displayNotes = getAllNotes();

  // Calculate Y position for a frequency using all notes with scrolling offset
  const getYPosition = (frequency: number, canvasHeight: number): number => {
    if (!frequency || displayNotes.length === 0) return canvasHeight / 2;

    // Use all notes for Y position calculation
    const frequencies = displayNotes
      .map((n) => NOTE_FREQUENCIES[n])
      .filter((f) => f);
    if (frequencies.length === 0) return canvasHeight / 2;

    const minFreq = Math.min(...frequencies) * 0.95;
    const maxFreq = Math.max(...frequencies) * 1.05;
    const range = maxFreq - minFreq;

    if (range === 0) return canvasHeight / 2;

    // Calculate total height needed for all notes (each note gets ~40 pixels)
    const pixelsPerNote = 40;
    const totalNotesHeight = displayNotes.length * pixelsPerNote;
    
    // Find which note this frequency is closest to
    let closestNoteIndex = 0;
    let minDiff = Math.abs(frequency - frequencies[0]);
    
    for (let i = 1; i < frequencies.length; i++) {
      const diff = Math.abs(frequency - frequencies[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestNoteIndex = i;
      }
    }

    // Calculate base position for this note with inverted Y-axis (low freq at bottom, high at top)
    const totalHeight = displayNotes.length * pixelsPerNote;
    const baseY = totalHeight - (closestNoteIndex * pixelsPerNote + pixelsPerNote / 2);
    
    // Apply scroll offset
    return baseY + scrollOffsetRef.current;
  };

  // Get color based on frequency match using cents (musical intervals)
  const getFrequencyColor = (
    userFreq: number,
    targetFreq: number | null
  ): string => {
    if (!targetFreq || !userFreq) return "#ef4444"; // red

    // Calculate cents difference (1200 cents = 1 octave)
    const cents = Math.abs(1200 * Math.log2(userFreq / targetFreq));

    if (cents <= 10) return "#22c55e"; // green - perfect match (within ±10 cents)
    if (cents <= 25) return "#f97316"; // orange - close match (within ±25 cents)
    if (cents <= 50) return "#f59e0b"; // amber - ok match (within ±50 cents)
    return "#ef4444"; // red - poor match (more than ±50 cents)
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentTime = Date.now();
    if (!startTimeRef.current) startTimeRef.current = currentTime;
    const elapsedTime = (currentTime - startTimeRef.current) / 1000; // in seconds

    // Update scroll position with smooth animation
    const scrollDiff = targetScrollOffsetRef.current - scrollOffsetRef.current;
    if (Math.abs(scrollDiff) > 1) {
      scrollOffsetRef.current += scrollDiff * 0.1; // Smooth interpolation
    } else {
      scrollOffsetRef.current = targetScrollOffsetRef.current;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw vertical grid lines
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }

    // Calculate which notes are visible on screen with inverted Y-axis
    const pixelsPerNote = 40;
    const totalHeight = displayNotes.length * pixelsPerNote;
    
    // With inverted Y-axis, we need to recalculate visible range
    const visibleStartIndex = 0;
    const visibleEndIndex = displayNotes.length - 1;

    // Draw note labels with frequency - render all notes and let canvas clipping handle visibility
    ctx.font = "14px Arial";
    for (let i = 0; i < displayNotes.length; i++) {
      const note = displayNotes[i];
      const freq = NOTE_FREQUENCIES[note];
      if (!freq) continue;

      const y = totalHeight - (i * pixelsPerNote + pixelsPerNote / 2) + scrollOffsetRef.current;
      
      // Only draw if on screen for performance
      if (y >= -50 && y <= canvas.height + 50) {
        // Check if this is in the target notes list
        const isTarget = targetNotes.includes(note);

        // Draw horizontal guide line for all notes
        ctx.strokeStyle = isTarget ? "#dee2e6" : "#f1f3f5";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw note label with frequency
        ctx.fillStyle = isTarget ? "#1c7ed6" : "#adb5bd";
        ctx.font = isTarget ? "bold 14px Arial" : "12px Arial";
        ctx.fillText(`${note} (${freq.toFixed(0)}Hz)`, 5, y - 5);
      }
    }

    // Draw blue middle line
    const middleX = canvas.width / 2;
    ctx.strokeStyle = "#1c7ed6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(middleX, 0);
    ctx.lineTo(middleX, canvas.height);
    ctx.stroke();

    // Draw time indicator based on max note duration
    const maxDuration =
      Math.max(...(noteDurations.length > 0 ? noteDurations : [2000])) / 1000; // Convert to seconds
    ctx.strokeStyle = "#6c757d";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Draw vertical lines every second from the middle line
    for (let i = 1; i <= Math.ceil(maxDuration); i++) {
      const x = middleX - pixelsPerSecond * i;
      if (x > 0) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 30);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();

        // Label each second
        ctx.fillStyle = "#6c757d";
        ctx.font = "10px Arial";
        ctx.fillText(`${i}s`, x - 5, canvas.height - 5);
      }
    }
    ctx.setLineDash([]);

    // Draw continuous waveform for all target notes as rectangular wave
    if (isPlaying && targetNotes.length > 0) {
      // Calculate total sequence duration
      // Use individual note durations if provided, otherwise use BPM
      const totalSequenceDuration = targetNotes.reduce((sum, _, index) => {
        const duration = (index < noteDurations.length && noteDurations[index] > 0) 
          ? noteDurations[index] / 1000  // Custom duration in seconds
          : secondsPerNote;              // BPM-based duration
        return sum + duration;
      }, 0);
      const sequencePixels = totalSequenceDuration * pixelsPerSecond;

      // Calculate continuous scroll position
      const scrollPosition = elapsedTime * pixelsPerSecond;

      // Collect all points for the rectangular wave
      const wavePoints: { x: number; y: number }[] = [];

      // Draw the continuous waveform
      ctx.save();

      // Calculate how many complete sequences we need to draw to fill the canvas
      // Add extra sequences to ensure smooth infinite scrolling

      // Draw continuous sequences with stable rendering
      // Calculate sequences needed to fill the entire canvas from right to left
      const sequencesNeededForFullCanvas = Math.ceil((canvas.width + scrollPosition) / sequencePixels) + 2;
      const startSeq = -1; // Start before the visible area
      const endSeq = startSeq + sequencesNeededForFullCanvas;

      for (let seq = startSeq; seq < endSeq; seq++) {
        // Calculate the base position for this sequence repetition
        // The first sequence (seq=0) should start at canvas.width when scrollPosition=0
        const sequenceBaseX = canvas.width + (seq * sequencePixels) - scrollPosition;

        // Draw each note in the sequence
        let cumulativeX = 0;
        for (let i = 0; i < targetNotes.length; i++) {
          const note = targetNotes[i];
          const frequency = NOTE_FREQUENCIES[note];
          if (!frequency) continue;

          // Use custom duration if provided (non-zero), otherwise use BPM-based duration
          const noteDuration = (i < noteDurations.length && noteDurations[i] > 0) ? (noteDurations[i] / 1000) : secondsPerNote;
          const noteStartX = sequenceBaseX + cumulativeX;
          const noteEndX = noteStartX + noteDuration * pixelsPerSecond;
          cumulativeX += noteDuration * pixelsPerSecond;

          // Skip only if completely off-screen to the right
          // Allow segments to extend to the left edge
          if (noteStartX > canvas.width + 100) continue;

          const centerY = getYPosition(frequency, canvas.height);

          // Don't clamp - let the canvas clip naturally for smoother rendering
          wavePoints.push({ x: noteStartX, y: centerY });
          wavePoints.push({ x: noteEndX, y: centerY });

          // Check if this note is at the middle line for triggering events
          if (noteStartX <= middleX && noteEndX >= middleX) {
            const progress =
              (middleX - noteStartX) / (noteDuration * pixelsPerSecond);

            // Trigger note change only at the beginning
            if (progress < 0.05) {
              const actualIndex = i % targetNotes.length;
              const uniqueNoteId = `${seq}-${i}-${note}`;

              onNoteChange(actualIndex);
              // Play guitar harmonic for this note only when not in game mode
              if (guitarHarmonicsRef.current && !isGameMode) {
                const currentTime = Date.now();
                // Check if we haven't played this specific note instance recently
                if (
                  !lastPlayedNoteRef.current ||
                  lastPlayedNoteRef.current.note !== uniqueNoteId ||
                  currentTime - lastPlayedNoteRef.current.startTime > 100
                ) {
                  guitarHarmonicsRef.current.playNote(
                    note,
                    noteDurations[actualIndex] || (secondsPerNote * 1000) // Use custom duration or BPM
                  );
                  lastPlayedNoteRef.current = {
                    note: uniqueNoteId,
                    startTime: currentTime,
                  };
                }
              }
            }

            // Draw pulse effect for the entire duration the note is at the middle line
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(middleX, centerY, 20, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Draw target note and frequency above the circle
            ctx.save();
            ctx.fillStyle = "#f97316";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.fillText(note, middleX - 30, centerY - 20);
            ctx.font = "16px Arial";
            ctx.fillText(
              `${frequency.toFixed(0)} Hz`,
              middleX - 30,
              centerY - 40
            );
            ctx.restore();
          }
        }
      }

      // Draw the rectangular wave directly without sorting/filtering
      if (wavePoints.length > 1) {
        // Draw the rectangular wave with orange color
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#f97316";
        ctx.shadowBlur = 10;
        ctx.beginPath();

        // Group points by note segments to draw clean rectangles
        let isFirstPoint = true;
        for (let i = 0; i < wavePoints.length; i += 2) {
          if (i + 1 < wavePoints.length) {
            const startPoint = wavePoints[i];
            const endPoint = wavePoints[i + 1];

            if (isFirstPoint) {
              ctx.moveTo(startPoint.x, startPoint.y);
              isFirstPoint = false;
            } else {
              // Draw horizontal line to start of new segment
              ctx.lineTo(startPoint.x, startPoint.y);
            }
            // Draw horizontal line for this segment
            ctx.lineTo(endPoint.x, endPoint.y);
          }
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    // Auto-scroll to user's current frequency
    if (isListeningRef.current && currentFrequencyRef.current > 0) {
      const pixelsPerNote = 40;
      const frequencies = displayNotes.map(n => NOTE_FREQUENCIES[n]).filter(f => f);
      
      // Find which note the current frequency is closest to
      let closestNoteIndex = 0;
      let minDiff = Math.abs(currentFrequencyRef.current - frequencies[0]);
      
      for (let i = 1; i < frequencies.length; i++) {
        const diff = Math.abs(currentFrequencyRef.current - frequencies[i]);
        if (diff < minDiff) {
          minDiff = diff;
          closestNoteIndex = i;
        }
      }
      
      // Calculate target scroll position to center this note on screen with inverted Y-axis
      const totalHeight = displayNotes.length * pixelsPerNote;
      const noteY = totalHeight - (closestNoteIndex * pixelsPerNote + pixelsPerNote / 2);
      const centerY = canvas.height / 2;
      targetScrollOffsetRef.current = centerY - noteY;
    }

    // Update user frequency history with enhanced spike filtering
    if (isListeningRef.current && currentFrequencyRef.current > 0) {
      const currentTime = Date.now();
      
      // Debug: Log frequency detection for troubleshooting
      if (currentTime % 1000 < 50) { // Log roughly every second
        console.log('Audio detected:', currentFrequencyRef.current.toFixed(1), 'Hz');
      }
      
      // Clean up old entries to prevent memory leaks (keep last 15 seconds for smoother performance)
      const maxAge = 15000; // 15 seconds
      userFrequencyHistory.current = userFrequencyHistory.current.filter(
        entry => currentTime - entry.timestamp < maxAge
      );
      
      // Ultra-smooth filtering - only store if frequency is reasonable and smooth
      const lastEntry = userFrequencyHistory.current[userFrequencyHistory.current.length - 1];
      let shouldStore = true;
      
      if (lastEntry && userFrequencyHistory.current.length > 0) {
        const frequencyJump = Math.abs(currentFrequencyRef.current - lastEntry.frequency);
        const timeDiff = currentTime - lastEntry.timestamp;
        
        // Professional-grade smoothness: prevent visual artifacts
        if (frequencyJump > 300 && timeDiff < 50) {
          shouldStore = false;
        }
        
        // Also prevent too frequent updates for ultra-smooth rendering
        if (timeDiff < 16 && frequencyJump < 5) { // ~60fps throttling for small changes
          shouldStore = false;
        }
      }
      
      // Only process if not a massive spike
      if (shouldStore) {
        // Determine the current target frequency for color coding
      let currentTargetFrequency = null;
      if (isPlaying && targetNotes.length > 0) {
        const totalSequenceDuration = targetNotes.reduce((sum, _, index) => {
          const duration = (index < noteDurations.length && noteDurations[index] > 0) 
            ? noteDurations[index] / 1000  // Custom duration in seconds
            : secondsPerNote;              // BPM-based duration
          return sum + duration;
        }, 0);
        const scrollPosition = elapsedTime * pixelsPerSecond;

        // Calculate which note is at the middle line
        const distanceToMiddle = canvas.width / 2;

        // Only start checking when the wave has reached the middle
        if (scrollPosition > distanceToMiddle) {
          // Calculate which part of the sequence is at the middle
          const adjustedPosition = scrollPosition - distanceToMiddle;
          const positionInSequence =
            adjustedPosition % (totalSequenceDuration * pixelsPerSecond);

          // Find which note is at the current position
          let cumulativeTime = 0;
          let currentNoteIndex = -1;
          for (let i = 0; i < targetNotes.length; i++) {
            const noteDuration = (i < noteDurations.length && noteDurations[i] > 0) ? (noteDurations[i] / 1000) : secondsPerNote;
            if (
              positionInSequence >= cumulativeTime * pixelsPerSecond &&
              positionInSequence <
                (cumulativeTime + noteDuration) * pixelsPerSecond
            ) {
              currentNoteIndex = i;
              break;
            }
            cumulativeTime += noteDuration;
          }

          if (currentNoteIndex >= 0 && currentNoteIndex < targetNotes.length) {
            const currentNote = targetNotes[currentNoteIndex];
            currentTargetFrequency = NOTE_FREQUENCIES[currentNote];
          }
        }
      }

      // Determine color based on accuracy
      const pointColor = currentTargetFrequency
        ? getFrequencyColor(currentFrequencyRef.current, currentTargetFrequency)
        : "#6c757d"; // Gray when no target

        // Store all detected frequencies with proper color coding and gap information
        userFrequencyHistory.current.push({
          frequency: currentFrequencyRef.current,
          timestamp: currentTime,
          color: pointColor,
          isAfterGap: isAfterGap, // Use the gap flag from pitch detection
        });
      } // Close the shouldStore conditional
    }

    // Draw user frequency as a continuous graph with multi-colored segments
    // Show graph if we have history, regardless of current listening state
    if (userFrequencyHistory.current.length > 0) {
      const currentTime = Date.now();
      
      // Debug: Log graph state periodically
      if (currentTime % 5000 < 50) { // Every 5 seconds
        console.log('User graph state:', {
          historyLength: userFrequencyHistory.current.length,
          currentFreq: currentFrequencyRef.current,
          isListening: isListeningRef.current
        });
      }

      // Draw the frequency graph with color segments using horizontal timeline
      if (userFrequencyHistory.current.length > 1) {
        // Draw segments with their individual colors, respecting gaps
        for (let i = 1; i < userFrequencyHistory.current.length; i++) {
          const prevEntry = userFrequencyHistory.current[i - 1];
          const currEntry = userFrequencyHistory.current[i];

          // Skip drawing line if current point is after a gap
          if (currEntry.isAfterGap) {
            continue; // Don't connect this point to the previous one
          }

          // Calculate X position based on time elapsed since data point 
          const prevTimeFromStart = (currentTime - prevEntry.timestamp) / 1000; // Convert to seconds
          const currTimeFromStart = (currentTime - currEntry.timestamp) / 1000; // Convert to seconds
          
          const prevX = middleX - (prevTimeFromStart * pixelsPerSecond);
          const currX = middleX - (currTimeFromStart * pixelsPerSecond);

          // Expand visible range to show more history (allow drawing from left edge to middle)
          if (
            prevX >= -50 && // Allow some off-screen rendering for smoothness
            prevX <= canvas.width &&
            currX >= -50 &&
            currX <= canvas.width
          ) {
            const prevY = getYPosition(prevEntry.frequency, canvas.height);
            const currY = getYPosition(currEntry.frequency, canvas.height);

            // Only draw if both Y positions are visible on screen
            if (prevY >= -50 && prevY <= canvas.height + 50 && currY >= -50 && currY <= canvas.height + 50) {
              // Use the color stored with each point
              ctx.strokeStyle = currEntry.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(prevX, prevY);
              ctx.lineTo(currX, currY);
              ctx.stroke();
            }
          }
        }
      }

      // Draw current frequency point and value (show most recent if not currently detecting)
      const displayFreq = currentFrequencyRef.current > 0 
        ? currentFrequencyRef.current 
        : (userFrequencyHistory.current.length > 0 
           ? userFrequencyHistory.current[userFrequencyHistory.current.length - 1].frequency 
           : 0);
           
      if (displayFreq > 0 && userFrequencyHistory.current.length > 0) {
        const currentY = getYPosition(displayFreq, canvas.height);
        
        // Only draw if the current frequency point is visible on screen
        if (currentY >= -50 && currentY <= canvas.height + 50) {
          // Use the color from the latest entry
          const currentColor =
            userFrequencyHistory.current[userFrequencyHistory.current.length - 1]
              .color;

          // Draw a circle at the current position
          ctx.fillStyle = currentColor;
          ctx.beginPath();
          ctx.arc(middleX, currentY, 6, 0, 2 * Math.PI);
          ctx.fill();

          // Draw a subtle glow effect
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(middleX, currentY, 12, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Draw frequency value
          ctx.fillStyle = currentColor;
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "left";
          
          // Position text to the right of the middle line
          const textX = middleX + 15;
          ctx.fillText(`${displayFreq.toFixed(1)} Hz`, textX, currentY + 5);
        }
      }
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      // Initialize guitar harmonics if not already created
      if (!guitarHarmonicsRef.current) {
        guitarHarmonicsRef.current = new GuitarHarmonics();
      }
      // Resume audio context if needed
      guitarHarmonicsRef.current.resume();

      // Only reset start time if it's not already set (preserve continuity)
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      lastPlayedNoteRef.current = null;

      // Initialize scroll position to show middle range notes
      if (scrollOffsetRef.current === 0 && targetScrollOffsetRef.current === 0) {
        const pixelsPerNote = 40;
        const totalHeight = displayNotes.length * pixelsPerNote;
        const canvas = canvasRef.current;
        if (canvas) {
          // Center the view on the middle of all notes
          const centerY = canvas.height / 2;
          const middleNoteY = totalHeight / 2;
          targetScrollOffsetRef.current = centerY - middleNoteY;
          scrollOffsetRef.current = targetScrollOffsetRef.current;
        }
      }

      // Start animation if not already running
      if (!animationRef.current) {
        animate();
      }
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      // Stop all harmonics when playback stops
      if (guitarHarmonicsRef.current) {
        guitarHarmonicsRef.current.stopAll();
      }
      // Reset when stopped
      targetWaveRef.current = [];
      userWaveRef.current = [];
      userFrequencyHistory.current = [];
      startTimeRef.current = 0;
      currentTargetIndexRef.current = 0;
      lastPlayedNoteRef.current = null;
      dataCompressionCounter.current = 0;
      lastStoredFrequency.current = 0;
      renderCache.current = { lastUpdate: 0 };
      scrollOffsetRef.current = 0;
      targetScrollOffsetRef.current = 0;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [isPlaying, bpm, targetNotes, notes, noteDurations]);

  // Update frequency ref whenever it changes
  useEffect(() => {
    currentFrequencyRef.current = currentFrequency;
    if (currentFrequency > 0) {
      console.log("Current frequency detected:", currentFrequency);
    }
  }, [currentFrequency]);

  // Update isListening ref whenever it changes
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Handle canvas resizing
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;

      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (guitarHarmonicsRef.current) {
        guitarHarmonicsRef.current.stopAll();
      }
    };
  }, []);

  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      // Clear all history and reset state
      userFrequencyHistory.current = [];
      targetWaveRef.current = [];
      userWaveRef.current = [];
      startTimeRef.current = 0;
      currentTargetIndexRef.current = 0;
      lastPlayedNoteRef.current = null;
      dataCompressionCounter.current = 0;
      lastStoredFrequency.current = 0;
      renderCache.current = { lastUpdate: 0 };
      scrollOffsetRef.current = 0;
      targetScrollOffsetRef.current = 0;

      // Clear the canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [resetTrigger]);

  return <canvas ref={canvasRef} className="waveform-canvas" />;
};