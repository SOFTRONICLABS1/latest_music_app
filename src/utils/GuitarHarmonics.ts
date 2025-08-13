import { NOTE_FREQUENCIES } from '../constants/notes';

export class GuitarHarmonics {
  private audioContext: AudioContext;
  private currentOscillators: OscillatorNode[] = [];
  private currentGainNodes: GainNode[] = [];
  private masterGain: GainNode;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.2; // Soothing master volume
    this.masterGain.connect(this.audioContext.destination);
  }

  private createGuitarHarmonic(frequency: number, duration: number): void {
    const now = this.audioContext.currentTime;
    
    // Create multiple harmonics for soothing, melodic sound
    const harmonicRatios = [
      { ratio: 1, gain: 0.6 },     // Fundamental (stronger for melody)
      { ratio: 2, gain: 0.25 },    // Octave (softer)
      { ratio: 3, gain: 0.1 },     // Fifth above octave (subtle)
      { ratio: 4, gain: 0.05 },    // Two octaves (very soft)
      { ratio: 0.5, gain: 0.15 }   // Sub-octave (adds warmth)
    ];

    harmonicRatios.forEach(harmonic => {
      // Create oscillator for each harmonic
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * harmonic.ratio;

      // Create gain node for this harmonic
      const gainNode = this.audioContext.createGain();
      
      // Soothing envelope (gentle attack, sustained melody)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(harmonic.gain, now + 0.1); // Gentle attack
      gainNode.gain.exponentialRampToValueAtTime(harmonic.gain * 0.8, now + 0.2); // Minimal initial decay
      gainNode.gain.exponentialRampToValueAtTime(harmonic.gain * 0.6, now + duration * 0.7 / 1000); // Long sustain
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000 + 0.2); // Gentle fade out

      // Add subtle vibrato for soothing effect
      const vibrato = this.audioContext.createOscillator();
      vibrato.frequency.value = 3; // Slower 3Hz vibrato for soothing effect
      const vibratoGain = this.audioContext.createGain();
      vibratoGain.gain.value = frequency * harmonic.ratio * 0.005; // 0.5% pitch variation (subtler)
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      
      // Connect the oscillator through gain to master
      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      // Start and stop
      oscillator.start(now);
      vibrato.start(now);
      oscillator.stop(now + duration / 1000 + 0.4); // Extended for gentle fade
      vibrato.stop(now + duration / 1000 + 0.4);
      
      // Store references for cleanup
      this.currentOscillators.push(oscillator, vibrato);
      this.currentGainNodes.push(gainNode, vibratoGain);
    });
  }

  playNote(note: string, duration: number): void {
    const frequency = NOTE_FREQUENCIES[note];
    if (!frequency) {
      console.warn(`Note ${note} not found in frequencies`);
      return;
    }

    this.createGuitarHarmonic(frequency, duration);
  }

  stopAll(): void {
    const now = this.audioContext.currentTime;
    
    // Fade out all current sounds
    this.currentGainNodes.forEach(gainNode => {
      if (gainNode.gain) {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      }
    });

    // Clean up after fade out
    setTimeout(() => {
      this.currentOscillators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {
          // Oscillator might have already stopped
        }
      });
      
      this.currentGainNodes.forEach(gain => {
        try {
          gain.disconnect();
        } catch (e) {
          // Might already be disconnected
        }
      });
      
      this.currentOscillators = [];
      this.currentGainNodes = [];
    }, 150);
  }

  setVolume(volume: number): void {
    // Volume should be between 0 and 1
    this.masterGain.gain.value = Math.max(0, Math.min(1, volume * 0.3));
  }

  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
}