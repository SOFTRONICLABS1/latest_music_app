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

  private autoCorrelate(buf: Float32Array, sampleRate: number): number {
    const SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

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

    const c = new Array(newSize).fill(0);
    for (let i = 0; i < newSize; i++) {
      for (let j = 0; j < newSize - i; j++) {
        c[i] = c[i] + slicedBuf[j] * slicedBuf[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < newSize; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;

    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
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

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.mediaStreamSource.connect(this.analyser);
      this.isListening = true;

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

        const frequency = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

        const pitchData: PitchData = {
          frequency: frequency > 0 ? frequency : 0,
          note: null,
          noteString: null,
          cents: null,
          buffer: this.buffer.slice()
        };

        if (frequency > 0) {
          const closestNoteData = this.findClosestNote(frequency);
          if (closestNoteData) {
            pitchData.note = null; // We don't use note number anymore
            pitchData.noteString = closestNoteData.note; // This is the full note name with octave
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
  }
}

export interface PitchData {
  frequency: number;
  note: number | null;
  noteString: string | null;
  cents: number | null;
  buffer: Float32Array;
}