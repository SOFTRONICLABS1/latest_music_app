import { NOTE_FREQUENCIES } from '../constants/notes';
import { PitchDetector as Pitchy } from 'pitchy';

export class PitchDetector {
  private audioContext: AudioContext;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private bufferLength: number = 4096; // Larger buffer for better accuracy
  private buffer: Float32Array;
  private isListening: boolean = false;
  private animationId: number | null = null;
  private frequencyHistory: number[] = [];
  private confidenceHistory: number[] = [];
  private readonly HISTORY_SIZE = 8; // Increased for smoother interpolation
  private lastDetectionTime: number = 0;
  private readonly PAUSE_THRESHOLD = 500; // Reduced for faster response
  private pitchy: Pitchy<Float32Array> | null = null;
  private interpolatedFrequency: number = 0;
  private lastConfidentFrequency: number = 0;
  private wasGap: boolean = false;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.buffer = new Float32Array(this.bufferLength);
  }

  findClosestNote(frequency: number): { note: string, cents: number, noteFrequency: number } | null {
    if (frequency <= 0) return null;
    
    let closestNote = '';
    let closestFrequency = 0;
    let minDifference = Infinity;
    
    // Find the closest note from NOTE_FREQUENCIES
    for (const [note, noteFreq] of Object.entries(NOTE_FREQUENCIES)) {
      const difference = Math.abs(frequency - noteFreq);
      if (difference < minDifference) {
        minDifference = difference;
        closestNote = note;
        closestFrequency = noteFreq;
      }
    }
    
    if (!closestNote) return null;
    
    // Calculate cents difference
    const cents = Math.round(1200 * Math.log2(frequency / closestFrequency));
    
    return {
      note: closestNote,
      cents: cents,
      noteFrequency: closestFrequency
    };
  }

  private detectPitch(buf: Float32Array, sampleRate: number): { frequency: number, clarity: number } {
    // Initialize Pitchy detector if not already done
    if (!this.pitchy) {
      // Create Pitchy instance for Float32Array with buffer length
      this.pitchy = Pitchy.forFloat32Array(buf.length);
      // Professional-grade parameters for maximum accuracy
      this.pitchy.clarityThreshold = 0.85; // Higher threshold for accuracy
      this.pitchy.minVolumeDecibels = -40; // More sensitive volume detection
      this.pitchy.maxInputAmplitude = 1.0; // Normalized amplitude
    }

    try {
      // Use Pitchy's McLeod Pitch Method (MPM)
      const [frequency, clarity] = this.pitchy.findPitch(buf, sampleRate);
      
      // More sophisticated confidence evaluation
      if (frequency > 0) {
        // Check if frequency is in musical range (human vocal range + instruments)
        const isMusicalRange = frequency >= 50 && frequency <= 2000;
        
        // Adaptive clarity threshold based on frequency range
        const adaptiveThreshold = frequency < 200 ? 0.75 : 0.85; // Lower notes can be harder to detect
        
        if (clarity >= adaptiveThreshold && isMusicalRange) {
          return { frequency, clarity };
        }
      }
      
      return { frequency: -1, clarity: clarity || 0 };
    } catch (error) {
      console.warn('Pitchy detection error:', error);
      return { frequency: -1, clarity: 0 };
    }
  }

  private correctOctaveError(frequency: number): number {
    if (this.frequencyHistory.length < 3) return frequency;
    
    const recentFreq = this.getSmoothedFrequency();
    const ratio = frequency / recentFreq;
    
    // Only apply octave correction for very obvious errors (tighter bounds)
    // And only if the change is sudden (not gradual transitions)
    const isGradualTransition = this.isGradualTransition(frequency);
    
    if (!isGradualTransition) {
      // Very tight bounds for octave error correction
      if (ratio > 1.95 && ratio < 2.05) return frequency / 2;  // Exact 2x
      if (ratio > 0.495 && ratio < 0.505) return frequency * 2; // Exact 0.5x
      if (ratio > 2.95 && ratio < 3.05) return frequency / 3;  // Exact 3x
      if (ratio > 0.33 && ratio < 0.34) return frequency * 3;  // Exact 1/3x
    }
    
    return frequency;
  }

  private isGradualTransition(_frequency: number): boolean {
    if (this.frequencyHistory.length < 3) return true;
    
    // Check if the last few frequencies show a gradual trend
    const recent = this.frequencyHistory.slice(-3);
    
    // Calculate if there's a consistent direction of change
    const changes = [];
    for (let i = 1; i < recent.length; i++) {
      changes.push(recent[i] - recent[i-1]);
    }
    
    // If all changes are in the same direction and reasonably sized, it's gradual
    const allPositive = changes.every(change => change > 0);
    const allNegative = changes.every(change => change < 0);
    const maxChange = Math.max(...changes.map(Math.abs));
    
    return (allPositive || allNegative) && maxChange < 200; // 200Hz max per frame
  }

  private processFrequency(frequency: number, clarity: number): number {
    // Store frequency and confidence data
    this.frequencyHistory.push(frequency);
    this.confidenceHistory.push(clarity);
    
    if (this.frequencyHistory.length > this.HISTORY_SIZE) {
      this.frequencyHistory.shift();
      this.confidenceHistory.shift();
    }
    
    // High-confidence frequencies get immediate response
    if (clarity >= 0.9) {
      this.lastConfidentFrequency = frequency;
      this.interpolatedFrequency = frequency;
      return frequency;
    }
    
    // For lower confidence, use confidence-weighted interpolation
    if (this.frequencyHistory.length >= 3) {
      return this.getConfidenceWeightedFrequency();
    }
    
    // Fallback to current frequency for initial detections
    return frequency;
  }

  private getConfidenceWeightedFrequency(): number {
    if (this.frequencyHistory.length === 0) return this.interpolatedFrequency;
    
    // Calculate weighted average based on confidence scores
    let weightedSum = 0;
    let totalWeight = 0;
    
    // Recent samples get higher weight
    for (let i = 0; i < this.frequencyHistory.length; i++) {
      const recencyWeight = (i + 1) / this.frequencyHistory.length; // 0.125 to 1.0
      const confidenceWeight = Math.pow(this.confidenceHistory[i], 2); // Square for emphasis
      const combinedWeight = recencyWeight * confidenceWeight;
      
      weightedSum += this.frequencyHistory[i] * combinedWeight;
      totalWeight += combinedWeight;
    }
    
    if (totalWeight === 0) return this.lastConfidentFrequency;
    
    const result = weightedSum / totalWeight;
    
    // Smooth interpolation toward the target
    this.interpolatedFrequency = this.interpolatedFrequency * 0.7 + result * 0.3;
    
    return this.interpolatedFrequency;
  }

  private getSmoothedFrequency(): number {
    if (this.frequencyHistory.length === 0) return 0;
    
    const sorted = [...this.frequencyHistory].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  async startListening(callback: (data: PitchData) => void): Promise<void> {
    try {
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          autoGainControl: false,
          noiseSuppression: true
        }
      });

      console.log('Microphone stream obtained');

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      // Professional-grade analyser settings
      this.analyser.fftSize = 8192; // Larger FFT for better frequency resolution
      this.analyser.smoothingTimeConstant = 0.3; // Less smoothing for real-time response
      this.analyser.minDecibels = -100; // Better dynamic range
      this.analyser.maxDecibels = -10;
      this.mediaStreamSource.connect(this.analyser);
      this.isListening = true;

      console.log('Audio analyser connected');

      const updatePitch = () => {
        if (!this.isListening || !this.analyser) return;

        this.analyser.getFloatTimeDomainData(this.buffer);
        
        // Check if we're getting audio data
        let maxVal = 0;
        for (let i = 0; i < this.buffer.length; i++) {
          if (Math.abs(this.buffer[i]) > maxVal) {
            maxVal = Math.abs(this.buffer[i]);
          }
        }
        
        if (maxVal > 0.01) {
          console.log('Audio signal detected, max amplitude:', maxVal);
        }

        // Calculate RMS for volume
        let rms = 0;
        for (let i = 0; i < this.buffer.length; i++) {
          const val = this.buffer[i];
          rms += val * val;
        }
        rms = Math.sqrt(rms / this.buffer.length);

        const result = this.detectPitch(this.buffer, this.audioContext.sampleRate);
        let frequency = result.frequency;
        const clarity = result.clarity;
        const currentTime = Date.now();

        // Check for gaps even when no frequency is detected
        const timeSinceLastDetection = currentTime - this.lastDetectionTime;
        const hadGap = timeSinceLastDetection > this.PAUSE_THRESHOLD;
        
        if (frequency > 0) {
          if (hadGap) {
            // Clear history and mark gap
            this.frequencyHistory = [];
            this.confidenceHistory = [];
            this.interpolatedFrequency = 0;
            this.wasGap = true;
            console.log('Gap detected, cleared frequency history');
          } else {
            this.wasGap = false;
          }
          
          // Use professional-grade confidence-weighted processing
          frequency = this.processFrequency(frequency, clarity);
          
          this.lastDetectionTime = currentTime;
        }

        const pitchData: PitchData = {
          frequency: frequency > 0 ? frequency : 0,
          note: null,
          noteString: null,
          cents: null,
          buffer: this.buffer.slice(),
          clarity: clarity,
          volume: rms,
          isAfterGap: this.wasGap && frequency > 0 // Mark if this is first detection after a gap
        };

        if (frequency > 0) {
          console.log('Detected frequency:', frequency, 'clarity:', clarity.toFixed(3));
          const closestNoteData = this.findClosestNote(frequency);
          if (closestNoteData) {
            pitchData.note = null;
            pitchData.noteString = closestNoteData.note;
            pitchData.cents = closestNoteData.cents;
          }
        }

        callback(pitchData);
        this.animationId = requestAnimationFrame(updatePitch);
      };

      updatePitch();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stopListening(): void {
    this.isListening = false;
    this.frequencyHistory = [];
    this.confidenceHistory = [];
    this.interpolatedFrequency = 0;
    this.lastConfidentFrequency = 0;
    this.wasGap = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    console.log('Stopped listening');
  }
}

export interface PitchData {
  frequency: number;
  note: number | null;
  noteString: string | null;
  cents: number | null;
  buffer: Float32Array;
  clarity: number;
  volume: number;
  isAfterGap: boolean; // Flag to indicate this is the first detection after a gap
}