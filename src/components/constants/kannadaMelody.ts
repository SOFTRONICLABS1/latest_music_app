// Kannada Song Melody: "Jenina Holeyo Halina Maleyo"
export interface MelodyNote {
  note: string;
  duration: number; // in milliseconds
}

export const KANNADA_SONG_MELODY: MelodyNote[] = [
  // Jenina Holeyo Halina Maleyo
  {note: 'E4', duration: 500}, {note: 'A4', duration: 500}, {note: 'G4', duration: 500}, {note: 'E4', duration: 500},
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'E4', duration: 500},
  
  // Sudheyo Kannada Savinudiyo
  {note: 'A4', duration: 500}, {note: 'G4', duration: 500}, {note: 'E4', duration: 500}, {note: 'D4', duration: 500},
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'C4', duration: 500}, {note: 'A4', duration: 500},
  
  // Vaniya Veeneya Swara Madhuryavo
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500},
  {note: 'G4', duration: 500}, {note: 'E4', duration: 500}, {note: 'D4', duration: 500}, {note: 'C4', duration: 500},
  
  // Sumadhura Sundara Nudiyo
  {note: 'C4', duration: 500}, {note: 'E4', duration: 500}, {note: 'A4', duration: 500}, {note: 'G4', duration: 500},
  {note: 'E4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500},
  
  // Kavinudi Kogile Hadida Hage
  {note: 'E4', duration: 500}, {note: 'G4', duration: 500}, {note: 'E4', duration: 500}, {note: 'A4', duration: 500},
  {note: 'G4', duration: 500}, {note: 'E4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500},
  
  // Olavina Mathugaladuthaliralu
  {note: 'D4', duration: 500}, {note: 'C4', duration: 500}, {note: 'A4', duration: 500}, {note: 'D4', duration: 500},
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'G4', duration: 500},
  
  // Rannanu Rachisida Honnina Nudiyu
  {note: 'E4', duration: 500}, {note: 'D4', duration: 500}, {note: 'C4', duration: 500}, {note: 'C4', duration: 500}
];

// Twinkle Twinkle Little Star melody
export const TWINKLE_TWINKLE_MELODY: MelodyNote[] = [
  // Twinkle, twinkle, little star
  {note: 'C4', duration: 500}, {note: 'C4', duration: 500}, {note: 'G4', duration: 500}, {note: 'G4', duration: 500},
  {note: 'A4', duration: 500}, {note: 'A4', duration: 500}, {note: 'G4', duration: 1000},
  
  // How I wonder what you are
  {note: 'F4', duration: 500}, {note: 'F4', duration: 500}, {note: 'E4', duration: 500}, {note: 'E4', duration: 500},
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'C4', duration: 1000},
  
  // Up above the world so high
  {note: 'G4', duration: 500}, {note: 'G4', duration: 500}, {note: 'F4', duration: 500}, {note: 'F4', duration: 500},
  {note: 'E4', duration: 500}, {note: 'E4', duration: 500}, {note: 'D4', duration: 1000},
  
  // Like a diamond in the sky
  {note: 'G4', duration: 500}, {note: 'G4', duration: 500}, {note: 'F4', duration: 500}, {note: 'F4', duration: 500},
  {note: 'E4', duration: 500}, {note: 'E4', duration: 500}, {note: 'D4', duration: 1000},
  
  // Twinkle, twinkle, little star
  {note: 'C4', duration: 500}, {note: 'C4', duration: 500}, {note: 'G4', duration: 500}, {note: 'G4', duration: 500},
  {note: 'A4', duration: 500}, {note: 'A4', duration: 500}, {note: 'G4', duration: 1000},
  
  // How I wonder what you are
  {note: 'F4', duration: 500}, {note: 'F4', duration: 500}, {note: 'E4', duration: 500}, {note: 'E4', duration: 500},
  {note: 'D4', duration: 500}, {note: 'D4', duration: 500}, {note: 'C4', duration: 1000}
];

export const KANNADA_SONG_INFO = {
  title: "Jenina Holeyo Halina Maleyo",
  language: "Kannada",
  totalNotes: KANNADA_SONG_MELODY.length,
  estimatedDuration: KANNADA_SONG_MELODY.reduce((total, note) => total + note.duration, 0),
  sections: [
    "Jenina Holeyo Halina Maleyo",
    "Sudheyo Kannada Savinudiyo", 
    "Vaniya Veeneya Swara Madhuryavo",
    "Sumadhura Sundara Nudiyo",
    "Kavinudi Kogile Hadida Hage",
    "Olavina Mathugaladuthaliralu",
    "Rannanu Rachisida Honnina Nudiyu",
    "Kannada Tayiyu Needida Varavu"
  ]
};

export const TWINKLE_TWINKLE_INFO = {
  title: "Twinkle Twinkle Little Star",
  language: "English",
  totalNotes: TWINKLE_TWINKLE_MELODY.length,
  estimatedDuration: TWINKLE_TWINKLE_MELODY.reduce((total, note) => total + note.duration, 0),
  sections: [
    "Twinkle, twinkle, little star",
    "How I wonder what you are",
    "Up above the world so high",
    "Like a diamond in the sky",
    "Twinkle, twinkle, little star",
    "How I wonder what you are"
  ]
};