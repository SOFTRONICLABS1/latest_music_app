import React, { Component, forwardRef } from 'react';
import './DuckVoiceGameSDK.css';
import { PitchDetector, type PitchData } from './utils/PitchDetector';
import { SoundSynthesis } from './utils/SoundSynthesis';
import { NOTE_FREQUENCIES } from './constants/notes';
// Import your PNG images here
import flappyBirdImage from './assets/flappy-bird.png';
import backgroundImage from './assets/background.png';

// Type definitions
export interface GameNote {
  note: string;
  duration: number;
}

export interface BarPosition {
  id: string;
  noteIndex: number;
  note: string;
  duration: number;
  startX: number;
  y: number;
  width: number;
  frequency: number;
  collected: boolean;
  timeInNote: number;
}

export interface Bar extends BarPosition {
  x: number;
  cycleNumber?: number;
  originalIndex?: number;
  spawnTime?: number;
  uniqueId?: string;
  contactStartTime?: number | null;
  totalContactTime?: number;
  hasPlayedHarmonic?: boolean; // Track if harmonic has been played for this bar
}

export interface ModeSettings {
  threshold: number;
  scoreMultiplier: number;
}

export interface GameState {
  gameState: 'idle' | 'playing' | 'paused' | 'stopped';
  runnerY: number;
  runnerVelocity: number;
  bars: Bar[];
  score: number;
  currentNoteIndex: number;
  isJumping: boolean;
  voiceDetected: boolean;
  currentFrequency: number;
  noteProgress: Record<string, number>;
  finalScore: number;
  elapsedTime: number;
  currentCycle: number;
  cycleScores: number[];
  averagePercentage: number;
  notesPerCycle: number;
  harmonicsEnabled: boolean;
}

export interface DuckVoiceGameSDKProps {
  gameId: string;
  bpm: number;
  notes: GameNote[];
  mode?: 'easy' | 'medium' | 'hard';
}

export interface DuckImageProps {
  src: string;
  style: React.CSSProperties;
  className: string;
  alt: string;
}

export const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

class DuckVoiceGameSDKComponent extends Component<DuckVoiceGameSDKProps, GameState> {
  private gameId: string;
  private bpm: number;
  private notes: GameNote[];
  private mode: 'easy' | 'medium' | 'hard';
  private modeSettings: Record<string, ModeSettings>;
  private groundLevel: number;
  private pitchDetector: PitchDetector;
  private soundSynthesis: SoundSynthesis;
  // private animationId: number | null = null;
  private gameLoopId: number | null = null;
  private gravityLoopId: number | null = null;
  private noteSpawnTimer: number | null = null;
  private barPositions: BarPosition[] = [];

  constructor(props: DuckVoiceGameSDKProps) {
    super(props);
    
    const { gameId, bpm, notes, mode = 'easy' } = props;
    
    this.gameId = gameId;
    this.bpm = bpm;
    this.notes = notes || [];
    this.mode = mode;
    
    this.modeSettings = {
      easy: { threshold: 0.75, scoreMultiplier: 1 },
      medium: { threshold: 0.85, scoreMultiplier: 1.5 },
      hard: { threshold: 0.90, scoreMultiplier: 2 }
    };

    // Adjust ground level based on screen orientation
    const isLandscape = window.innerWidth > window.innerHeight;
    const isShortScreen = window.innerHeight <= 500;
    
    if (isLandscape && isShortScreen) {
      this.groundLevel = window.innerHeight * 0.85; // Higher ground level for landscape
    } else {
    this.groundLevel = window.innerHeight * 0.75;
    }
    
    this.state = {
      gameState: 'idle',
      runnerY: this.groundLevel - 45, // Adjusted for smaller bird (35px height + 10px margin)
      runnerVelocity: 0,
      bars: [],
      score: 0,
      currentNoteIndex: 0,
      isJumping: false,
      voiceDetected: false,
      currentFrequency: 0,
      noteProgress: {},
      finalScore: 0,
      elapsedTime: 0,
      // New cycle tracking
      currentCycle: 0,
      cycleScores: [], // Array to store score for each cycle
      averagePercentage: 0,
      notesPerCycle: 0,
      harmonicsEnabled: true
    };
    
    this.pitchDetector = new PitchDetector();
    this.soundSynthesis = new SoundSynthesis();
  }

