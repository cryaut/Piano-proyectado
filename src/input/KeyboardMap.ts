export interface KeyMapEntry {
  note: string;
  octave: number;
  keyLabel: string;
  row: 'bottom' | 'middle' | 'top';
  rowLabel: string;
}

export interface ResolvedKeyboardMapping {
  code: string;
  keyLabel?: string;
  row?: KeyMapEntry['row'];
  rowLabel?: string;
  normalNoteName?: string;
  normalMidiNote?: number;
  shiftNoteName?: string;
  shiftMidiNote?: number;
  finalNoteName?: string;
  finalMidiNote?: number;
  noNoteReason?: 'unmapped-key' | 'no-black-key-above';
}

export const WHITE_KEY_WIDTH = 42;
export const WHITE_KEY_GAP = 1;
export const WHITE_KEY_PITCH = WHITE_KEY_WIDTH + WHITE_KEY_GAP;
export const BLACK_KEY_WIDTH = 20;
export const BLACK_KEY_X_OFFSET = BLACK_KEY_WIDTH / 2;

export interface VisualKey {
  note: string;
  octave: number;
  id: string;
  isBlack: boolean;
  physicalKey: string | null;
}

export interface KeyboardLayoutKey extends VisualKey {
  x: number;
  w: number;
}

export interface KeyboardLayout {
  keys: KeyboardLayoutKey[];
  width: number;
  whiteKeyCount: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_BY_WHITE_NOTE: Partial<Record<string, string>> = {
  C: 'C#',
  D: 'D#',
  F: 'F#',
  G: 'G#',
  A: 'A#',
};

const ROWS = [
  {
    row: 'bottom' as const,
    rowLabel: 'Bottom row',
    startMidi: 48, // C3
    keys: [
      ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'],
      ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', '/'],
    ],
  },
  {
    row: 'middle' as const,
    rowLabel: 'Middle row',
    startMidi: 65, // F4, continues after bottom row E4
    keys: [
      ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'],
      ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', ';'],
      ['Quote', "'"],
    ],
  },
  {
    row: 'top' as const,
    rowLabel: 'Top row',
    startMidi: 84, // C6, continues after middle row B5
    keys: [
      ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'],
      ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'],
      ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\'],
    ],
  },
];

const midiToNoteParts = (midi: number) => {
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { note, octave };
};

const noteNameToMidiInternal = (noteName: string) => {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return undefined;
  const noteIndex = NOTE_NAMES.indexOf(match[1]);
  if (noteIndex < 0) return undefined;
  return (Number(match[2]) + 1) * 12 + noteIndex;
};

const nextWhiteMidiNotes = (startMidi: number, count: number) => {
  const result: number[] = [];
  let midi = startMidi;
  while (result.length < count) {
    const { note } = midiToNoteParts(midi);
    if (WHITE_NOTES.includes(note)) result.push(midi);
    midi += 1;
  }
  return result;
};

export const keyboardMap: Record<string, KeyMapEntry> = Object.fromEntries(
  ROWS.flatMap(row => {
    const whiteMidis = nextWhiteMidiNotes(row.startMidi, row.keys.length);
    return row.keys.map(([code, keyLabel], index) => {
      const { note, octave } = midiToNoteParts(whiteMidis[index]);
      return [code, { note, octave, keyLabel, row: row.row, rowLabel: row.rowLabel }];
    });
  })
);

export const resolveKeyboardMapping = (code: string, octaveOffset = 0, isShift = false): ResolvedKeyboardMapping => {
  const mapping = keyboardMap[code];
  if (!mapping) return { code, noNoteReason: 'unmapped-key' };

  const normalNoteName = `${mapping.note}${mapping.octave + octaveOffset}`;
  const normalMidiNote = noteNameToMidiInternal(normalNoteName);
  const shiftNote = SHARP_BY_WHITE_NOTE[mapping.note];
  const shiftNoteName = shiftNote ? `${shiftNote}${mapping.octave + octaveOffset}` : undefined;
  const shiftMidiNote = shiftNoteName ? noteNameToMidiInternal(shiftNoteName) : undefined;

  return {
    code,
    keyLabel: mapping.keyLabel,
    row: mapping.row,
    rowLabel: mapping.rowLabel,
    normalNoteName,
    normalMidiNote,
    shiftNoteName,
    shiftMidiNote,
    finalNoteName: isShift ? shiftNoteName : normalNoteName,
    finalMidiNote: isShift ? shiftMidiNote : normalMidiNote,
    noNoteReason: isShift && !shiftNoteName ? 'no-black-key-above' : undefined,
  };
};

export const getKeyboardMappingTable = () => {
  return ROWS.flatMap(row => row.keys.map(([code]) => resolveKeyboardMapping(code)));
};

export const getVisualKeys = (startOctave: number = 3, numOctaves: number = 5): VisualKey[] => {
  const keys: VisualKey[] = [];
  const entries = Object.entries(keyboardMap);
  for (let o = startOctave; o < startOctave + numOctaves; o++) {
    for (const currentNote of NOTE_NAMES) {
      const normalKey = entries.find(([, mapping]) => mapping.note === currentNote && mapping.octave === o);
      const shiftKey = entries.find(([code]) => resolveKeyboardMapping(code, 0, true).shiftNoteName === `${currentNote}${o}`);
      const physicalKey = normalKey?.[1].keyLabel ?? (shiftKey ? `S+${shiftKey[1].keyLabel}` : null);

      keys.push({
        note: currentNote,
        octave: o,
        id: `${currentNote}${o}`,
        isBlack: currentNote.includes('#'),
        physicalKey,
      });
    }
  }
  return keys;
};

export const getKeyboardLayout = (startOctave: number = 3, numOctaves: number = 5): KeyboardLayout => {
  const visualKeys = getVisualKeys(startOctave, numOctaves);
  let whiteKeyCount = 0;

  const keys = visualKeys.map((key) => {
    if (key.isBlack) {
      return {
        ...key,
        x: whiteKeyCount * WHITE_KEY_PITCH - BLACK_KEY_X_OFFSET,
        w: BLACK_KEY_WIDTH,
      };
    }

    const layoutKey = {
      ...key,
      x: whiteKeyCount * WHITE_KEY_PITCH,
      w: WHITE_KEY_WIDTH,
    };
    whiteKeyCount += 1;
    return layoutKey;
  });

  return {
    keys,
    width: Math.max(0, whiteKeyCount * WHITE_KEY_PITCH - WHITE_KEY_GAP),
    whiteKeyCount,
  };
};
