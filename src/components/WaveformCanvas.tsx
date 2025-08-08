import { useRef, useEffect } from 'react';
import { NOTE_FREQUENCIES } from '../constants/notes';

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
  buffer, 
  currentFrequency, 
  targetNotes,
  bpm,
  isPlaying,
  isListening,
  onNoteChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const targetWaveRef = useRef<WavePoint[]>([]);
  const userWaveRef = useRef<WavePoint[]>([]);
  const currentFrequencyRef = useRef<number>(0);
  const isListeningRef = useRef<boolean>(false);
  const currentTargetIndexRef = useRef<number>(0);
  const userFrequencyHistory = useRef<{ frequency: number; timestamp: number; color: string }[]>([]);

  // Calculate pixels per second based on BPM
  const beatDuration = 60 / bpm; // seconds per beat
  const pixelsPerSecond = 100 / beatDuration; // 100 pixels per beat
  
  // Function to get expanded notes range for display
  const getExpandedNotesRange = (targetNotes: string[]): string[] => {
    if (targetNotes.length === 0) return [];
    
    // Get all note names as an ordered array
    const allNoteKeys = Object.keys(NOTE_FREQUENCIES);
    
    // Find min and max notes from target
    let minIndex = allNoteKeys.length;
    let maxIndex = -1;
    
    targetNotes.forEach(note => {
      const index = allNoteKeys.indexOf(note);
      if (index !== -1) {
        minIndex = Math.min(minIndex, index);
        maxIndex = Math.max(maxIndex, index);
      }
    });
    
    if (minIndex === allNoteKeys.length || maxIndex === -1) return targetNotes;
    
    // Expand range by up to 3 notes on each side
    const expandedMinIndex = Math.max(0, minIndex - 3);
    const expandedMaxIndex = Math.min(allNoteKeys.length - 1, maxIndex + 3);
    
    // Return the expanded range
    const expandedNotes: string[] = [];
    for (let i = expandedMinIndex; i <= expandedMaxIndex; i++) {
      expandedNotes.push(allNoteKeys[i]);
    }
    
    return expandedNotes;
  };
  
  // Get expanded notes for display
  const displayNotes = getExpandedNotesRange(targetNotes);

  // Calculate Y position for a frequency using expanded range
  const getYPosition = (frequency: number, canvasHeight: number): number => {
    if (!frequency || displayNotes.length === 0) return canvasHeight / 2;
    
    // Use display notes (expanded range) for Y position calculation
    const frequencies = displayNotes.map(n => NOTE_FREQUENCIES[n]).filter(f => f);
    if (frequencies.length === 0) return canvasHeight / 2;
    
    const minFreq = Math.min(...frequencies) * 0.95;
    const maxFreq = Math.max(...frequencies) * 1.05;
    const range = maxFreq - minFreq;
    
    if (range === 0) return canvasHeight / 2;
    
    const normalized = (frequency - minFreq) / range;
    return canvasHeight - (normalized * canvasHeight * 0.9 + canvasHeight * 0.05);
  };

  // Get color based on frequency match using cents (musical intervals)
  const getFrequencyColor = (userFreq: number, targetFreq: number | null): string => {
    if (!targetFreq || !userFreq) return '#ef4444'; // red
    
    // Calculate cents difference (1200 cents = 1 octave)
    const cents = Math.abs(1200 * Math.log2(userFreq / targetFreq));
    
    if (cents <= 10) return '#22c55e'; // green - perfect match (within ±10 cents)
    if (cents <= 25) return '#f97316'; // orange - close match (within ±25 cents)
    if (cents <= 50) return '#f59e0b'; // amber - ok match (within ±50 cents)
    return '#ef4444'; // red - poor match (more than ±50 cents)
  };


  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    if (!startTimeRef.current) startTimeRef.current = currentTime;
    const elapsedTime = (currentTime - startTimeRef.current) / 1000; // in seconds

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }

    // Draw note labels with frequency for expanded range
    ctx.font = '14px Arial';
    displayNotes.forEach(note => {
      const freq = NOTE_FREQUENCIES[note];
      if (!freq) return;
      
      const y = getYPosition(freq, canvas.height);
      
      // Check if this is in the target notes list (user entered/default)
      const isTarget = targetNotes.includes(note);
      
      // Draw faint horizontal guide line for all notes
      ctx.strokeStyle = isTarget ? '#dee2e6' : '#f1f3f5';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw note label with frequency
      // Target notes are bold and blue, expanded notes are gray
      ctx.fillStyle = isTarget ? '#1c7ed6' : '#adb5bd';
      ctx.font = isTarget ? 'bold 14px Arial' : '12px Arial';
      ctx.fillText(`${note} (${freq.toFixed(0)}Hz)`, 5, y - 5);
    });

    // Draw blue middle line
    const middleX = canvas.width / 2;
    ctx.strokeStyle = '#1c7ed6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(middleX, 0);
    ctx.lineTo(middleX, canvas.height);
    ctx.stroke();
    
    // Draw time indicator based on max note duration
    const maxDuration = Math.max(...(noteDurations.length > 0 ? noteDurations : [2000])) / 1000; // Convert to seconds
    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    
    // Draw vertical lines every second from the middle line
    for (let i = 1; i <= Math.ceil(maxDuration); i++) {
      const x = middleX - (pixelsPerSecond * i);
      if (x > 0) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 30);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        // Label each second
        ctx.fillStyle = '#6c757d';
        ctx.font = '10px Arial';
        ctx.fillText(`${i}s`, x - 5, canvas.height - 5);
      }
    }
    ctx.setLineDash([]);

    // Draw continuous waveform for all target notes as rectangular wave
    if (isPlaying && targetNotes.length > 0) {
      // Calculate total sequence duration based on individual note durations
      const totalSequenceDuration = noteDurations.reduce((sum, duration, index) => {
        if (index < targetNotes.length) {
          return sum + (duration / 1000); // Convert ms to seconds
        }
        return sum;
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
      const visibleWidth = canvas.width + 200; // Add buffer for smooth edges
      const sequencesNeeded = Math.ceil(visibleWidth / sequencePixels) + 3;
      
      // Draw continuous sequences with stable rendering
      // Start from before the visible area to ensure smooth entry
      const startSeq = Math.floor(scrollPosition / sequencePixels) - 1;
      const endSeq = startSeq + sequencesNeeded;
      
      for (let seq = startSeq; seq < endSeq; seq++) {
        // Calculate the base position for this sequence repetition
        // Start from the right side of canvas and scroll left
        const sequenceBaseX = canvas.width - scrollPosition + (seq * sequencePixels);
        
        // Draw each note in the sequence
        let cumulativeX = 0;
        for (let i = 0; i < targetNotes.length; i++) {
          const note = targetNotes[i];
          const frequency = NOTE_FREQUENCIES[note];
          if (!frequency) continue;
          
          const noteDuration = (noteDurations[i] || 2000) / 1000; // Convert to seconds, default 2s
          const noteStartX = sequenceBaseX + cumulativeX;
          const noteEndX = noteStartX + (noteDuration * pixelsPerSecond);
          cumulativeX += noteDuration * pixelsPerSecond;
          
          // Check if this segment is visible (with buffer for smooth transitions)
          if (noteEndX < -100 || noteStartX > canvas.width + 100) continue;
          
          const centerY = getYPosition(frequency, canvas.height);
          
          // Don't clamp - let the canvas clip naturally for smoother rendering
          wavePoints.push({ x: noteStartX, y: centerY });
          wavePoints.push({ x: noteEndX, y: centerY });
          
          // Check if this note is at the middle line for triggering events
          if (noteStartX <= middleX && noteEndX >= middleX) {
            const progress = (middleX - noteStartX) / (noteDuration * pixelsPerSecond);
            
            // Trigger note change only at the beginning
            if (progress < 0.05) {
              const actualIndex = i % targetNotes.length;
              onNoteChange(actualIndex);
            }
            
            // Draw pulse effect for the entire duration the note is at the middle line
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(middleX, centerY, 20, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.globalAlpha = 1;
            
            // Draw target note and frequency above the circle
            ctx.save();
            ctx.fillStyle = '#f97316';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(note, middleX - 30, centerY - 20);
            ctx.font = '16px Arial';
            ctx.fillText(`${frequency.toFixed(0)} Hz`, middleX - 30, centerY - 40);
            ctx.restore();
          }
        }
      }
      
      // Draw the rectangular wave directly without sorting/filtering
      if (wavePoints.length > 1) {
        // Draw the rectangular wave with orange color
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f97316';
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

    // Update user frequency history
    if (isListeningRef.current && currentFrequencyRef.current > 0) {
      const currentTime = Date.now();
      
      // Determine the current target frequency for color coding
      let currentTargetFrequency = null;
      if (isPlaying && targetNotes.length > 0) {
        const totalSequenceDuration = noteDurations.reduce((sum, duration, index) => {
          if (index < targetNotes.length) {
            return sum + (duration / 1000);
          }
          return sum;
        }, 0);
        const scrollPosition = elapsedTime * pixelsPerSecond;
        
        // Calculate which note is at the middle line
        // The wave starts from the right, so we need to calculate what's at the middle
        // The middle line is at canvas.width / 2 distance from the start
        const distanceToMiddle = (canvas.width / 2);
        
        // Only start checking when the wave has reached the middle
        if (scrollPosition > distanceToMiddle) {
          // Calculate which part of the sequence is at the middle
          const adjustedPosition = scrollPosition - distanceToMiddle;
          const positionInSequence = adjustedPosition % (totalSequenceDuration * pixelsPerSecond);
          
          // Find which note is at the current position
          let cumulativeTime = 0;
          let currentNoteIndex = -1;
          for (let i = 0; i < targetNotes.length; i++) {
            const noteDuration = (noteDurations[i] || 2000) / 1000;
            if (positionInSequence >= cumulativeTime * pixelsPerSecond && 
                positionInSequence < (cumulativeTime + noteDuration) * pixelsPerSecond) {
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
      
      // Determine color for this point
      const pointColor = currentTargetFrequency 
        ? getFrequencyColor(currentFrequencyRef.current, currentTargetFrequency)
        : '#6c757d';
      
      // Add current frequency to history with its color
      userFrequencyHistory.current.push({
        frequency: currentFrequencyRef.current,
        timestamp: currentTime,
        color: pointColor
      });
      
      // Remove old entries that are off screen (more than middleX pixels to the left)
      const maxAge = (middleX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds
      userFrequencyHistory.current = userFrequencyHistory.current.filter(
        entry => currentTime - entry.timestamp <= maxAge
      );
    }
    
    // Draw user frequency as a continuous graph with multi-colored segments
    if (isListeningRef.current && userFrequencyHistory.current.length > 0) {
      const currentTime = Date.now();
      
      // Draw the frequency graph with color segments
      if (userFrequencyHistory.current.length > 1) {
        // Draw segments with their individual colors
        for (let i = 1; i < userFrequencyHistory.current.length; i++) {
          const prevEntry = userFrequencyHistory.current[i - 1];
          const currEntry = userFrequencyHistory.current[i];
          
          const prevAge = currentTime - prevEntry.timestamp;
          const currAge = currentTime - currEntry.timestamp;
          
          const prevX = middleX - (prevAge / 1000) * pixelsPerSecond;
          const currX = middleX - (currAge / 1000) * pixelsPerSecond;
          
          // Only draw if both points are visible
          if (prevX >= 0 && prevX <= middleX && currX >= 0 && currX <= middleX) {
            const prevY = getYPosition(prevEntry.frequency, canvas.height);
            const currY = getYPosition(currEntry.frequency, canvas.height);
            
            // Use the color stored with each point
            ctx.strokeStyle = currEntry.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(currX, currY);
            ctx.stroke();
          }
        }
      }
      
      // Draw current frequency point and value
      if (currentFrequencyRef.current > 0 && userFrequencyHistory.current.length > 0) {
        const currentY = getYPosition(currentFrequencyRef.current, canvas.height);
        // Use the color from the latest entry
        const currentColor = userFrequencyHistory.current[userFrequencyHistory.current.length - 1].color;
        
        // Draw a circle at the current position
        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.arc(middleX, currentY, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw frequency value and difference
        ctx.fillStyle = currentColor;
        ctx.font = 'bold 14px Arial';
        
        // Get current target frequency for difference calculation
        let currentTargetFrequency = null;
        if (isPlaying && targetNotes.length > 0) {
          const totalSequenceDuration = noteDurations.reduce((sum, duration, index) => {
            if (index < targetNotes.length) {
              return sum + (duration / 1000);
            }
            return sum;
          }, 0);
          const scrollPosition = elapsedTime * pixelsPerSecond;
          
          // Calculate which note is at the middle line
          const distanceToMiddle = (canvas.width / 2);
          
          // Only start checking when the wave has reached the middle
          if (scrollPosition > distanceToMiddle) {
            const adjustedPosition = scrollPosition - distanceToMiddle;
            const positionInSequence = adjustedPosition % (totalSequenceDuration * pixelsPerSecond);
            
            // Find which note is at the current position
            let cumulativeTime = 0;
            let currentNoteIndex = -1;
            for (let i = 0; i < targetNotes.length; i++) {
              const noteDuration = (noteDurations[i] || 2000) / 1000;
              if (positionInSequence >= cumulativeTime * pixelsPerSecond && 
                  positionInSequence < (cumulativeTime + noteDuration) * pixelsPerSecond) {
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
        
        if (currentTargetFrequency) {
          const difference = currentFrequencyRef.current - currentTargetFrequency;
          const diffText = difference > 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1);
          ctx.fillText(`${currentFrequencyRef.current.toFixed(1)} Hz (${diffText})`, middleX + 10, currentY);
        } else {
          // Just show the frequency when no target
          ctx.fillText(`${currentFrequencyRef.current.toFixed(1)} Hz`, middleX + 10, currentY);
        }
      }
    }


    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = Date.now();
      animate();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Reset when stopped
      targetWaveRef.current = [];
      userWaveRef.current = [];
      userFrequencyHistory.current = [];
      startTimeRef.current = 0;
      currentTargetIndexRef.current = 0;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, bpm, targetNotes, notes, noteDurations]);

  // Update frequency ref whenever it changes
  useEffect(() => {
    currentFrequencyRef.current = currentFrequency;
    if (currentFrequency > 0) {
      console.log('Current frequency detected:', currentFrequency);
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
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef}
      className="waveform-canvas"
    />
  );
};