  componentDidMount(): void {
    this.initializeMicrophone();
    this.calculateBarPositions();
    
    // Add resize listener for orientation changes
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount(): void {
    this.stop();
    if (this.pitchDetector) {
      this.pitchDetector.stopListening();
    }
        if (this.soundSynthesis) {
      this.soundSynthesis.destroy();
    }
    
    // Remove resize listener
    window.removeEventListener('resize', this.handleResize);
  }

    handleResize = (): void => {
    // Update ground level based on new screen dimensions
    const isLandscape = window.innerWidth > window.innerHeight;
    const isShortScreen = window.innerHeight <= 500;
    
    const newGroundLevel = (isLandscape && isShortScreen) 
      ? window.innerHeight * 0.85 
      : window.innerHeight * 0.75;
    
    if (newGroundLevel !== this.groundLevel) {
      this.groundLevel = newGroundLevel;
      
      // Update runner position if needed
      this.setState(prevState => ({
        runnerY: Math.min(prevState.runnerY, this.groundLevel - 45) // Adjusted for smaller bird
      }));
      
      // Recalculate bar positions for new dimensions
      this.calculateBarPositions();
    }
  };

  calculateBarPositions = (): void => {
    // Calculate movement speed based on BPM
    // Higher BPM = faster movement, Lower BPM = slower movement
    const beatDuration = 60 / this.bpm;
    const pixelsPerSecond = 150 + (this.bpm * 0.5); // Base speed + BPM factor
    let currentTime = 0;
    
    this.barPositions = this.notes.map((note, index) => {
      // Calculate actual duration in seconds
      // If note.duration is already in beats (1 = 1 beat), use beatDuration
      // If note.duration is in seconds, use it directly
      const actualDuration = note.duration <= 10 ? (note.duration * beatDuration) : note.duration;
      
      // Calculate bar width based on duration and BPM
      const baseWidthMultiplier = 60 + (this.bpm * 0.5); // More conservative width
      const barWidth = Math.max(actualDuration * baseWidthMultiplier, 60); // Minimum width of 60px
      
      // Position bars with proper spacing to prevent overlap
      const startX = window.innerWidth + (currentTime * pixelsPerSecond);
      
      // Calculate spacing to prevent overlap based on bar width and movement
      // Ensure there's always clear space between notes
      const barTimeInSeconds = barWidth / pixelsPerSecond;
      const minGapPixels = 5; // Reduced minimum gap in pixels between notes (was 10)
      const minGapTime = minGapPixels / pixelsPerSecond;
      
      // Use the note duration plus minimum gap time
      const totalSpacing = actualDuration + Math.max(minGapTime, barTimeInSeconds * 0.2);
      
      currentTime += totalSpacing;
      
      const noteFrequency = this.getNoteFrequency(note.note);
      const y = this.calculateYPosition(noteFrequency);
      
      return {
        id: `${this.gameId}_note_${index}`,
        noteIndex: index,
        note: note.note,
        duration: actualDuration * 1000,
        startX,
        y,
        width: barWidth,
        frequency: noteFrequency,
        collected: false,
        timeInNote: 0
      };
    });
  };

  getNoteFrequency = (noteName: string): number => {
    // Map simple note names to specific octaves for positioning
    const noteMapping: Record<string, string> = {
      'C': 'C4',
      'C#': 'C#4', 
      'D': 'D4',
      'D#': 'D#4',
      'E': 'E4',
      'F': 'F4',
      'F#': 'F#4',
      'G': 'G4',
      'G#': 'G#4',
      'A': 'A4',
      'A#': 'A#4',
      'B': 'B4'
    };
    
    const mappedNote = noteMapping[noteName] || noteName;
    return NOTE_FREQUENCIES[mappedNote] || 440;
  };

  getExpandedNotesRange = (targetNotes: string[]): string[] => {
    if (targetNotes.length === 0) return [];
    
    const allNoteKeys = Object.keys(NOTE_FREQUENCIES);
    
    // Find min and max notes from target
    let minIndex = allNoteKeys.length;
    let maxIndex = -1;
    
    targetNotes.forEach(note => {
      // Map simple notes to full note names for lookup
      const noteMapping: Record<string, string> = {
        'C': 'C4', 'C#': 'C#4', 'D': 'D4', 'D#': 'D#4',
        'E': 'E4', 'F': 'F4', 'F#': 'F#4', 'G': 'G4',
        'G#': 'G#4', 'A': 'A4', 'A#': 'A#4', 'B': 'B4'
      };
      const mappedNote = noteMapping[note] || note;
      const index = allNoteKeys.indexOf(mappedNote);
      if (index !== -1) {
        minIndex = Math.min(minIndex, index);
        maxIndex = Math.max(maxIndex, index);
      }
    });
    
    if (minIndex === allNoteKeys.length || maxIndex === -1) return targetNotes;
    
    // Expand range by up to 3 notes on each side
    const expandedMinIndex = Math.max(0, minIndex - 3);
    const expandedMaxIndex = Math.min(allNoteKeys.length - 1, maxIndex + 3);
    
    const expandedNotes: string[] = [];
    for (let i = expandedMinIndex; i <= expandedMaxIndex; i++) {
      expandedNotes.push(allNoteKeys[i]);
    }
    
    return expandedNotes;
  };

  getDuckImageAndStyle = (_frequency: number): DuckImageProps => {
    // Always return the same duck image without color changes
    return {
      src: flappyBirdImage,
      style: { filter: 'none' },
      className: 'bird-image',
      alt: 'Duck'
    };
  };

  calculateYPosition = (frequency: number): number => {
    if (!frequency) return this.groundLevel - 60; // Default ground position
    
    // If no notes are available, use a logarithmic frequency-to-height mapping
    if (this.notes.length === 0) {
      // Use logarithmic scale to handle wide frequency range (20Hz - 4000Hz+)
      const minFreq = 20;    // Very low bass (20Hz)
      const maxFreq = 4000;  // High soprano/whistle (4000Hz)
      
      // Clamp frequency to reasonable range, but don't restrict too much
      const clampedFreq = Math.max(minFreq, Math.min(maxFreq, frequency));
      
      // Use logarithmic scale for better distribution across frequency range
      const logMin = Math.log(minFreq);
      const logMax = Math.log(maxFreq);
      const logFreq = Math.log(clampedFreq);
      const normalized = (logFreq - logMin) / (logMax - logMin);
      
      // Calculate Y position: higher frequency = lower Y value (higher on screen)
      const topPadding = 30;  // Reduced padding to use more screen
      const bottomPadding = 80;
      const availableHeight = this.groundLevel - topPadding - bottomPadding;
      
      // Higher frequency (closer to 1.0) = lower Y value (higher position)
      const yPosition = this.groundLevel - bottomPadding - (normalized * availableHeight);
      
      return yPosition;
    }
    
    // Get expanded range of notes for positioning
    const noteNames = this.notes.map(note => note.note);
    const displayNotes = this.getExpandedNotesRange(noteNames);
    
    // Calculate frequency range from expanded notes
    const frequencies = displayNotes.map(n => NOTE_FREQUENCIES[n]).filter(f => f);
    if (frequencies.length === 0) {
      // Fallback using same logarithmic mapping as above
      const minFreq = 20;
      const maxFreq = 4000;
      const clampedFreq = Math.max(minFreq, Math.min(maxFreq, frequency));
      
      const logMin = Math.log(minFreq);
      const logMax = Math.log(maxFreq);
      const logFreq = Math.log(clampedFreq);
      const normalized = (logFreq - logMin) / (logMax - logMin);
      
      const topPadding = 30;
      const bottomPadding = 80;
      const availableHeight = this.groundLevel - topPadding - bottomPadding;
      const yPosition = this.groundLevel - bottomPadding - (normalized * availableHeight);
      
      return yPosition;
    }
    
    const minFreq = Math.min(...frequencies) * 0.95;
    const maxFreq = Math.max(...frequencies) * 1.05;
    const range = maxFreq - minFreq;
    
    if (range === 0) return this.groundLevel / 2;
    
    const normalized = (frequency - minFreq) / range;
    const canvasHeight = this.groundLevel - 100; // Game area height
    return canvasHeight - (normalized * canvasHeight * 0.9 + canvasHeight * 0.05);
  };

  initializeMicrophone = async (): Promise<void> => {
    try {
      await this.pitchDetector.startListening((pitchData) => {
        this.handlePitchData(pitchData);
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  handlePitchData = (pitchData: PitchData): void => {
    // Only process pitch data when playing
    if (this.state.gameState !== 'playing') {
      return;
    }

    const { frequency, volume } = pitchData;
    const volumeThreshold = 0.01; // Adjust based on PitchDetector volume scale
    
    if (volume > volumeThreshold && frequency > 20) {
      // Calculate target Y position based on frequency
      const targetY = this.calculateYPosition(frequency);
      
      this.setState(prevState => {
        const currentY = prevState.runnerY;
        const yDifference = targetY - currentY;
        
        // Calculate velocity needed to move toward target position
        const maxSpeed = 12; // Maximum movement speed for responsiveness
        const dampingFactor = 0.25; // Faster response to frequency changes
        
        // Calculate velocity to move toward target
        let targetVelocity = yDifference * dampingFactor;
        
        // Clamp velocity to max speed
        targetVelocity = Math.max(-maxSpeed, Math.min(maxSpeed, targetVelocity));
        
        return {
          voiceDetected: true,
          currentFrequency: frequency,
          runnerVelocity: targetVelocity,
          isJumping: Math.abs(yDifference) > 5 // Only show jumping animation if moving significantly
        };
      });
      
      this.checkBarCollection(frequency);
    } else {
      this.setState({ voiceDetected: false });
    }
  };

  checkBarCollection = (frequency: number): void => {
    // Calculate responsive runner position
    const screenWidth = window.innerWidth;
    let runnerXPercentage = 0.30; // 30% by default
    
    if (screenWidth <= 480) {
      runnerXPercentage = 0.20; // 20% on mobile
    } else if (screenWidth <= 768) {
      runnerXPercentage = 0.25; // 25% on tablet
    }
    
    const runnerX = screenWidth * runnerXPercentage + 25; // Add half bird width
    
    this.setState(prevState => {
      let scoreGained = 0;
      const runnerTop = prevState.runnerY;
      const runnerBottom = prevState.runnerY + 50;
      const currentTime = Date.now();
      const requiredThreshold = this.modeSettings[this.mode].threshold;
      
      // Process bars and track contact time
      const updatedBars = prevState.bars.map(bar => {
        if (bar.collected) return bar;
        
        const barLeft = bar.x;
        const barRight = bar.x + bar.width;
        const barTop = bar.y;
        const barBottom = bar.y + 20;
        
        // Check both horizontal and vertical overlap
        const horizontalOverlap = runnerX >= barLeft && runnerX <= barRight;
        const verticalOverlap = runnerBottom >= barTop && runnerTop <= barBottom;
        
        if (horizontalOverlap && verticalOverlap) {
          // More forgiving frequency matching
          const frequencyTolerance = 80; // Fixed tolerance
          const frequencyMatch = Math.abs(frequency - bar.frequency) < frequencyTolerance;
          
          if (frequencyMatch) {
            // Initialize contact tracking if not already started
            if (!bar.contactStartTime) {
              bar.contactStartTime = currentTime;
              bar.totalContactTime = 0;
            }
            
            // Update contact time
            bar.totalContactTime = currentTime - bar.contactStartTime;
            
            // Calculate contact percentage based on note duration
            const noteDurationMs = bar.duration; // Duration should be in ms
            const contactPercentage = bar.totalContactTime / noteDurationMs;
            
            // Award points if threshold is met and not already collected
            if (contactPercentage >= requiredThreshold && !bar.collected) {
              scoreGained += 10 * this.modeSettings[this.mode].scoreMultiplier;
              return { ...bar, collected: true };
            }
            
            return bar; // Still in contact, continue tracking
          } else {
            // Wrong frequency - reset contact time
            return { ...bar, contactStartTime: null, totalContactTime: 0 };
          }
        } else {
          // Not overlapping - reset contact time
          return { ...bar, contactStartTime: null, totalContactTime: 0 };
        }
      });
      
      // Track cycle completion and calculate averages
      let newCycleScores = [...prevState.cycleScores];
      let newAveragePercentage = prevState.averagePercentage;
      
      if (scoreGained > 0) {
        // Check if we completed a cycle
        const completedBars = updatedBars.filter(bar => bar.collected);
        completedBars.forEach(bar => {
          if (bar.cycleNumber !== undefined) {
            // Initialize cycle score if needed
            if (!newCycleScores[bar.cycleNumber]) {
              newCycleScores[bar.cycleNumber] = 0;
            }
            newCycleScores[bar.cycleNumber] += scoreGained;
          }
        });
        
        // Calculate average percentage across all cycles
        if (newCycleScores.length > 0 && prevState.notesPerCycle > 0) {
          const maxScorePerCycle = prevState.notesPerCycle * 10 * this.modeSettings[this.mode].scoreMultiplier;
          const totalPercentage = newCycleScores.reduce((sum, cycleScore) => {
            return sum + ((cycleScore / maxScorePerCycle) * 100);
          }, 0);
          newAveragePercentage = totalPercentage / newCycleScores.length;
        }
      }
      
      return { 
        bars: updatedBars, // Keep all bars here, cleanup happens in game loop
        score: prevState.score + scoreGained,
        cycleScores: newCycleScores,
        averagePercentage: newAveragePercentage
      };
    });
  };

  startGravity = () => {
    this.gravityLoopId = setInterval(() => {
      this.setState(prevState => {
        // Only apply gravity when no voice is detected
        if (prevState.voiceDetected) {
          // When voice is detected, just update position based on current velocity
          let newY = prevState.runnerY + prevState.runnerVelocity;
          
          // Ground collision
          if (newY >= this.groundLevel - 60) {
            newY = this.groundLevel - 60;
            return {
              runnerY: newY,
              runnerVelocity: 0,
              isJumping: false
            };
          }
          
          // Ceiling collision
          if (newY <= 30) {
            newY = 30;
            return {
              runnerY: newY,
              runnerVelocity: 0,
              isJumping: false
            };
          }
          
          return {
            runnerY: newY,
            runnerVelocity: prevState.runnerVelocity * 0.95, // Slight dampening
            isJumping: prevState.isJumping
          };
        } else {
          // Apply normal gravity when no voice detected
          const gravity = 0.6; // Gravity acceleration
          const maxFallSpeed = 12; // Terminal velocity
          const damping = 0.98; // Slight air resistance
          
          // Update velocity (add gravity, apply damping)
          let newVelocity = (prevState.runnerVelocity + gravity) * damping;
          newVelocity = Math.min(newVelocity, maxFallSpeed); // Cap fall speed
          
          // Update position based on velocity
          let newY = prevState.runnerY + newVelocity;
          
          // Ground collision
          if (newY >= this.groundLevel - 60) {
            newY = this.groundLevel - 60;
            newVelocity = 0;
          }
          
          // Ceiling collision
          if (newY <= 30) {
            newY = 30;
            newVelocity = 0;
          }
          
          return {
            runnerY: newY,
            runnerVelocity: newVelocity,
            isJumping: newY !== this.groundLevel - 60
          };
        }
      });
    }, 30); // Faster update for smoother physics
  };

  startGameLoop = () => {
    const startTime = Date.now();
    
    this.gameLoopId = setInterval(() => {
      const currentTime = Date.now() - startTime;
      
      this.setState(prevState => {
        // Calculate bird line position for harmonic detection
        const screenWidth = window.innerWidth;
        let runnerXPercentage = 0.40; // 40% by default (moved right)
        
        if (screenWidth <= 480) {
          runnerXPercentage = 0.30; // 30% on mobile (moved right)
        } else if (screenWidth <= 768) {
          runnerXPercentage = 0.35; // 35% on tablet (moved right)
        }
        
        // CSS left: 30% positions the LEFT EDGE of the bird element
        // Use the same positioning as collision detection
        const birdWidth = 35; // Bird width from CSS (reduced from 50)
        const runnerLeftEdge = screenWidth * runnerXPercentage; // Left edge position from CSS
        const birdLineX = runnerLeftEdge + (birdWidth / 2);
        // Move bars
        let updatedBars = prevState.bars.map(bar => ({
          ...bar,
          x: bar.x - 3
        }));
        
        // More aggressive and comprehensive cleanup
        const beforeCount = updatedBars.length;
        const activeBarIds = new Set(); // Track unique bar IDs to prevent duplicates
        
        updatedBars = updatedBars.filter(bar => {
          const barRight = bar.x + (bar.width || 100);
          const barLeft = bar.x;
          const barId = bar.uniqueId || bar.id;
          
          // Remove if:
          // 1. Collected bars - immediate removal
          if (bar.collected && barRight < (birdLineX - 100)) {
            return false;
          }
          
          // 2. Completely off-screen to the left (more aggressive boundary)
          if (barRight < -50) {
            return false;
          }
          
          // 3. Invalid position (safety cleanup)
          if (barLeft < -300 || isNaN(bar.x) || isNaN(bar.y)) {
            return false;
          }
          
          // 4. Duplicate bar IDs (prevent React key conflicts)
          if (activeBarIds.has(barId)) {
            return false;
          }
          
          // 5. Bars that have been on screen too long (prevent memory leaks)
          const barAge = Date.now() - (bar.spawnTime || Date.now());
          if (barAge > 30000) { // Remove bars older than 30 seconds
            return false;
          }
          
          activeBarIds.add(barId);
          return true;
        });
        
        return {
          bars: updatedBars,
          elapsedTime: currentTime
        };
      });
    }, 30);
  };

getSpawnInterval = (noteIndex: number): number => {
    // Calculate spawn interval based on the actual spacing between notes
    if (noteIndex === 0) {
      return 1000; // First note spawns after 1 second
    }
    
    // Get the time difference between current and previous note
    const currentNote = this.notes[noteIndex];
    const prevNote = this.notes[noteIndex - 1];
    
    if (!currentNote || !prevNote) {
      return 2000; // Default 2 seconds if note data is missing
    }
    
    // Calculate actual durations
    const currentDuration = currentNote.duration <= 10 ? (currentNote.duration * (60 / this.bpm)) : currentNote.duration;
    const prevDuration = prevNote.duration <= 10 ? (prevNote.duration * (60 / this.bpm)) : prevNote.duration;
    
    // Calculate time based on bar positions and movement speed
    const pixelsPerSecond = 150 + (this.bpm * 0.5);
    const baseWidthMultiplier = 60 + (this.bpm * 0.5);
    const prevBarWidth = Math.max(prevDuration * baseWidthMultiplier, 60);
    const barTimeInSeconds = prevBarWidth / pixelsPerSecond;
    const minGapPixels = 15; // Reduced gap between spawned notes (was 150)
    const minGapTime = minGapPixels / pixelsPerSecond;
    
    // Total time is previous duration + gap time
    const totalTime = prevDuration + Math.max(minGapTime, barTimeInSeconds * 0.2);
    
    return Math.max(totalTime * 1000, 800); // Convert to milliseconds, minimum 800ms
  };

  spawnBars = (): void => {
    let nextBarIndex = 0;
    let currentCycleNumber = 0;
    
    const scheduleNextNote = () => {
      if (nextBarIndex < this.barPositions.length) {
        const barData = this.barPositions[nextBarIndex];
        
        this.setState(prevState => {
          const spawnTime = Date.now();
          const newBar: Bar = {
            ...barData,
            x: window.innerWidth,
            cycleNumber: currentCycleNumber,
            originalIndex: nextBarIndex,
            spawnTime: spawnTime,
            // Add unique identifier to prevent React key conflicts
            uniqueId: `${barData.id}_cycle_${currentCycleNumber}_${spawnTime}_${Math.random().toString(36).substring(2, 11)}`
          };
          
          return {
            bars: [...prevState.bars, newBar]
          };
        });
        
        nextBarIndex++;
        const nextInterval = this.getSpawnInterval(nextBarIndex);
        this.noteSpawnTimer = window.setTimeout(scheduleNextNote, nextInterval);
      } else {
        // Cycle completed, start over
        nextBarIndex = 0;
        currentCycleNumber++;
        
        // Update cycle information
        this.setState(_prevState => ({
          currentCycle: currentCycleNumber,
          notesPerCycle: this.notes.length
        }));
        
        console.log(`Starting cycle ${currentCycleNumber + 1}`);
        
        // Start next cycle after a brief pause
        this.noteSpawnTimer = window.setTimeout(scheduleNextNote, 2000);
      }
    };
    
    // Start the first note
    scheduleNextNote();
  };
  play = async (hz?: number, notes?: GameNote[]): Promise<void> => {
    if (this.state.gameState === 'playing') return;
    
    // Update BPM and notes if provided
    if (hz) {
      this.bpm = hz;
    }
    if (notes) {
      this.notes = notes;
      this.calculateBarPositions();
    }
    
    this.setState({
      gameState: 'playing',
      score: 0,
      bars: [],
      runnerY: this.groundLevel - 60,
      runnerVelocity: 0,
      currentNoteIndex: 0,
      noteProgress: {},
      // Reset cycle tracking
      currentCycle: 0,
      cycleScores: [],
      averagePercentage: 0,
      notesPerCycle: this.notes.length
    });
    
    this.startGravity();
    this.startGameLoop();
    this.spawnBars();
  };

  pause = () => {
    if (this.state.gameState !== 'playing') return;
    
    this.setState({ gameState: 'paused' });
    
    if (this.gravityLoopId) window.clearInterval(this.gravityLoopId);
    if (this.gameLoopId) window.clearInterval(this.gameLoopId);
    if (this.noteSpawnTimer) window.clearTimeout(this.noteSpawnTimer);
  };

  resume = () => {
    if (this.state.gameState !== 'paused') return;
    
    this.setState({ gameState: 'playing' });
    
    this.startGravity();
    this.startGameLoop();
    this.spawnBars();
  };

  stop = () => {
    // Clear all intervals first to prevent new bars from spawning
    if (this.gravityLoopId) window.clearInterval(this.gravityLoopId);
    if (this.gameLoopId) window.clearInterval(this.gameLoopId);
    if (this.noteSpawnTimer) window.clearTimeout(this.noteSpawnTimer);
    
    // Stop pitch detection
    if (this.pitchDetector) {
      this.pitchDetector.stopListening();
    }
    
    // Force a state update to clear everything
    this.setState({
      gameState: 'stopped',
      finalScore: this.state.score,
      runnerY: this.groundLevel - 60,
      runnerVelocity: 0,
      bars: [], // Force clear all bars
      currentNoteIndex: 0,
      isJumping: false,
      voiceDetected: false
    });
  };

  restart = (): void => {
    // Clear all intervals first
    if (this.gravityLoopId) window.clearInterval(this.gravityLoopId);
    if (this.gameLoopId) window.clearInterval(this.gameLoopId);
    if (this.noteSpawnTimer) window.clearTimeout(this.noteSpawnTimer);
    
    // Stop and restart pitch detection
    if (this.pitchDetector) {
      this.pitchDetector.stopListening();
    }
    
    // Initialize microphone for new session
    setTimeout(() => {
      this.initializeMicrophone();
    }, 100);
    
    // Force complete reset
    this.setState({
      gameState: 'idle',
      score: 0,
      finalScore: 0,
      runnerY: this.groundLevel - 60,
      runnerVelocity: 0,
      bars: [], // Force clear all bars
      currentNoteIndex: 0,
      isJumping: false,
      voiceDetected: false,
      currentFrequency: 0,
      noteProgress: {},
      elapsedTime: 0,
      // Reset cycle tracking
      currentCycle: 0,
      cycleScores: [],
      averagePercentage: 0,
      notesPerCycle: 0
    });
  };

  stopWithScore = (): void => {
    this.stop();
    this.displayScore();
  };

  displayScore = () => {
    const { score } = this.state;
    const maxPossibleScore = this.notes.length * 10 * this.modeSettings[this.mode].scoreMultiplier;
    const percentage = ((score / maxPossibleScore) * 100).toFixed(1);
    
    return {
      score,
      maxPossibleScore,
      percentage,
      mode: this.mode,
      gameId: this.gameId
    };
  };

  getGameState = () => {
    // Return the note currently at the bird line (like blue line reference)
    const currentNote = this.state.currentNoteIndex < this.notes.length ? 
      this.notes[this.state.currentNoteIndex] : null;
      
    return {
      state: this.state.gameState,
      score: this.state.score,
      currentNote: currentNote,
      progress: (this.state.currentNoteIndex / this.notes.length) * 100,
      // Additional info about the active note at bird line
      activeNoteAtBirdLine: currentNote
    };
  };

  render(): React.JSX.Element {
    const { 
      runnerY, 
      bars, 
      score, 
      gameState, 
      voiceDetected, 
      currentFrequency,
      isJumping,
      finalScore
    } = this.state;

    const capitalizedMode = this.mode.charAt(0).toUpperCase() + this.mode.slice(1);
        const screenWidth = window.innerWidth;
    let runnerXPercentage = 0.40; // 40% by default (moved right)
    
    if (screenWidth <= 480) {
      runnerXPercentage = 0.30; // 30% on mobile (moved right)
    } else if (screenWidth <= 768) {
      runnerXPercentage = 0.35; // 35% on tablet (moved right)
    }
        const birdWidth = 35; // Bird width from CSS (reduced from 50)
    const runnerLeftEdge = screenWidth * runnerXPercentage; // Left edge position from CSS
    const birdLineX = runnerLeftEdge + (birdWidth / 2); // Center position for bird line

    return (
      <div 
        className={`duck-voice-game-sdk ${gameState === 'playing' ? 'playing' : ''}`}
        style={{
          backgroundImage: `url(${backgroundImage}), linear-gradient(to bottom, #87CEEB 0%, #98FB98 100%)`
        }}
      >
        <div className="game-area">
          <div className="ground-line" style={{ top: this.groundLevel }} />
          
          <div 
            className={`runner ${isJumping ? 'jumping' : 'running'}`}
            style={{ top: runnerY }}
          >
            {(() => {
              const duckProps = this.getDuckImageAndStyle(currentFrequency);
              return (
                <img 
                  src={duckProps.src}
                  alt={duckProps.alt}
                  className={duckProps.className}
              style={{ 
                width: '35px',
                height: '35px',
                objectFit: 'contain'
              }}
                />
              );
            })()}
            <span className="bird-fallback" style={{display: 'none'}}>🦆</span>
          </div>
          
          {bars.map(bar => {
            // Ensure unique keys and prevent rendering invalid bars
            if (!bar || isNaN(bar.x) || isNaN(bar.y) || bar.collected) {
              return null;
            }
            
            const barKey = bar.uniqueId || `bar_${bar.id}_${bar.spawnTime || Date.now()}`;
            
            // Calculate contact progress for visual feedback
            const contactPercentage = bar.totalContactTime && bar.duration 
              ? Math.min((bar.totalContactTime / bar.duration) * 100, 100) 
              : 0;
            const requiredPercentage = this.modeSettings[this.mode].threshold * 100;
            
            // Determine bar color based on contact percentage
            const barLeft = bar.x;
            const barRight = bar.x + (bar.width || 100);
            const orangeTriggerOffset = -500; // only 5px gap from bird (reduced from -30px)
            const adjustedBirdLineX = birdLineX ;
            const isAtBirdLine = barLeft <= adjustedBirdLineX && barRight >= birdLineX;
            let barColor = '#2196F3'; // Default blue color for untouched
            let borderColor = '#1976D2';
            
            if (bar.contactStartTime || contactPercentage > 0) {
              if (contactPercentage < 75) {
                barColor = '#F44336'; // Red for < 75%
                borderColor = '#D32F2F';
              } else if (contactPercentage < 85) {
                barColor = '#FF9800'; // Orange for 75-85%
                borderColor = '#F57C00';
              } else if (contactPercentage < 90) {
                barColor = '#FFEB3B'; // Yellow for 85-90%
                borderColor = '#FBC02D';
              } else {
                barColor = '#4CAF50'; // Green for > 90%
                borderColor = '#388E3C';
              }
            }
            
            // Apply opacity when bird is actively touching
            const isCurrentlyTouching = bar.contactStartTime && !bar.collected;
            const opacity = isCurrentlyTouching ? 0.7 : 1.0;
            
            return (
              <div
                key={barKey}
                className="horizontal-bar"
                style={{
                  left: Math.round(bar.x), // Round to prevent sub-pixel rendering
                  top: Math.round(bar.y),
                  width: Math.round(bar.width || 100),
                  backgroundColor: barColor,
                  borderColor: borderColor,
                  opacity: opacity,
                  // Force hardware acceleration to prevent sticking
                  transform: 'translate3d(0,0,0)',
                  willChange: 'transform',
                  transition: 'background-color 0.2s ease, opacity 0.1s ease, border-color 0.2s ease'
                }}
              >
                <span className="note-label" style={{ fontWeight: 'bold' }}>{bar.note}</span>
                
                {/* Progress indicator - Shows exact percentage */}
                {bar.contactStartTime && contactPercentage > 0 && (
                  <div 
                    className="contact-progress"
                    style={{
                      position: 'absolute',
                      bottom: '0',
                      left: '0',
                      height: '100%',
                      width: `${contactPercentage}%`,
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                      transition: 'width 0.1s ease-out',
                      pointerEvents: 'none'
                    }}
                  />
                )}
                
                {/* Percentage display when touching */}
                {bar.contactStartTime && contactPercentage > 0 && (
                  <div 
                    className="percentage-display"
                    style={{
                      position: 'absolute',
                      top: '-20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: barColor,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      border: `1px solid ${borderColor}`,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {contactPercentage.toFixed(0)}%
                  </div>
                )}
                
                {/* Threshold indicator */}
                <div 
                  className="threshold-marker"
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: `${requiredPercentage}%`,
                    width: '2px',
                    height: '8px',
                    backgroundColor: '#F44336',
                    opacity: 0.7
                  }}
                />
              </div>
            );
          }).filter(Boolean)}
          
          <div className="game-ui">
            <div className="score-display">
              Mode: {capitalizedMode} | Cycle: {this.state.currentCycle + 1} | Score: {score}
            </div>
            
            {this.state.averagePercentage > 0 && (
              <div className="average-display">
                Average: {this.state.averagePercentage.toFixed(1)}% | Cycles: {this.state.cycleScores.length}
              </div>
            )}

            
            {gameState === 'stopped' && finalScore > 0 && (
              <div className="final-score">
                Final Score: {finalScore}
              </div>
            )}
          </div>
          
          {gameState === 'paused' && (
            <div className="pause-popup-overlay">
              <div className="pause-popup">
                <h2>Game Paused</h2>
                <div className="pause-score">
                  <div className="current-score">Current Score: {score}</div>
                  <div className="mode-info">Mode: {capitalizedMode}</div>
                </div>
                <button onClick={this.resume} className="continue-button">
                  ▶️ Continue
                </button>
              </div>
            </div>
          )}
          
          {gameState === 'stopped'  && finalScore > 0 && (
            <div className="stop-popup-overlay">
              <div className="stop-popup">
                <h2>Game Over</h2>
                <div className="final-score-display">
                  <div className="overall-score">Final Score: {finalScore}</div>
                  <div className="mode-info">Mode: {capitalizedMode}</div>
                  <div className="score-summary">
                    {this.notes.length > 0 && (
                      <div className="completion-rate">
                        Completion: {((finalScore / (this.notes.length * 10 * this.modeSettings[this.mode].scoreMultiplier)) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={this.restart} className="restart-button">
                  🔄 Restart
                </button>
              </div>
            </div>
          )}
          
          <div className="control-panel" style={{ display: 'none' }}>
            <button onClick={() => this.play()} disabled={gameState === 'playing'}>
              ▶️ Play
            </button>
            <button onClick={this.pause} disabled={gameState !== 'playing'}>
              ⏸️ Pause
            </button>
            <button onClick={this.stop}>
              ⏹️ Stop
            </button>
            <button onClick={this.restart}>
              🔄 Restart
            </button>
            <button 
              style={{ 
                backgroundColor: this.state.harmonicsEnabled ? '#4CAF50' : '#f44336',
                color: 'white',
                marginLeft: '10px'
              }}
            >
              🎵 Harmonics: {this.state.harmonicsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          
        </div>
      </div>
    );
  }
}

const DuckVoiceGameSDK = forwardRef<DuckVoiceGameSDKComponent, DuckVoiceGameSDKProps>((props, ref) => {
  return <DuckVoiceGameSDKComponent ref={ref as any} {...props} />;
});


export default DuckVoiceGameSDK;