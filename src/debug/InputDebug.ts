import { KeyboardLayoutKey, getKeyboardLayout, resolveKeyboardMapping } from '../input/KeyboardMap';

export type PianoInputDebugAction = 'press' | 'release' | 'move' | 'cancel' | 'all-notes-off' | 'sustain' | 'octave-change' | 'mode-change' | 'info';
export type PianoInputDebugSource = 'qwerty' | 'pointer' | 'midi' | 'hid' | 'song-player' | 'editor-preview' | 'audio-engine' | 'visual' | 'system';
export type PianoInputDebugMatchLabel = 'MATCH' | 'MAPPING_MISMATCH' | 'WHITE_NOTE_DURING_SHIFT' | 'UNINTENDED_DUPLICATE' | 'VISUAL_MISMATCH' | 'AUDIO_MISMATCH' | 'RELEASE_MISMATCH' | 'DUPLICATE_VISUAL_EVENT' | 'DUPLICATE_ATTACK' | 'UNMAPPED_BLACK_KEY' | 'OUT_OF_RANGE_NOTE' | 'HITBOX_MISMATCH' | 'STUCK_NOTE_RISK' | 'INFO';

export interface PianoInputDebugEvent {
  id: string;
  timestamp: number;
  action: PianoInputDebugAction;
  source: PianoInputDebugSource;
  rawInput?: {
    key?: string;
    code?: string;
    repeat?: boolean;
    leftShift?: boolean;
    rightShift?: boolean;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    relativeX?: number;
    relativeY?: number;
    containerWidth?: number;
    containerHeight?: number;
    midiData?: number[];
    hidCode?: string;
  };
  currentState: {
    appMode: string;
    octaveOffset: number;
    firstVisibleMidiNote: number;
    lastVisibleMidiNote: number;
    visibleRange: string;
  };
  mapping?: {
    baseNoteName?: string;
    baseMidiNote?: number;
    normalNoteName?: string;
    normalMidiNote?: number;
    shiftNoteName?: string;
    shiftMidiNote?: number;
    finalNoteName?: string;
    finalMidiNote?: number;
    physicalKey?: string;
    row?: string;
    noNoteReason?: string;
  };
  pointerHitTest?: {
    blackCheckedFirst?: boolean;
    blackCandidate?: string;
    blackCandidateMidi?: number;
    whiteCandidate?: string;
    whiteCandidateMidi?: number;
    selectedNoteName?: string;
    selectedMidiNote?: number;
    hitboxType?: 'white' | 'black';
    considered?: Array<{ noteName: string; midiNote: number; keyType: 'white' | 'black'; x: number; y: number; w: number; h: number; hit: boolean }>;
  };
  resolvedInput?: {
    midiNote?: number;
    noteName?: string;
    velocity?: number;
  };
  interfaceResult?: {
    expectedMidiNote?: number;
    highlightedMidiNote?: number;
    highlightedNoteName?: string;
    hitboxType?: 'white' | 'black';
    activeVisualNotes?: string[];
  };
  audioResult?: {
    attackedMidiNote?: number;
    releasedMidiNote?: number;
    noteName?: string;
    engineReady?: boolean;
    layer?: 'L' | 'M' | 'H';
    backend?: 'sampler' | 'fallback' | 'none';
    duplicateAttack?: boolean;
    releaseWithoutActive?: boolean;
    activeAudioNotes?: string[];
  };
  match: boolean;
  matchLabel: PianoInputDebugMatchLabel;
  mismatchReason?: string;
}

export interface InputDebugSettings {
  enabled: boolean;
  logging: boolean;
  sourceFilter: 'all' | PianoInputDebugSource;
  mismatchesOnly: boolean;
  showActiveNotes: boolean;
  showPointerHitboxes: boolean;
  showGeometryOverlay: boolean;
  showNoteLabels: boolean;
  maxEntries: number;
}

