// Sound synthesis utility for generating harmonic tones
export class SoundSynthesis {
  private audioContext: AudioContext;
  private masterGain: GainNode;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.setValueAtTime(0.1, this.audioContext.currentTime); // Low volume
  }

  // Generate harmonic series for a given fundamental frequency
  private generateHarmonics(fundamental: number, harmonicCount: number = 5): number[] {
    const harmonics: number[] = [];
    for (let i = 1; i <= harmonicCount; i++) {
      harmonics.push(fundamental * i);
    }
    return harmonics;
  }

  // Play a harmonic chord based on the fundamental frequency
  playHarmonicChord(frequency: number, duration: number = 0.3): void {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const harmonics = this.generateHarmonics(frequency, 4); // Use 4 harmonics
    const now = this.audioContext.currentTime;
    
    harmonics.forEach((harmonic, index) => {
      // Skip harmonics that are too high
      if (harmonic > 4000) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      // Use different waveforms for different harmonics
      const waveforms: OscillatorType[] = ['sine', 'triangle', 'sawtooth', 'square'];
      oscillator.type = index === 0 ? 'sine' : waveforms[index % waveforms.length];
      oscillator.frequency.setValueAtTime(harmonic, now);
      
      // Decrease volume for higher harmonics
      const volume = 0.3 / (index + 1);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
    });
  }

  // Play a single tone
  playTone(frequency: number, duration: number = 0.2, waveType: OscillatorType = 'sine'): void {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // Play a pleasant chord progression based on the note
  playChord(frequency: number, duration: number = 0.4): void {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Create a major chord (root, major third, perfect fifth)
    const root = frequency;
    const majorThird = frequency * Math.pow(2, 4/12); // +4 semitones
    const perfectFifth = frequency * Math.pow(2, 7/12); // +7 semitones
    
    const chordNotes = [root, majorThird, perfectFifth];
    const now = this.audioContext.currentTime;
    
    chordNotes.forEach((noteFreq, index) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(noteFreq, now);
      
      const volume = index === 0 ? 0.15 : 0.08; // Root note slightly louder
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
    });
  }

  // Set master volume
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.setValueAtTime(clampedVolume * 0.1, this.audioContext.currentTime);
  }

  // Clean up resources
  destroy(): void {
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}