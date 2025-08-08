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

  noteFromPitch(frequency: number): number {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  }

  frequencyFromNoteNumber(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  centsOffFromPitch(frequency: number, note: number): number {
    return Math.floor(1200 * Math.log(frequency / this.frequencyFromNoteNumber(note)) / Math.log(2));
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

        const frequency = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

        const pitchData: PitchData = {
          frequency: frequency > 0 ? frequency : 0,
          note: null,
          noteString: null,
          cents: null,
          buffer: this.buffer.slice()
        };

        if (frequency > 0) {
          console.log('Detected frequency:', frequency);
          const noteNumber = this.noteFromPitch(frequency);
          const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
          pitchData.note = noteNumber;
          pitchData.noteString = noteStrings[noteNumber % 12];
          pitchData.cents = this.centsOffFromPitch(frequency, noteNumber);
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
    console.log('Stopped listening');
  }
}

export interface PitchData {
  frequency: number;
  note: number | null;
  noteString: string | null;
  cents: number | null;
  buffer: Float32Array;
}