import { NOTE_FREQUENCIES } from '../constants/notes';

export class GuitarHarmonics {
  private audioContext: AudioContext;
  private currentOscillators: OscillatorNode[] = [];
  private currentGainNodes: GainNode[] = [];
  private masterGain: GainNode;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3; // Master volume
    this.masterGain.connect(this.audioContext.destination);
  }

  private createGuitarHarmonic(frequency: number, duration: number): void {
    const now = this.audioContext.currentTime;
    
    // Create multiple harmonics for richer guitar-like sound
    const harmonicRatios = [
      { ratio: 1, gain: 0.5 },     // Fundamental
      { ratio: 2, gain: 0.3 },     // Octave
      { ratio: 3, gain: 0.15 },    // Fifth above octave
      { ratio: 4, gain: 0.08 },    // Two octaves
      { ratio: 5, gain: 0.05 },    // Major third above two octaves
      { ratio: 6, gain: 0.03 }     // Fifth above two octaves
    ];

    harmonicRatios.forEach(harmonic => {
      // Create oscillator for each harmonic
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * harmonic.ratio;

      // Create gain node for this harmonic
      const gainNode = this.audioContext.createGain();
      
      // Guitar-like envelope (fast attack, gradual decay)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(harmonic.gain, now + 0.01); // Fast attack
      gainNode.gain.exponentialRampToValueAtTime(harmonic.gain * 0.5, now + 0.1); // Initial decay
      gainNode.gain.exponentialRampToValueAtTime(harmonic.gain * 0.2, now + duration * 0.5 / 1000); // Sustain decay
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000); // Full decay

      // Add slight vibrato for realism
      const vibrato = this.audioContext.createOscillator();
      vibrato.frequency.value = 5; // 5Hz vibrato
      const vibratoGain = this.audioContext.createGain();
      vibratoGain.gain.value = frequency * harmonic.ratio * 0.01; // 1% pitch variation
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      
      // Connect the oscillator through gain to master
      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      // Start and stop
      oscillator.start(now);
      vibrato.start(now);
      oscillator.stop(now + duration / 1000 + 0.5); // Add 0.5s for natural decay
      vibrato.stop(now + duration / 1000 + 0.5);
      
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