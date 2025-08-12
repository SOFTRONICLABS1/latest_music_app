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
      runnerY: this.groundLevel - 60,
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
        runnerY: Math.min(prevState.runnerY, this.groundLevel - 60)
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
      const minGapPixels = 10; // Minimum gap in pixels between notes
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
    
    const runnerX = screenWidth * runnerXPercentage; // Use exact percentage position from CSS
    
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
        
        // More precise collision detection - bird must be properly inside the note
        const birdWidth = 50; // Bird width
        const birdHeight = 50; // Bird height
        const birdLeft = runnerX - (birdWidth / 2);
        const birdRight = runnerX + (birdWidth / 2);
        const birdTop = runnerTop;
        const birdBottom = runnerBottom;
        
        // Check for actual overlap (not just edge touching)
        const horizontalOverlap = birdRight > barLeft && birdLeft < barRight;
        const verticalOverlap = birdBottom > barTop && birdTop < barBottom;
        
        // Additional check: ensure significant overlap (at least 20 pixels in each direction)
        const horizontalOverlapAmount = Math.min(birdRight, barRight) - Math.max(birdLeft, barLeft);
        const verticalOverlapAmount = Math.min(birdBottom, barBottom) - Math.max(birdTop, barTop);
        const significantOverlap = horizontalOverlapAmount >= 20 && verticalOverlapAmount >= 15;
        
        if (horizontalOverlap && verticalOverlap && significantOverlap) {
          // More forgiving frequency matching
          const frequencyTolerance = 80; // Fixed tolerance
          const frequencyDifference = Math.abs(frequency - bar.frequency);
          const frequencyMatch = frequencyDifference < frequencyTolerance;
          const closeMatch = frequencyDifference < (frequencyTolerance * 1.5); // Within 120Hz
          
          // Only start progress if bird is touching AND singing the right frequency
          if (frequencyMatch && prevState.voiceDetected && frequency > 20) {
            // Initialize contact tracking if not already started
            if (!bar.contactStartTime) {
              bar.contactStartTime = currentTime;
              bar.totalContactTime = 0;
              
              // Play harmonic feedback when user starts touching the note correctly
              if (this.soundSynthesis && prevState.harmonicsEnabled) {
                console.log('Playing contact tone for:', bar.frequency, 'Hz');
                this.soundSynthesis.playTone(bar.frequency, 0.15, 'sine');
              }
            }
            
            // Update contact time
            bar.totalContactTime = currentTime - bar.contactStartTime;
            
            // Calculate contact percentage based on note duration
            const noteDurationMs = bar.duration; // Duration should be in ms
            const contactPercentage = bar.totalContactTime / noteDurationMs;
            
            // Award points if threshold is met and not already collected
            if (contactPercentage >= requiredThreshold && !bar.collected) {
              scoreGained += 10 * this.modeSettings[this.mode].scoreMultiplier;
              
              // Play success harmonic chord when note is completed
              if (this.soundSynthesis && prevState.harmonicsEnabled) {
                this.soundSynthesis.playChord(bar.frequency, 0.6);
              }
              
              return { ...bar, collected: true };
            }
            
            return bar; // Still in contact, continue tracking
          } else if (closeMatch && prevState.voiceDetected && frequency > 20) {
            // Close but not exact match - provide guidance tone (softer feedback)
            if (this.soundSynthesis && prevState.harmonicsEnabled && !bar.contactStartTime) {
              // Play a softer guidance tone to help user find the right pitch
              this.soundSynthesis.playTone(bar.frequency, 0.1, 'triangle');
            }
            // Wrong frequency - reset contact time but keep some feedback
            return { ...bar, contactStartTime: null, totalContactTime: 0 };
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

  startGravity = (): void => {
    this.gravityLoopId = window.setInterval(() => {
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

  startGameLoop = (): void => {
    const startTime = Date.now();
    
    this.gameLoopId = window.setInterval(() => {
      const currentTime = Date.now() - startTime;
      
      this.setState(prevState => {
        // Calculate bird line position for harmonic detection
        const screenWidth = window.innerWidth;
        let runnerXPercentage = 0.30; // 30% by default
        
        if (screenWidth <= 480) {
          runnerXPercentage = 0.20; // 20% on mobile
        } else if (screenWidth <= 768) {
          runnerXPercentage = 0.25; // 25% on tablet
        }
        
        const birdLineX = screenWidth * runnerXPercentage; // Bird center line matching CSS position
        
        // Move bars and detect harmonic triggers
        // Calculate movement speed based on BPM
        const moveSpeed = 2 + (this.bpm / 60); // Base speed + BPM factor
        
        let updatedBars = prevState.bars.map(bar => {
          const newBar = {
            ...bar,
            x: bar.x - moveSpeed
          };
          
          // Check if bar just crossed the bird line (harmonic trigger)
          const barLeft = newBar.x;
          const barRight = newBar.x + (newBar.width || 100);
          const prevBarLeft = bar.x;
          const prevBarRight = bar.x + (bar.width || 100);
          
          // Detect crossing: bar was to the right of line, now crosses or passes it
          const wasPastLine = prevBarLeft > birdLineX;
          const nowCrossesLine = barLeft <= birdLineX && barRight >= birdLineX;
          const justPassedLine = prevBarRight > birdLineX && barRight < birdLineX;
          
          // When note reaches the bird line (like blue line in WaveformCanvas), it becomes "active"
          if ((wasPastLine && (nowCrossesLine || justPassedLine)) && !newBar.hasPlayedHarmonic) {
            // This note is now active at the bird line - play reference harmonic
            console.log('Note reached bird line:', newBar.note, newBar.frequency, 'Hz');
            console.log('SoundSynthesis exists:', !!this.soundSynthesis);
            console.log('Game playing:', prevState.gameState === 'playing');
            console.log('Harmonics enabled:', prevState.harmonicsEnabled);
            
            if (this.soundSynthesis && prevState.gameState === 'playing' && prevState.harmonicsEnabled) {
              console.log('Playing harmonic chord for:', newBar.frequency, 'Hz');
              this.soundSynthesis.playHarmonicChord(newBar.frequency, 0.8);
            }
            newBar.hasPlayedHarmonic = true;
            
            // Update current note index to track which note is at the bird line
            // This makes the bird act like the blue line reference
            if (newBar.originalIndex !== undefined && newBar.originalIndex !== prevState.currentNoteIndex) {
              // Note: We'll update currentNoteIndex in the state update below
            }
          }
          
          return newBar;
        });
        
        // More aggressive and comprehensive cleanup
        const activeBarIds = new Set<string>(); // Track unique bar IDs to prevent duplicates
        
        updatedBars = updatedBars.filter(bar => {
          const barRight = bar.x + (bar.width || 100);
          const barLeft = bar.x;
          const barId = bar.uniqueId || bar.id;
          
          // Remove if:
          // 1. Collected bars that have moved past the bird completely
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
        
        // Find the note currently at the bird line (like blue line in WaveformCanvas)
        let currentNoteAtBirdLine = prevState.currentNoteIndex;
        
        // Check which note is currently at the bird line
        updatedBars.forEach(bar => {
          const barLeft = bar.x;
          const barRight = bar.x + (bar.width || 100);
          
          // If this bar is crossing or at the bird line, it's the current active note
          if (barLeft <= birdLineX && barRight >= birdLineX && bar.originalIndex !== undefined) {
            currentNoteAtBirdLine = bar.originalIndex % this.notes.length;
          }
        });
        
        return {
          bars: updatedBars,
          elapsedTime: currentTime,
          currentNoteIndex: currentNoteAtBirdLine
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
    const minGapPixels = 150;
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
        
        // Schedule the next note with proper spacing
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
    
    // Resume audio context for harmonics
    if (this.soundSynthesis) {
      try {
        // Access the audioContext from SoundSynthesis and resume it
        const audioContext = (this.soundSynthesis as any).audioContext;
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('AudioContext resumed for harmonics');
        }
      } catch (error) {
        console.error('Failed to resume audio context:', error);
      }
    }
    
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

  pause = (): void => {
    if (this.state.gameState !== 'playing') return;
    
    this.setState({ gameState: 'paused' });
    
    if (this.gravityLoopId) window.clearInterval(this.gravityLoopId);
    if (this.gameLoopId) window.clearInterval(this.gameLoopId);
    if (this.noteSpawnTimer) window.clearTimeout(this.noteSpawnTimer);
  };

  resume = (): void => {
    if (this.state.gameState !== 'paused') return;
    
    this.setState({ gameState: 'playing' });
    
    this.startGravity();
    this.startGameLoop();
    this.spawnBars();
  };

  stop = (): void => {
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

  toggleHarmonics = async (): Promise<void> => {
    // Resume audio context if needed before testing
    if (this.soundSynthesis) {
      try {
        const audioContext = (this.soundSynthesis as any).audioContext;
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('AudioContext resumed for harmonics toggle');
        }
      } catch (error) {
        console.error('Failed to resume audio context:', error);
      }
    }
    
    this.setState(prevState => {
      const newHarmonicsState = !prevState.harmonicsEnabled;
      
      // Test harmonics when enabling
      if (newHarmonicsState && this.soundSynthesis) {
        console.log('Testing harmonics with 440Hz tone...');
        this.soundSynthesis.playTone(440, 0.3, 'sine'); // Test A4 note
      }
      
      return {
        harmonicsEnabled: newHarmonicsState
      };
    });
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

    // Calculate bird line position (same logic as in game loop)
    const screenWidth = window.innerWidth;
    let runnerXPercentage = 0.30; // 30% by default
    
    if (screenWidth <= 480) {
      runnerXPercentage = 0.20; // 20% on mobile
    } else if (screenWidth <= 768) {
      runnerXPercentage = 0.25; // 25% on tablet
    }
    
    const birdLineX = screenWidth * runnerXPercentage; // Bird center line matching CSS position

    return (
      <div 
        className={`duck-voice-game-sdk ${gameState === 'playing' ? 'playing' : ''}`}
        style={{
          backgroundImage: `url(${backgroundImage}), linear-gradient(to bottom, #87CEEB 0%, #98FB98 100%)`
        }}
      >
        <div className="game-area">
          <div className="ground-line" style={{ top: this.groundLevel }} />
          
          {/* Invisible harmonic trigger line at bird position */}
          <div 
            className="bird-harmonic-line"
            style={{
              position: 'absolute',
              left: birdLineX,
              top: 0,
              width: '2px',
              height: '100%',
              backgroundColor: 'transparent', // Invisible to users
              pointerEvents: 'none',
              zIndex: 1
            }}
          />
          
          <div 
            className={`runner ${isJumping ? 'jumping' : 'running'}`}
            style={{ top: runnerY }}
          >
            <img 
              src={flappyBirdImage}
              alt="Flappy Bird"
              className="bird-image"
              style={{ 
                width: '50px',
                height: '50px',
                objectFit: 'contain'
              }}
            />
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
            
            // Check if this note is currently at the bird line (active note)
            const barLeft = bar.x;
            const barRight = bar.x + (bar.width || 100);
            const isAtBirdLine = barLeft <= birdLineX && barRight >= birdLineX;
            
            // Determine bar color based on contact percentage and completion status
            let barColor = '#2196F3'; // Default blue color for untouched
            let borderColor = '#1976D2';
            
            if (bar.collected) {
              // Completed notes are bright green
              barColor = '#4CAF50'; // Bright green for completed
              borderColor = '#2E7D32';
            } else if (isAtBirdLine && !bar.contactStartTime) {
              // Note is at bird line (active) but not being touched - orange highlight
              barColor = '#FF9800'; // Orange for active note at bird line
              borderColor = '#F57C00';
            } else if (bar.contactStartTime || contactPercentage > 0) {
              if (contactPercentage < 75) {
                barColor = '#F44336'; // Red for < 75%
                borderColor = '#D32F2F';
              } else if (contactPercentage < 85) {
                barColor = '#FF9800'; // Orange for 75-85%
                borderColor = '#F57C00';
              } else if (contactPercentage < 90) {
                barColor = '#FFEB3B'; // Yellow for 85-90%
                borderColor = '#FBC02D';
              } else if (contactPercentage >= requiredPercentage) {
                barColor = '#8BC34A'; // Light green for meeting threshold but not completed
                borderColor = '#689F38';
              } else {
                barColor = '#4CAF50'; // Green for > 90%
                borderColor = '#388E3C';
              }
            }
            
            // Apply visual effects based on state
            const isCurrentlyTouching = bar.contactStartTime && !bar.collected;
            const opacity = bar.collected ? 1.0 : (isCurrentlyTouching ? 0.7 : 1.0);
            let boxShadow = bar.collected ? '0 0 10px rgba(76, 175, 80, 0.6)' : 'none';
            
            // Add pulse effect for active note at bird line (like blue line in WaveformCanvas)
            if (isAtBirdLine && !bar.collected && !bar.contactStartTime) {
              boxShadow = '0 0 15px rgba(255, 152, 0, 0.8)'; // Orange glow for active note
            }
            
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
                  boxShadow: boxShadow,
                  // Force hardware acceleration to prevent sticking
                  transform: 'translate3d(0,0,0)',
                  willChange: 'transform',
                  transition: 'background-color 0.2s ease, opacity 0.1s ease, border-color 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                <span className="note-label" style={{ fontWeight: 'bold' }}>{bar.note}</span>
                
                {/* Progress indicator - Shows exact percentage only when actively touching */}
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
                
                {/* Percentage display when actively touching */}
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
            
            {/* <div className={`voice-indicator ${voiceDetected ? 'active' : ''}`}>
              🎵 {voiceDetected ? `${currentFrequency.toFixed(0)}Hz` : 'Sing to jump'}
            </div> */}
            
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
          
          {gameState === 'stopped' && finalScore > 0 && (
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
          
          {/* Control panel moved to header - keeping this hidden */}
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
              onClick={this.toggleHarmonics}
              style={{ 
                backgroundColor: this.state.harmonicsEnabled ? '#4CAF50' : '#f44336',
                color: 'white',
                marginLeft: '10px'
              }}
            >
              🎵 Harmonics: {this.state.harmonicsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          
          <div className="color-legend">
            <div className="legend-title">Note Colors:</div>
            <div className="legend-items">
              <div className="legend-item">
                <span className="color-box" style={{ backgroundColor: '#F44336' }}></span>
                <span>&lt; 75%</span>
              </div>
              <div className="legend-item">
                <span className="color-box" style={{ backgroundColor: '#FF9800' }}></span>
                <span>75-85%</span>
              </div>
              <div className="legend-item">
                <span className="color-box" style={{ backgroundColor: '#FFEB3B' }}></span>
                <span>85-90%</span>
              </div>
              <div className="legend-item">
                <span className="color-box" style={{ backgroundColor: '#4CAF50' }}></span>
                <span>&gt; 90%</span>
              </div>
            </div>
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