interface InputDebugState {
  appMode: string;
  octaveOffset: number;
  visibleStartOctave: number;
  visibleOctaves: number;
  activeVisualNotes: Set<string>;
  activeAudioNotes: Set<string>;
  activeInputs: Map<string, string>;
  lastAudioAttackByNote: Map<string, PianoInputDebugEvent>;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEFAULT_SETTINGS: InputDebugSettings = {
  enabled: false,
  logging: true,
  sourceFilter: 'all',
  mismatchesOnly: false,
  showActiveNotes: true,
  showPointerHitboxes: false,
  showGeometryOverlay: false,
  showNoteLabels: false,
  maxEntries: 250,
};

export const noteNameToMidi = (name?: string): number | undefined => {
  if (!name) return undefined;
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return undefined;
  const noteIndex = NOTE_NAMES.indexOf(match[1]);
  if (noteIndex < 0) return undefined;
  const octave = Number(match[2]);
  return (octave + 1) * 12 + noteIndex;
};

export const midiToNoteName = (midi?: number): string | undefined => {
  if (midi === undefined || !Number.isFinite(midi)) return undefined;
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
};

export const describeQwertyMapping = (code: string, octaveOffset: number, isShift: boolean) => {
  const mapping = resolveKeyboardMapping(code, octaveOffset, isShift);
  return {
    baseNoteName: mapping.normalNoteName,
    baseMidiNote: mapping.normalMidiNote,
    normalNoteName: mapping.normalNoteName,
    normalMidiNote: mapping.normalMidiNote,
    shiftNoteName: mapping.shiftNoteName,
    shiftMidiNote: mapping.shiftMidiNote,
    finalNoteName: mapping.finalNoteName,
    finalMidiNote: mapping.finalMidiNote,
    physicalKey: mapping.keyLabel,
    row: mapping.rowLabel,
    noNoteReason: mapping.noNoteReason,
  };
};

const getVisibleRange = (startOctave: number, octaves: number) => {
  const first = noteNameToMidi(`C${startOctave}`) ?? 48;
  const last = noteNameToMidi(`B${startOctave + octaves - 1}`) ?? 95;
  return { first, last, label: `${midiToNoteName(first)}-${midiToNoteName(last)}` };
};

const inferMatch = (event: Omit<PianoInputDebugEvent, 'id' | 'timestamp' | 'currentState' | 'match' | 'matchLabel'>): { match: boolean; matchLabel: PianoInputDebugMatchLabel; mismatchReason?: string } => {
  const resolved = event.resolvedInput?.midiNote;
  const highlighted = event.interfaceResult?.highlightedMidiNote;
  const attack = event.audioResult?.attackedMidiNote;
  const release = event.audioResult?.releasedMidiNote;

  if (event.audioResult?.duplicateAttack) {
    return { match: false, matchLabel: 'DUPLICATE_ATTACK', mismatchReason: 'Audio engine received a duplicate attack for an already active note.' };
  }
  if (event.audioResult?.releaseWithoutActive) {
    return { match: false, matchLabel: 'STUCK_NOTE_RISK', mismatchReason: 'Audio engine was asked to release a note that was not active.' };
  }
  if (event.pointerHitTest?.blackCandidateMidi !== undefined && event.pointerHitTest?.selectedMidiNote !== undefined && event.pointerHitTest.blackCandidateMidi !== event.pointerHitTest.selectedMidiNote && event.pointerHitTest.hitboxType !== 'black') {
    return { match: false, matchLabel: 'HITBOX_MISMATCH', mismatchReason: 'Pointer intersected a black-key region, but the selected key was not that black key.' };
  }
  if (resolved !== undefined && highlighted !== undefined && resolved !== highlighted) {
    return { match: false, matchLabel: 'VISUAL_MISMATCH', mismatchReason: `Resolved input MIDI ${resolved} differs from highlighted MIDI ${highlighted}.` };
  }
  if (resolved !== undefined && attack !== undefined && resolved !== attack) {
    return { match: false, matchLabel: 'AUDIO_MISMATCH', mismatchReason: `Resolved input MIDI ${resolved} differs from audio attack MIDI ${attack}.` };
  }
  if (resolved !== undefined && release !== undefined && resolved !== release) {
    return { match: false, matchLabel: 'RELEASE_MISMATCH', mismatchReason: `Resolved/stored input MIDI ${resolved} differs from released MIDI ${release}.` };
  }
  if (event.action === 'info' || event.action === 'mode-change' || event.action === 'octave-change' || event.action === 'sustain') {
    return { match: true, matchLabel: 'INFO' };
  }
  return { match: true, matchLabel: 'MATCH' };
};

class InputDebugService {
  private events: PianoInputDebugEvent[] = [];
  private settings: InputDebugSettings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<() => void>();
  private snapshot: ReturnType<InputDebugService['buildSnapshot']> | null = null;
  private state: InputDebugState = {
    appMode: 'free',
    octaveOffset: 0,
    visibleStartOctave: 3,
    visibleOctaves: 4,
    activeVisualNotes: new Set(),
    activeAudioNotes: new Set(),
    activeInputs: new Map(),
    lastAudioAttackByNote: new Map(),
  };

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.snapshot = null;
    this.listeners.forEach(listener => listener());
  }

