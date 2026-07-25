import { keyboardMap, resolveKeyboardMapping } from './KeyboardMap';
import { engine } from '../audio/PianoEngine';
import { velocitySimulator } from './VelocitySimulator';
import { describeQwertyMapping, inputDebug, noteNameToMidi } from '../debug/InputDebug';

class KeyHandlerService {
  private activeNotesByCode = new Map<string, string>();
  private globalOctaveOffset = 0; // Base is C3 for lower row
  private leftShiftHeld = false;
  private rightShiftHeld = false;

  public get octaveOffset() {
    return this.globalOctaveOffset;
  }

  public init() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public cleanup() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private getNoteFromKey(code: string, isShift: boolean): string | null {
    return resolveKeyboardMapping(code, this.globalOctaveOffset, isShift).finalNoteName ?? null;
  }

  private shouldIgnoreKeyboardEvent(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    const tagName = target?.tagName;
    return Boolean(
      target?.isContentEditable ||
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      document.querySelector('[data-real-piano-editor="true"]')
    );
  }

  private getRawInput(e: KeyboardEvent) {
    return {
      key: e.key,
      code: e.code,
      repeat: e.repeat,
      shiftKey: e.shiftKey,
      leftShift: this.leftShiftHeld,
      rightShift: this.rightShiftHeld,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    };
  }

  public shiftOctave(delta: number) {
    const next = Math.max(-2, Math.min(2, this.globalOctaveOffset + delta));
    if (next === this.globalOctaveOffset) return;
    const previous = this.globalOctaveOffset;
    this.releaseAll();
    this.globalOctaveOffset = next;
    inputDebug.setOctaveOffset(this.globalOctaveOffset);
    inputDebug.log({
      action: 'octave-change',
      source: 'qwerty',
      rawInput: { code: delta > 0 ? 'ArrowRight' : 'ArrowLeft' },
      match: true,
        matchLabel: 'INFO',
      mismatchReason: `Octave offset changed from ${previous} to ${this.globalOctaveOffset}; held QWERTY notes were released before changing target.`,
    });
    window.dispatchEvent(new CustomEvent('piano-octave-change', { detail: { offset: this.globalOctaveOffset } }));
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft') this.leftShiftHeld = true;
    if (e.code === 'ShiftRight') this.rightShiftHeld = true;

    // Ignore shortcuts with modifiers and editing surfaces.
    if (e.metaKey || e.altKey || this.shouldIgnoreKeyboardEvent(e)) return;

    if (e.repeat) {
      const mapping = describeQwertyMapping(e.code, this.globalOctaveOffset, e.shiftKey);
      if (mapping.finalNoteName) {
        inputDebug.log({
          action: 'press',
          source: 'qwerty',
          rawInput: this.getRawInput(e),
          mapping,
          resolvedInput: { noteName: mapping.finalNoteName, midiNote: mapping.finalMidiNote },
          interfaceResult: { expectedMidiNote: mapping.finalMidiNote, highlightedMidiNote: mapping.finalMidiNote, highlightedNoteName: mapping.finalNoteName },
          audioResult: { attackedMidiNote: mapping.finalMidiNote, noteName: mapping.finalNoteName },
          match: false,
          matchLabel: 'DUPLICATE_ATTACK',
          mismatchReason: 'Repeated keydown was ignored to prevent duplicate attacks.',
        });
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      engine.setSustain(true);
      return;
    }
    
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.shiftOctave(1);
      return;
    }
    
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.shiftOctave(-1);
      return;
    }
    
    // Enable audio context on first interaction
    engine.startAudioContext();

    const mapping = describeQwertyMapping(e.code, this.globalOctaveOffset, e.shiftKey);
    const note = this.getNoteFromKey(e.code, e.shiftKey);
    if (keyboardMap[e.code] && !note) {
      e.preventDefault();
      inputDebug.log({
        action: 'press',
        source: 'qwerty',
        rawInput: this.getRawInput(e),
        mapping,
        match: true,
        matchLabel: 'UNMAPPED_BLACK_KEY',
        mismatchReason: 'Shift layer has no black key above this white key, so no note is triggered.',
      });
      return;
    }

    if (note && !this.activeNotesByCode.has(e.code)) {
      e.preventDefault();
      this.activeNotesByCode.set(e.code, note);
      inputDebug.trackInputPress(`qwerty:${e.code}`, note);
      
      // Send to engine
      const velocity = velocitySimulator.getVelocity(false, e.ctrlKey);
      engine.noteOn(note, velocity);
      
      window.dispatchEvent(new CustomEvent('piano-note-on', { detail: { note, velocity, source: 'qwerty' }}));
      inputDebug.log({
        action: 'press',
        source: 'qwerty',
        rawInput: this.getRawInput(e),
        mapping,
        resolvedInput: { noteName: note, midiNote: noteNameToMidi(note), velocity },
        interfaceResult: { expectedMidiNote: noteNameToMidi(note), highlightedMidiNote: noteNameToMidi(note), highlightedNoteName: note },
        audioResult: { attackedMidiNote: noteNameToMidi(note), noteName: note },
      });
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft') this.leftShiftHeld = false;
    if (e.code === 'ShiftRight') this.rightShiftHeld = false;

    if (this.shouldIgnoreKeyboardEvent(e)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      engine.setSustain(false);
      return;
    }

    const note = this.activeNotesByCode.get(e.code);
    
    if (note) {
      this.activeNotesByCode.delete(e.code);
      const storedNote = inputDebug.trackInputRelease(`qwerty:${e.code}`) ?? note;
      engine.noteOff(note);
      window.dispatchEvent(new CustomEvent('piano-note-off', { detail: { note, source: 'qwerty' }}));
      inputDebug.log({
        action: 'release',
        source: 'qwerty',
        rawInput: this.getRawInput(e),
        resolvedInput: { noteName: storedNote, midiNote: noteNameToMidi(storedNote) },
        interfaceResult: { expectedMidiNote: noteNameToMidi(storedNote), highlightedMidiNote: noteNameToMidi(note), highlightedNoteName: note },
        audioResult: { releasedMidiNote: noteNameToMidi(note), noteName: note },
      });
    } else if (keyboardMap[e.code]) {
      inputDebug.log({
        action: 'release',
        source: 'qwerty',
        rawInput: this.getRawInput(e),
        match: false,
        matchLabel: 'STUCK_NOTE_RISK',
        mismatchReason: 'Keyup received for a mapped key with no stored pressed note.',
      });
    }
  };

  public isNoteActive(noteId: string): boolean {
    for (const activeNote of this.activeNotesByCode.values()) {
        if (activeNote === noteId) return true;
    }
    return false;
  }

  public getActiveKeysCount(): number {
    return this.activeNotesByCode.size;
  }

  public releaseAll() {
    for (const [code, note] of this.activeNotesByCode.entries()) {
      inputDebug.trackInputRelease(`qwerty:${code}`);
      engine.noteOff(note);
      window.dispatchEvent(new CustomEvent('piano-note-off', { detail: { note, source: 'qwerty' }}));
      inputDebug.log({
        action: 'release',
        source: 'qwerty',
        rawInput: { code },
        resolvedInput: { noteName: note, midiNote: noteNameToMidi(note) },
        audioResult: { releasedMidiNote: noteNameToMidi(note), noteName: note },
        match: true,
        matchLabel: 'MATCH',
        mismatchReason: 'Released by keyboard cleanup/releaseAll.',
      });
    }
    this.activeNotesByCode.clear();
    this.leftShiftHeld = false;
    this.rightShiftHeld = false;
  }
}

export const keyHandler = new KeyHandlerService();
