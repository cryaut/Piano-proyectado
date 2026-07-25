import { getKeyboardMappingTable, resolveKeyboardMapping } from '../src/input/KeyboardMap';

const rows = [
  ['Bottom row', ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']],
  ['Middle row', ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote']],
  ['Top row', ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash']],
] as const;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const isWhiteMidi = (midi?: number) => midi !== undefined && ![1, 3, 6, 8, 10].includes(midi % 12);
const isBlackMidi = (midi?: number) => midi !== undefined && [1, 3, 6, 8, 10].includes(midi % 12);

const allNormalMidis: number[] = [];

for (const [rowLabel, codes] of rows) {
  let previousMidi = -Infinity;
  for (const code of codes) {
    const normal = resolveKeyboardMapping(code, 0, false);
    const shifted = resolveKeyboardMapping(code, 0, true);

    assert(normal.finalMidiNote !== undefined, `${rowLabel} ${code} has no normal note`);
    assert(isWhiteMidi(normal.finalMidiNote), `${rowLabel} ${code} normal note is not white`);
    assert(normal.finalMidiNote > previousMidi, `${rowLabel} ${code} is not ascending`);
    previousMidi = normal.finalMidiNote;
    allNormalMidis.push(normal.finalMidiNote);

    if (shifted.noNoteReason === 'no-black-key-above') {
      assert(shifted.finalMidiNote === undefined, `${rowLabel} ${code} Shift no-note still resolved a MIDI note`);
    } else {
      assert(isBlackMidi(shifted.finalMidiNote), `${rowLabel} ${code} Shift did not resolve a black key`);
      assert(shifted.finalMidiNote === normal.finalMidiNote + 1, `${rowLabel} ${code} Shift is not the black key above normal note`);
    }
  }
}

assert(new Set(allNormalMidis).size === allNormalMidis.length, 'Normal layer has duplicate MIDI notes');

console.table(getKeyboardMappingTable().map(row => ({
  row: row.rowLabel,
  key: row.keyLabel,
  normal: `${row.normalNoteName} (${row.normalMidiNote})`,
  shift: row.shiftNoteName ? `${row.shiftNoteName} (${row.shiftMidiNote})` : 'no black key',
})));
console.log('Keyboard mapping verification passed.');