  private buildSnapshot() {
    return {
      events: this.events,
      settings: this.settings,
      activeVisualNotes: [...this.state.activeVisualNotes].sort(),
      activeAudioNotes: [...this.state.activeAudioNotes].sort(),
      activeInputs: [...this.state.activeInputs.entries()],
      currentState: this.getCurrentState(),
    };
  }

  public getSnapshot() {
    if (!this.snapshot) this.snapshot = this.buildSnapshot();
    return this.snapshot;
  }

  public getKeyboardLayout() {
    return getKeyboardLayout(this.state.visibleStartOctave, this.state.visibleOctaves);
  }

  public updateSettings(partial: Partial<InputDebugSettings>) {
    this.settings = { ...this.settings, ...partial, maxEntries: Math.max(25, Math.min(2000, partial.maxEntries ?? this.settings.maxEntries)) };
    this.notify();
  }

  public setAppMode(appMode: string) {
    if (this.state.appMode === appMode) return;
    this.state.appMode = appMode;
    this.log({ action: 'mode-change', source: 'system', match: true, matchLabel: 'INFO', mismatchReason: `Mode changed to ${appMode}` });
  }

  public setOctaveOffset(octaveOffset: number) {
    this.state.octaveOffset = octaveOffset;
  }

  public setVisibleRange(startOctave: number, octaves: number) {
    this.state.visibleStartOctave = startOctave;
    this.state.visibleOctaves = octaves;
  }

  public clear() {
    this.events = [];
    this.notify();
  }

  public trackInputPress(inputId: string, noteName: string) {
    this.state.activeInputs.set(inputId, noteName);
  }

  public trackInputRelease(inputId: string) {
    const note = this.state.activeInputs.get(inputId);
    this.state.activeInputs.delete(inputId);
    return note;
  }

  public setVisualActive(noteName: string, active: boolean) {
    if (active) this.state.activeVisualNotes.add(noteName);
    else this.state.activeVisualNotes.delete(noteName);
  }

  public setAudioActive(noteName: string, active: boolean) {
    if (active) this.state.activeAudioNotes.add(noteName);
    else this.state.activeAudioNotes.delete(noteName);
  }

  public clearVisual() {
    this.state.activeVisualNotes.clear();
  }

  public clearAudio() {
    this.state.activeAudioNotes.clear();
    this.state.lastAudioAttackByNote.clear();
  }

  public getCurrentState() {
    const range = getVisibleRange(this.state.visibleStartOctave, this.state.visibleOctaves);
    return {
      appMode: this.state.appMode,
      octaveOffset: this.state.octaveOffset,
      firstVisibleMidiNote: range.first,
      lastVisibleMidiNote: range.last,
      visibleRange: range.label,
    };
  }

