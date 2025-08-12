import { NOTE_FREQUENCIES } from '../constants/notes';

export class PitchDetector {
  private audioContext: AudioContext;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private bufferLength: number = 2048;
  private buffer: Float32Array;
  private frequencyBuffer: Uint8Array;
  private isListening: boolean = false;
  private animationId: number | null = null;
  
  // Voice frequency range constants
  private readonly VOICE_MIN_FREQ = 70;    // Lowest human voice frequency
  private readonly VOICE_MAX_FREQ = 1100;  // Highest human voice frequency
  private readonly VOICE_SWEET_SPOT_MIN = 85;  // Most common voice range start
  private readonly VOICE_SWEET_SPOT_MAX = 800; // Most common voice range end

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.buffer = new Float32Array(this.bufferLength);
    this.frequencyBuffer = new Uint8Array(this.bufferLength);
  }

  private isVoiceFrequency(frequency: number, frequencyData: Uint8Array): boolean {
    // First check if frequency is in human voice range
    if (frequency < this.VOICE_MIN_FREQ || frequency > this.VOICE_MAX_FREQ) {
      return false;
    }
    
    // Boost confidence for frequencies in the sweet spot
    const isInSweetSpot = frequency >= this.VOICE_SWEET_SPOT_MIN && frequency <= this.VOICE_SWEET_SPOT_MAX;
    
    // Analyze spectral characteristics typical of human voice
    const sampleRate = this.audioContext.sampleRate;
    const fftSize = frequencyData.length;
    const freqBinSize = sampleRate / (fftSize * 2);
    
    const fundamentalBin = Math.round(frequency / freqBinSize);
    const harmonic2Bin = Math.round((frequency * 2) / freqBinSize);
    const harmonic3Bin = Math.round((frequency * 3) / freqBinSize);
    
    if (fundamentalBin >= fftSize || harmonic2Bin >= fftSize) return isInSweetSpot;
    
    // Check for harmonic structure typical of voice
    // Convert Uint8Array values to normalized float values (0-255 to 0-1)
    const fundamentalMag = frequencyData[fundamentalBin] / 255.0;
    const harmonic2Mag = harmonic2Bin < fftSize ? frequencyData[harmonic2Bin] / 255.0 : 0;
    const harmonic3Mag = harmonic3Bin < fftSize ? frequencyData[harmonic3Bin] / 255.0 : 0;
    
    // Voice typically has strong fundamental with decreasing harmonics
    // Guitar harmonics often have more complex/irregular patterns
    const hasVoicePattern = (
      fundamentalMag > 0.1 && // Strong fundamental
      (harmonic2Mag < fundamentalMag * 0.8) && // Second harmonic weaker
      (harmonic3Mag < fundamentalMag * 0.6)   // Third harmonic even weaker
    );
    
    // Additional check for formant frequencies (characteristic of voice)
    // Human voice has formants around 500-3000Hz range
    let formantEnergy = 0;
    const formantStart = Math.round(500 / freqBinSize);
    const formantEnd = Math.round(2500 / freqBinSize);
    
    for (let i = formantStart; i < Math.min(formantEnd, fftSize); i++) {
      formantEnergy += frequencyData[i] / 255.0; // Normalize Uint8Array values
    }
    
    const avgFormantEnergy = formantEnergy / (formantEnd - formantStart);
    const hasFormantActivity = avgFormantEnergy > 0.05; // Threshold for formant presence
    
    // Guitar typically lacks strong formant structure in voice range
    const confidenceScore = (
      (hasVoicePattern ? 0.4 : 0) +
      (isInSweetSpot ? 0.3 : 0) +
      (hasFormantActivity ? 0.3 : 0)
    );
    
    return confidenceScore >= 0.5;
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
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          // Additional constraints to optimize for voice
          sampleRate: 44100,
          channelCount: 1, // Mono for better voice focus
          volume: 1.0,
          // Some browsers support these additional voice optimizations
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true
        } as any // Type assertion for extended properties
      });

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.mediaStreamSource.connect(this.analyser);
      this.isListening = true;

      const updatePitch = () => {
        if (!this.isListening || !this.analyser) return;

        // Get both time domain and frequency domain data
        this.analyser.getFloatTimeDomainData(this.buffer);
        this.analyser.getByteFrequencyData(this.frequencyBuffer);
        
        // Check if we're getting audio data
        let maxVal = 0;
        for (let i = 0; i < this.buffer.length; i++) {
          if (Math.abs(this.buffer[i]) > maxVal) {
            maxVal = Math.abs(this.buffer[i]);
          }
        }

        const frequency = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

        const pitchData: PitchData = {
          frequency: 0,
          note: null,
          noteString: null,
          cents: null,
          buffer: this.buffer.slice()
        };

        // Only proceed if we detect a valid frequency and it's likely a voice
        if (frequency > 0 && this.isVoiceFrequency(frequency, this.frequencyBuffer)) {
          const closestNoteData = this.findClosestNote(frequency);
          if (closestNoteData) {
            pitchData.frequency = frequency;
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