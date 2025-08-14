import { NOTE_FREQUENCIES } from '../constants/notes';

export class PitchDetector {
  private audioContext: AudioContext;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private bufferLength: number = 2048;
  private buffer: Float32Array;
  private isListening: boolean = false;
  private animationId: number | null = null;
  private frequencyHistory: number[] = [];
  private readonly HISTORY_SIZE = 5;
  private readonly MIN_RMS = 0.02;
  private readonly MIN_CLARITY = 0.9;
  private lastDetectionTime: number = 0;
  private readonly PAUSE_THRESHOLD = 1000;

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

  private autoCorrelate(buf: Float32Array, sampleRate: number): { frequency: number, clarity: number } {
    const SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < this.MIN_RMS) return { frequency: -1, clarity: 0 };

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const slicedBuf = buf.slice(r1, r2);
    const newSize = slicedBuf.length;
    if (newSize < 100) return { frequency: -1, clarity: 0 };

    const c = new Array(newSize).fill(0);
    for (let i = 0; i < newSize; i++) {
      for (let j = 0; j < newSize - i; j++) {
        c[i] = c[i] + slicedBuf[j] * slicedBuf[j + i];
      }
    }

    let d = 0;
    while (d < newSize - 1 && c[d] > c[d + 1]) d++;
    
    let maxval = -1, maxpos = -1;
    const minPeriod = Math.floor(sampleRate / 1000);
    const maxPeriod = Math.floor(sampleRate / 80);
    
    for (let i = Math.max(d, minPeriod); i < Math.min(newSize, maxPeriod); i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    
    if (maxpos === -1 || maxval <= 0) return { frequency: -1, clarity: 0 };
    
    const clarity = maxval / c[0];
    if (clarity < this.MIN_CLARITY) return { frequency: -1, clarity };

    let T0 = maxpos;

    if (T0 > 0 && T0 < newSize - 1) {
      const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a !== 0) T0 = T0 - b / (2 * a);
    }

    const frequency = sampleRate / T0;
    return { frequency: this.correctOctaveError(frequency), clarity };
  }

  private correctOctaveError(frequency: number): number {
    if (this.frequencyHistory.length < 3) return frequency;
    
    const recentFreq = this.getSmoothedFrequency();
    const ratio = frequency / recentFreq;
    
    if (ratio > 1.8 && ratio < 2.2) return frequency / 2;
    if (ratio > 0.45 && ratio < 0.55) return frequency * 2;
    if (ratio > 2.8 && ratio < 3.2) return frequency / 3;
    if (ratio > 0.3 && ratio < 0.35) return frequency * 3;
    
    return frequency;
  }

  private smoothFrequency(frequency: number): number {
    this.frequencyHistory.push(frequency);
    if (this.frequencyHistory.length > this.HISTORY_SIZE) {
      this.frequencyHistory.shift();
    }
    
    if (this.frequencyHistory.length === 1) {
      return frequency;
    }
    
    if (this.frequencyHistory.length < 3) {
      return (this.frequencyHistory.reduce((sum, f) => sum + f, 0) / this.frequencyHistory.length);
    }
    
    return this.getSmoothedFrequency();
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
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      console.log('Microphone stream obtained');

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
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

        const result = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);
        let frequency = result.frequency;
        const clarity = result.clarity;
        const currentTime = Date.now();

        if (frequency > 0) {
          const timeSinceLastDetection = currentTime - this.lastDetectionTime;
          
          if (timeSinceLastDetection > this.PAUSE_THRESHOLD) {
            this.frequencyHistory = [];
            console.log('Pause detected, cleared frequency history');
          }
          
          frequency = this.smoothFrequency(frequency);
          this.lastDetectionTime = currentTime;
        }

        const pitchData: PitchData = {
          frequency: frequency > 0 ? frequency : 0,
          note: null,
          noteString: null,
          cents: null,
          buffer: new Float32Array(this.buffer),
          clarity: clarity
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
}