  public log(payload: Omit<PianoInputDebugEvent, 'id' | 'timestamp' | 'currentState' | 'match' | 'matchLabel'> & Partial<Pick<PianoInputDebugEvent, 'match' | 'matchLabel'>>) {
    if (!this.settings.logging && payload.source !== 'system') return;

    const inferred = payload.match !== undefined && payload.matchLabel
      ? { match: payload.match, matchLabel: payload.matchLabel, mismatchReason: payload.mismatchReason }
      : inferMatch(payload);

    const event: PianoInputDebugEvent = {
      ...payload,
      id: `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      currentState: this.getCurrentState(),
      match: inferred.match,
      matchLabel: inferred.matchLabel,
      mismatchReason: inferred.mismatchReason ?? payload.mismatchReason,
    };

    this.events = [event, ...this.events].slice(0, this.settings.maxEntries);
    this.notify();
  }

  public logAudioAttack(noteName: string, details: { velocity?: number; layer?: 'L' | 'M' | 'H'; backend?: 'sampler' | 'fallback' | 'none'; engineReady?: boolean; duplicateAttack?: boolean }) {
    const midi = noteNameToMidi(noteName);
    this.setAudioActive(noteName, true);
    this.log({
      action: 'press',
      source: 'audio-engine',
      resolvedInput: { noteName, midiNote: midi, velocity: details.velocity },
      audioResult: {
        attackedMidiNote: midi,
        noteName,
        engineReady: details.engineReady,
        layer: details.layer,
        backend: details.backend,
        duplicateAttack: details.duplicateAttack,
        activeAudioNotes: [...this.state.activeAudioNotes].sort(),
      },
    });
  }

  public logAudioRelease(noteName: string, details: { backend?: 'sampler' | 'fallback' | 'none'; engineReady?: boolean; releaseWithoutActive?: boolean }) {
    const midi = noteNameToMidi(noteName);
    if (!details.releaseWithoutActive) this.setAudioActive(noteName, false);
    this.log({
      action: 'release',
      source: 'audio-engine',
      resolvedInput: { noteName, midiNote: midi },
      audioResult: {
        releasedMidiNote: midi,
        noteName,
        engineReady: details.engineReady,
        backend: details.backend,
        releaseWithoutActive: details.releaseWithoutActive,
        activeAudioNotes: [...this.state.activeAudioNotes].sort(),
      },
    });
  }

  public buildPointerHitTest(params: { noteName: string; keyType: 'white' | 'black'; relativeX: number; relativeY: number; containerHeight: number; scrollLeft: number }) {
    const layout = this.getKeyboardLayout();
    const keyboardX = params.relativeX + params.scrollLeft;
    const considered = layout.keys.map(key => {
      const h = key.isBlack ? params.containerHeight * 0.6 : params.containerHeight;
      const hit = keyboardX >= key.x && keyboardX <= key.x + key.w && params.relativeY >= 0 && params.relativeY <= h;
      return {
        noteName: key.id,
        midiNote: noteNameToMidi(key.id) ?? -1,
        keyType: key.isBlack ? 'black' as const : 'white' as const,
        x: key.x,
        y: 0,
        w: key.w,
        h,
        hit,
      };
    });

    const blackCandidate = considered.find(key => key.keyType === 'black' && key.hit);
    const whiteCandidate = considered.find(key => key.keyType === 'white' && key.hit);
    const selectedMidiNote = noteNameToMidi(params.noteName);

    return {
      blackCheckedFirst: true,
      blackCandidate: blackCandidate?.noteName,
      blackCandidateMidi: blackCandidate?.midiNote,
      whiteCandidate: whiteCandidate?.noteName,
      whiteCandidateMidi: whiteCandidate?.midiNote,
      selectedNoteName: params.noteName,
      selectedMidiNote,
      hitboxType: params.keyType,
      considered: considered.filter(key => key.hit),
    };
  }
}

export const inputDebug = new InputDebugService();
export type KeyboardDebugLayoutKey = KeyboardLayoutKey;
