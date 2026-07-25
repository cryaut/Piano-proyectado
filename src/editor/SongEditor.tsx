import React, { useMemo, useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { engine } from '../audio/PianoEngine';
import { SongNote, Recording } from '../types';
import { FormatParser } from '../import/FormatParser';
import { songPlayer } from '../game/SongPlayer';
import { recorder } from '../record/Recorder';
import { inputDebug, noteNameToMidi } from '../debug/InputDebug';
import { resolveEditorGridPoint } from './EditorGridMath';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Clipboard,
    Copy,
    Download,
    MousePointer2,
    Music,
    Pencil,
    Play,
    RotateCcw,
    Save,
    Scissors,
    Share2,
    Sparkles,
    StepForward,
    Trash2,
    Undo2,
    Wand2,
} from 'lucide-react';

interface EditorNote {
    id: string;
    note: string;
    startBeat: number;
    durationBeats: number;
    velocity: number;
    hand?: 'left' | 'right';
}

interface EditorDraft {
    title: string;
    bpm: number;
    timeSignature: [number, number];
    notes: EditorNote[];
    author: string;
    difficulty: number;
    updatedAt: number;
}

interface EditorPointerDebug {
    pointerY: number;
    canvasTop: number;
    cssLocalY: number;
    localGridY: number;
    scaledY: number;
    rowFloat: number;
    visibleRow: number;
    row: number;
    verticalScrollRows: number;
    midi: number;
    note: string;
    beat: number;
    outOfBounds: boolean;
    midiIsInteger: boolean;
    noteIsValid: boolean;
}

type ScaleMode = 'major' | 'minor' | 'chromatic';
type ChordType = 'maj' | 'min' | 'sus4' | 'dom7' | 'maj7' | 'min7';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_INTERVALS: Record<ScaleMode, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const CHORD_INTERVALS: Record<ChordType, number[]> = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
    sus4: [0, 5, 7],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
};

const EDITOR_DRAFT_KEY = 'realpiano-editor-draft-v2';

export const SongEditor: React.FC<{ onClose: () => void, onPlaySong?: () => void }> = ({ onClose, onPlaySong }) => {
    const [title, setTitle] = useState('Nueva Cancion');
    const [bpm, setBpm] = useState(120);
    const [timeSignature, setTimeSignature] = useState<[number, number]>([4, 4]);
    const [notes, setNotes] = useState<EditorNote[]>([]);
    
    // History
    const [history, setHistory] = useState<EditorNote[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const pushHistory = (newNotes: EditorNote[]) => {
        const newHist = history.slice(0, historyIndex + 1);
        newHist.push(newNotes);
        if (newHist.length > 50) newHist.shift();
        setHistory(newHist);
        setNotes(newNotes);
        setHistoryIndex(newHist.length - 1);
    };

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(i => i - 1);
            setNotes(history[historyIndex - 1]);
            setSelectedNoteIds(new Set());
        }
    };
    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(i => i + 1);
            setNotes(history[historyIndex + 1]);
            setSelectedNoteIds(new Set());
        }
    };

    const [zoomX, setZoomX] = useState(80); // pixels per beat
    const [zoomY, setZoomY] = useState(16); // pixels per pitch key
    
    const [scrollX, setScrollX] = useState(0);
    const [scrollY, setScrollY] = useState(36); // Starting around C3
    
    const [isPlaying, setIsPlaying] = useState(false);
    const playStartTimeRef = useRef(0);
    const startBeatRef = useRef(0);
    const [playCursorBeat, setPlayCursorBeat] = useState(0);
    
    const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
    const [quantizeStep, setQuantizeStep] = useState(0.25); // 1 = whole, 0.25 = quarter
    const [defaultDuration, setDefaultDuration] = useState(0.25);
    const [scaleRoot, setScaleRoot] = useState('C');
    const [scaleMode, setScaleMode] = useState<ScaleMode>('major');
    const [showVelocityLane, setShowVelocityLane] = useState(true);
    const [pointerDebug, setPointerDebug] = useState<EditorPointerDebug | null>(null);
    
    // Tools: draw, select
    const [tool, setTool] = useState<'draw' | 'select'>('draw');

    // Lasso selection
    const [lasso, setLasso] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
    const [hoverPos, setHoverPos] = useState<{x: number, y: number} | null>(null);

    // Context menu & Settings
    const [ctxMenu, setCtxMenu] = useState<{x: number, y: number, noteId: string} | null>(null);
    const [author, setAuthor] = useState('');
    const [difficulty, setDifficulty] = useState(1);
    const [metronomeEnabled, setMetronomeEnabled] = useState(false);
    const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [draftRepairNotice, setDraftRepairNotice] = useState<string | null>(null);
    
    // Copy/Paste
    const [clipboard, setClipboard] = useState<EditorNote[]>([]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const velCanvasRef = useRef<HTMLCanvasElement>(null);
    
    // Refs for interaction state
    const isDraggingRef = useRef(false);
    const dragTypeRef = useRef<'create' | 'move' | 'resize' | 'select' | 'velocity' | null>(null);
    const dragStartXRef = useRef(0);
    const dragStartYRef = useRef(0);
    const dragStartNotesRef = useRef<EditorNote[]>([]);
    const selectionStartRef = useRef<Set<string>>(new Set());
    
    const keyWidth = 60; 
    const totalKeys = 88;
    const startMidi = 21; 
    const maxMidi = startMidi + totalKeys - 1;

    const clampMidi = (midi: number) => Math.max(startMidi, Math.min(maxMidi, Math.round(midi)));
    const clampVelocity = (velocity: number) => Math.max(0.05, Math.min(1, Number.isFinite(velocity) ? velocity : 0.8));
    const clampScrollRows = (value: number) => Math.max(0, Math.min(totalKeys - 1, Math.round(value)));

    // --- Utils ---
    const midiToNameOrNull = (midi: number): string | null => {
        if (!Number.isInteger(midi) || midi < startMidi || midi > maxMidi) return null;
        const index = ((midi % 12) + 12) % 12;
        const oct = Math.floor(midi / 12) - 1;
        return `${NOTE_NAMES[index]}${oct}`;
    };

    const midiToName = (midi: number) => midiToNameOrNull(clampMidi(midi)) ?? 'C4';

    const nameToMidiNoteOrNull = (name: string): number | null => {
        const match = name.match(/^([A-G]#?)(-?\d+)$/);
        if (!match) return null;
        const index = NOTE_NAMES.indexOf(match[1]);
        const oct = Number(match[2]);
        if (index < 0 || !Number.isInteger(oct)) return null;
        const midi = (oct + 1) * 12 + index;
        return Number.isInteger(midi) ? midi : null;
    };

    const normalizeEditorNotes = (incoming: EditorNote[]) => {
        let repaired = 0;
        let removed = 0;
        const normalized: EditorNote[] = [];

        incoming.forEach((note) => {
            const parsedMidi = nameToMidiNoteOrNull(note.note);
            if (parsedMidi === null) {
                removed += 1;
                return;
            }

            const safeMidi = clampMidi(parsedMidi);
            const safeNote = midiToName(safeMidi);
            const safeStart = Number.isFinite(note.startBeat) ? Math.max(0, note.startBeat) : 0;
            const safeDuration = Number.isFinite(note.durationBeats) ? Math.max(0.01, note.durationBeats) : defaultDuration;
            const safeVelocity = clampVelocity(note.velocity);

            if (
                safeMidi !== parsedMidi ||
                safeNote !== note.note ||
                safeStart !== note.startBeat ||
                safeDuration !== note.durationBeats ||
                safeVelocity !== note.velocity
            ) {
                repaired += 1;
            }

            normalized.push({
                ...note,
                note: safeNote,
                startBeat: safeStart,
                durationBeats: safeDuration,
                velocity: safeVelocity,
            });
        });

        return { notes: normalized, repaired, removed };
    };

    const applyNormalizedNotes = (incoming: EditorNote[], noticePrefix: string, selection?: Set<string>) => {
        const result = normalizeEditorNotes(incoming);
        if (result.repaired || result.removed) {
            setDraftRepairNotice(`${noticePrefix}: ${result.repaired} reparadas, ${result.removed} descartadas.`);
        }
        commitNotes(result.notes, selection);
        return result.notes;
    };

    const quantize = (val: number) => quantizeStep === 0 ? val : Math.round(val / quantizeStep) * quantizeStep;
    const previewNote = (note: string, velocity = 0.8, durationMs = 160) => {
        const midi = noteNameToMidi(note);
        if (midi === undefined) return;
        engine.startAudioContext();
        engine.noteOn(note, velocity);
        inputDebug.log({
            action: 'press',
            source: 'editor-preview',
            resolvedInput: { noteName: note, midiNote: midi, velocity },
            audioResult: { attackedMidiNote: midi, noteName: note },
        });
        window.setTimeout(() => {
            engine.noteOff(note);
            inputDebug.log({
                action: 'release',
                source: 'editor-preview',
                resolvedInput: { noteName: note, midiNote: midi },
                audioResult: { releasedMidiNote: midi, noteName: note },
            });
        }, durationMs);
    };

    const beatToX = (beat: number) => keyWidth + (beat * zoomX) - scrollX;
    const xToBeat = (x: number) => (x - keyWidth + scrollX) / zoomX;
    const midiToY = (midi: number, h: number) => h - ((midi - startMidi - clampScrollRows(scrollY)) * zoomY);
    const yToMidi = (y: number, h: number) => clampMidi(Math.floor((h - y) / zoomY) + startMidi + clampScrollRows(scrollY));
    const projectEndBeat = () => Math.max(16, notes.length ? Math.ceil(Math.max(...notes.map(n => n.startBeat + n.durationBeats)) + 4) : 16);
    const getMaxScrollX = (overrideZoomX = zoomX) => Math.max(0, keyWidth + projectEndBeat() * overrideZoomX - (containerRef.current?.clientWidth || 900) + 120);
    const clampScrollX = (value: number, overrideZoomX = zoomX) => Math.max(0, Math.min(getMaxScrollX(overrideZoomX), value));

    const selectedNotes = useMemo(() => notes.filter(n => selectedNoteIds.has(n.id)), [notes, selectedNoteIds]);
    const targetNoteIds = () => selectedNoteIds.size > 0 ? selectedNoteIds : new Set(notes.map(n => n.id));
    const debugSnapshot = useSyncExternalStore(inputDebug.subscribe.bind(inputDebug), inputDebug.getSnapshot.bind(inputDebug));
    const showEditorGeometryDebug = debugSnapshot.settings.enabled && debugSnapshot.settings.showGeometryOverlay;
    const getGridPoint = (clientX: number, clientY: number, canvas: HTMLCanvasElement): EditorPointerDebug & { x: number; y: number } => {
        const rect = canvas.getBoundingClientRect();
        const point = resolveEditorGridPoint({
            clientX,
            clientY,
            rectLeft: rect.left,
            rectTop: rect.top,
            rectWidth: rect.width,
            rectHeight: rect.height,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            keyWidth,
            zoomX,
            zoomY,
            scrollX,
            scrollY,
            startMidi,
            totalKeys,
        });
        const noteName = midiToNameOrNull(point.midi);

        return {
            ...point,
            pointerY: clientY,
            canvasTop: rect.top,
            cssLocalY: clientY - rect.top,
            localGridY: point.y,
            scaledY: point.y,
            note: noteName ?? 'Invalid',
            midiIsInteger: Number.isInteger(point.midi),
            noteIsValid: noteName !== null,
        };
    };
    const getScalePitchClasses = () => {
        const root = NOTE_NAMES.indexOf(scaleRoot);
        return new Set(SCALE_INTERVALS[scaleMode].map(interval => (root + interval) % 12));
    };

    const commitNotes = (next: EditorNote[], nextSelection?: Set<string>, repairNoticePrefix = 'Editor') => {
        const result = normalizeEditorNotes(next);
        if (result.repaired || result.removed) {
            setDraftRepairNotice(`${repairNoticePrefix}: ${result.repaired} reparadas, ${result.removed} descartadas.`);
        }
        pushHistory(result.notes);
        if (nextSelection) {
            const validIds = new Set(result.notes.map(n => n.id));
            setSelectedNoteIds(new Set([...nextSelection].filter(id => validIds.has(id))));
        }
    };

    const mutateSelection = (mutator: (note: EditorNote, index: number, selected: EditorNote[]) => EditorNote) => {
        const ids = targetNoteIds();
        const selected = notes.filter(n => ids.has(n.id));
        const next = notes.map((note) => {
            if (!ids.has(note.id)) return note;
            return mutator(note, selected.findIndex(s => s.id === note.id), selected);
        });
        commitNotes(next, ids);
    };

    useEffect(() => {
        setHasRecoverableDraft(Boolean(localStorage.getItem(EDITOR_DRAFT_KEY)));
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            persistDraft();
        }, 900);

        return () => window.clearTimeout(timeout);
    }, [title, bpm, timeSignature, notes, author, difficulty]);

    useEffect(() => {
        setScrollX(s => clampScrollX(s));
        setScrollY(s => clampScrollRows(s));
    }, [notes, zoomX, zoomY]);

    const buildDraft = (): EditorDraft => ({
        title,
        bpm,
        timeSignature,
        notes,
        author,
        difficulty,
        updatedAt: Date.now(),
    });

    const persistDraft = (draft = buildDraft()) => {
        localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
        setHasRecoverableDraft(true);
        setLastSavedAt(draft.updatedAt);
    };

    const restoreDraft = () => {
        const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
        if (!raw) return;
        try {
            const draft = JSON.parse(raw) as EditorDraft;
            setTitle(draft.title || 'Nueva Cancion');
            setBpm(draft.bpm || 120);
            setTimeSignature(draft.timeSignature || [4, 4]);
            setAuthor(draft.author || '');
            setDifficulty(draft.difficulty || 1);
            const restored = normalizeEditorNotes(draft.notes || []);
            setNotes(restored.notes);
            setHistory([restored.notes]);
            setHistoryIndex(0);
            setSelectedNoteIds(new Set());
            setLastSavedAt(draft.updatedAt || Date.now());
            if (restored.repaired || restored.removed) {
                setDraftRepairNotice(`Borrador restaurado: ${restored.repaired} reparadas, ${restored.removed} descartadas.`);
            } else {
                setDraftRepairNotice(null);
            }
        } catch (error) {
            console.warn('Could not restore editor draft', error);
        }
    };

    const clearDraft = () => {
        if (!confirm('¿Eliminar solo el borrador guardado? Las notas abiertas en el editor no se borrarán.')) return;
        localStorage.removeItem(EDITOR_DRAFT_KEY);
        setHasRecoverableDraft(false);
        setLastSavedAt(null);
    };

    // --- Render Main Canvas ---
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const scalePitchClasses = getScalePitchClasses();

        // Draw vertical grid (beats)
        ctx.save();
        const startBeat = Math.floor(scrollX / zoomX);
        const endBeat = startBeat + Math.ceil(canvas.width / zoomX) + 1;
        
        for (let b = startBeat; b <= endBeat; b++) {
            if (b < 0) continue;
            const x = beatToX(b);
            
            ctx.fillStyle = b % timeSignature[0] === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(x, 0, 1, canvas.height);
            if (b % timeSignature[0] === 0) {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
                ctx.font = '10px Inter, sans-serif';
                ctx.fillText(`${Math.floor(b / timeSignature[0]) + 1}`, x + 4, 13);
            }
            
            if (zoomX > 40) {
                 for (let sub = 1; sub < 4; sub++) {
                    const subX = x + (sub * zoomX / 4);
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(subX, 0, 1, canvas.height);
                 }
            }
        }
        ctx.restore();

        // Draw horizontal grid (keys)
        ctx.save();
        for (let i = 0; i < totalKeys; i++) {
            const midiNote = startMidi + i;
            const isBlack = [1, 3, 6, 8, 10].includes(midiNote % 12);
            const y = midiToY(midiNote, canvas.height);
            
            if (y > 0 && y < canvas.height + zoomY) {
                const pitchClass = midiNote % 12;
                const inScale = scalePitchClasses.has(pitchClass);
                ctx.fillStyle = inScale ? (isBlack ? 'rgba(34,211,238,0.035)' : 'rgba(34,211,238,0.06)') : 'rgba(15,23,42,0.45)';
                ctx.fillRect(keyWidth, y - zoomY, canvas.width - keyWidth, Math.max(1, zoomY - 1));
                ctx.fillStyle = isBlack ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.065)';
                ctx.fillRect(keyWidth, y - zoomY, canvas.width - keyWidth, 1);
            }
        }
        ctx.restore();

        // Draw notes
        notes.forEach(note => {
            const midiVal = nameToMidiNoteOrNull(note.note);
            if (midiVal === null) return;
            const x = beatToX(note.startBeat);
            const y = midiToY(midiVal, canvas.height);
            const w = note.durationBeats * zoomX;
            const h = zoomY;
            
            if (x + w > 0 && x < canvas.width && y > 0 && y - h < canvas.height) {
                const isSelected = selectedNoteIds.has(note.id);
                ctx.fillStyle = isSelected ? '#ffffff' : (note.hand === 'left' ? 'rgba(249, 115, 22, 0.85)' : note.hand === 'right' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(6, 182, 212, 0.82)');
                ctx.strokeStyle = isSelected ? '#22d3ee' : 'rgba(255,255,255,0.18)';
                ctx.lineWidth = isSelected ? 2 : 1;
                ctx.beginPath();
                ctx.roundRect(x, y - h + 1, Math.max(3, w - 1), Math.max(3, h - 2), 3);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = `rgba(255, 255, 255, ${note.velocity || 0.8})`;
                ctx.fillRect(x, y - h, Math.max(2, w - 1), 2);
                if (zoomX > 54 && w > 28) {
                    ctx.fillStyle = isSelected ? '#0f172a' : 'rgba(255,255,255,0.82)';
                    ctx.font = '10px Inter, sans-serif';
                    ctx.fillText(note.note, x + 5, y - h + Math.min(12, h - 3));
                }
            }
        });

        // Draw Selection Box
        if (lasso) {
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)';
            const x = Math.min(lasso.x1, lasso.x2);
            const y = Math.min(lasso.y1, lasso.y2);
            const w = Math.abs(lasso.x2 - lasso.x1);
            const h = Math.abs(lasso.y2 - lasso.y1);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }

        // Draw Piano Keys Left Bar
        ctx.save();
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, keyWidth, canvas.height);
        for (let i = 0; i < totalKeys; i++) {
            const midiNote = startMidi + i;
            const isBlack = [1, 3, 6, 8, 10].includes(midiNote % 12);
            const y = midiToY(midiNote, canvas.height);
            if (y > 0 && y < canvas.height + zoomY) {
                ctx.fillStyle = isBlack ? '#151515' : '#e5e5e5';
                ctx.fillRect(0, y - zoomY, isBlack ? keyWidth * 0.65 : keyWidth, zoomY - 1);
                
                if (midiNote % 12 === 0) {
                    ctx.fillStyle = isBlack ? '#e5e5e5' : '#151515';
                    ctx.font = '10px Inter';
                    ctx.fillText(`C${(midiNote/12)-1}`, 5, y - zoomY + 12);
                }
            }
        }
        ctx.restore();

        // Play cursor
        const drawPx = beatToX(playCursorBeat);
        if (drawPx > keyWidth && drawPx < canvas.width) {
             ctx.fillStyle = '#ef4444'; 
             ctx.fillRect(drawPx, 0, 2, canvas.height);
        }

    }, [notes, zoomX, zoomY, scrollX, scrollY, playCursorBeat, selectedNoteIds, timeSignature, scaleRoot, scaleMode]);

    // --- Render Velocity Canvas ---
    useEffect(() => {
        const canvas = velCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        ctx.fillStyle = '#0d0e12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // draw notes velocities
        const MAX_H = canvas.height;
        notes.forEach(note => {
            const x = beatToX(note.startBeat) - keyWidth; // relative to its own pos
            const w = 4;
            const h = (note.velocity) * MAX_H;
            
            if (x > 0 && x < canvas.width) {
                 const isSelected = selectedNoteIds.has(note.id);
                 ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(6, 182, 212, 0.8)';
                 ctx.fillRect(x - w/2, MAX_H - h, w, h);
            }
        });
    }, [notes, zoomX, scrollX, selectedNoteIds]);

    // --- Playhead & Audio ---
    useEffect(() => {
        let rafId: number | null = null;
        const timeoutIds: number[] = [];
        let cancelled = false;
        
        // Setup tone logic internally so we don't rely fully on songPlayer 
        // to simplify sync
        if (isPlaying) {
             engine.startAudioContext();
             startBeatRef.current = playCursorBeat;
             playStartTimeRef.current = performance.now();
             
             // Schedule in future
             const startMs = playStartTimeRef.current;
             const bpmS = bpm;
             const notesToPlay = notes
                 .filter(n => nameToMidiNoteOrNull(n.note) !== null && n.startBeat >= playCursorBeat)
                 .sort((a,b) => a.startBeat - b.startBeat);
             
             // Using simple scheduling
             let nextMetronomeBeat = Math.ceil(startBeatRef.current);

             const checkAndPlay = () => {
                 if (cancelled) return;
                 const now = performance.now();
                 const elapsedMs = now - startMs;
                 const currentBeat = startBeatRef.current + (elapsedMs / (60000 / bpmS));
                 setPlayCursorBeat(currentBeat);
                 
                 if (metronomeEnabled) {
                     while (nextMetronomeBeat <= currentBeat + 0.1) {
                         const delay = (nextMetronomeBeat - currentBeat) * (60000 / bpmS);
                         const isDownbeat = nextMetronomeBeat % timeSignature[0] === 0;
                         // A simple synth ping could be synthesized using engine if we had one, 
                         // but for now we play a very high note or use a fallback
                         const metronomeTimeoutId = window.setTimeout(() => {
                              if (!cancelled) {
                                  // Quick beep
                                  try {
                                      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                                      const ctx = new AudioContextClass();
                                      const osc = ctx.createOscillator();
                                      const gain = ctx.createGain();
                                      osc.connect(gain);
                                      gain.connect(ctx.destination);
                                      osc.frequency.value = isDownbeat ? 880 : 440;
                                      
                                      const nowTime = ctx.currentTime;
                                      gain.gain.setValueAtTime(0.05, nowTime);
                                      gain.gain.exponentialRampToValueAtTime(0.001, nowTime + 0.05);
                                      osc.start(nowTime);
                                      osc.stop(nowTime + 0.05);
                                      
                                      // Clean up
                                      setTimeout(() => ctx.close(), 100);
                                  } catch (e) { }
                              }
                         }, Math.max(0, delay));
                         timeoutIds.push(metronomeTimeoutId);
                         nextMetronomeBeat++;
                     }
                 }
                 
                 // If any notes passed, trigger them
                 while (notesToPlay.length > 0 && notesToPlay[0].startBeat <= currentBeat + 0.1) {
                     const n = notesToPlay.shift()!;
                     const delay = (n.startBeat - currentBeat) * (60000 / bpmS);
                     const noteOnTimeoutId = window.setTimeout(() => {
                         if (!cancelled) engine.noteOn(n.note, n.velocity);
                     }, Math.max(0, delay));
                     const noteOffTimeoutId = window.setTimeout(() => {
                         if (!cancelled) engine.noteOff(n.note);
                     }, Math.max(0, delay + n.durationBeats * (60000 / bpmS)));
                     timeoutIds.push(noteOnTimeoutId, noteOffTimeoutId);
                 }
                 
                 // loop if requested or end
                 if (notesToPlay.length > 0) {
                     rafId = requestAnimationFrame(checkAndPlay);
                 } else {
                     if (currentBeat > Math.max(...notes.map(n => n.startBeat + n.durationBeats)) + 1) {
                         setIsPlaying(false);
                         setPlayCursorBeat(0);
                     } else {
                         rafId = requestAnimationFrame(checkAndPlay);
                     }
                 }
             };
             
             rafId = requestAnimationFrame(checkAndPlay);
        } else {
             engine.releaseAll();
        }
        
        return () => {
             cancelled = true;
             if (rafId !== null) cancelAnimationFrame(rafId);
             timeoutIds.forEach(id => window.clearTimeout(id));
             engine.releaseAll();
        };
    }, [isPlaying]);

    useEffect(() => {
        const handleSpace = (e: KeyboardEvent) => {
            if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
                e.preventDefault();
                setIsPlaying(p => !p);
            }
        };
        window.addEventListener('keydown', handleSpace);
        return () => window.removeEventListener('keydown', handleSpace);
    }, []);

    // --- Interaction Handlers ---
    const zoomAt = (nextZoomX: number, anchorClientX?: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const anchorX = rect && anchorClientX !== undefined ? anchorClientX - rect.left : (rect?.width || 900) / 2;
        const anchorBeat = xToBeat(anchorX);
        setZoomX(() => {
            const clampedZoom = Math.max(24, Math.min(260, nextZoomX));
            setScrollX(clampScrollX(anchorBeat * clampedZoom - (anchorX - keyWidth), clampedZoom));
            return clampedZoom;
        });
    };

    const zoomYAt = (nextZoomY: number) => {
        setZoomY(Math.max(8, Math.min(36, nextZoomY)));
    };

    const handleCanvasWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
                zoomYAt(zoomY - e.deltaY * 0.08);
            } else {
                zoomAt(zoomX - e.deltaY * 0.18, e.clientX);
            }
            return;
        }

        e.preventDefault();
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const delta = e.deltaX || e.deltaY;
            setScrollX(s => clampScrollX(s + delta));
        } else {
            setScrollY(s => clampScrollRows(s - (e.deltaY / zoomY)));
        }
    };

    const handleVelocityPointer = (e: React.PointerEvent<HTMLDivElement>, commit = false) => {
        const canvas = velCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const beat = (x + scrollX) / zoomX;
        const nextVelocity = clampVelocity(1 - (y / Math.max(1, rect.height)));
        const ids = selectedNoteIds.size > 0
            ? selectedNoteIds
            : new Set(notes.filter(n => Math.abs(n.startBeat - beat) <= Math.max(0.125, quantizeStep || 0.125)).map(n => n.id));

        if (ids.size === 0) return;
        const next = notes.map(n => ids.has(n.id) ? { ...n, velocity: nextVelocity } : n);
        setNotes(next);
        if (commit) commitNotes(next, ids);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 2) return; // Right click handled by ctx menu
        setCtxMenu(null);
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const point = getGridPoint(e.clientX, e.clientY, canvas);
        const x = point.x;
        const y = point.y;
        setPointerDebug(point);
        if (point.outOfBounds) return; // Clicking on labels or outside the grid
        
        isDraggingRef.current = true;
        dragStartXRef.current = x;
        dragStartYRef.current = y;
        dragStartNotesRef.current = [...notes];
        selectionStartRef.current = new Set(selectedNoteIds);
        
        const b = point.beat;
        const m = point.midi;
        
        // Find if clicked on note
        let clickedNote = null;
        let isRightEdge = false;
        
        // Search backwards to click on top-most
        for (let i = notes.length - 1; i >= 0; i--) {
             const n = notes[i];
             const noteMidi = nameToMidiNoteOrNull(n.note);
             if (noteMidi === m && b >= n.startBeat && b <= n.startBeat + n.durationBeats) {
                 clickedNote = n;
                 if (b > n.startBeat + n.durationBeats - (10/zoomX)) {
                     isRightEdge = true; // 10px margin for resize
                 }
                 break;
             }
        }
        
        if (clickedNote) {
            if (!e.shiftKey && !selectedNoteIds.has(clickedNote.id)) {
                 setSelectedNoteIds(new Set([clickedNote.id]));
            } else if (e.shiftKey) {
                 const next = new Set(selectedNoteIds);
                 next.has(clickedNote.id) ? next.delete(clickedNote.id) : next.add(clickedNote.id);
                 setSelectedNoteIds(next);
            }
            dragTypeRef.current = isRightEdge ? 'resize' : 'move';
        } else {
            // Clicked empty space
            if (tool === 'draw') {
                 const noteName = midiToNameOrNull(m);
                 if (!noteName) return;
                 if (!e.shiftKey) setSelectedNoteIds(new Set());
                 dragTypeRef.current = 'create';
                 const newId = 'n'+Date.now();
                 setSelectedNoteIds(new Set([newId]));
                 setNotes([...notes, {
                     id: newId,
                     note: noteName,
                     startBeat: quantize(b),
                     durationBeats: defaultDuration,
                     velocity: 0.8
                 }]);
                 previewNote(noteName, 0.8);
            } else {
                 dragTypeRef.current = 'select';
                 if (!e.shiftKey) setSelectedNoteIds(new Set());
                 setLasso({ x1: x, y1: y, x2: x, y2: y });
            }
        }
        canvas.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const point = getGridPoint(e.clientX, e.clientY, canvas);
        const x = point.x;
        const y = point.y;
        
        setHoverPos({ x, y });
        setPointerDebug(point);

        if (!isDraggingRef.current) return;
        
        const dxBeats = quantize((x - dragStartXRef.current) / zoomX);
        const dyMidi = Math.round((dragStartYRef.current - y) / zoomY);
        
        if (dragTypeRef.current === 'move') {
             const updated = dragStartNotesRef.current.map(n => {
                 if (selectedNoteIds.has(n.id)) {
                     const currentMidi = nameToMidiNoteOrNull(n.note);
                     if (currentMidi === null) return n;
                     let nextB = Math.max(0, n.startBeat + dxBeats);
                     nextB = quantize(nextB);
                     const nextM = clampMidi(currentMidi + dyMidi);
                     return { ...n, startBeat: nextB, note: midiToName(nextM) };
                 }
                 return n;
             });
             setNotes(updated);
        } else if (dragTypeRef.current === 'resize' || dragTypeRef.current === 'create') {
             const updated = dragStartNotesRef.current.map(n => {
                 if (selectedNoteIds.has(n.id)) {
                     const dynDX = (dragTypeRef.current === 'create') ? (x - dragStartXRef.current)/zoomX : dxBeats;
                     let d = Math.max(0.01, n.durationBeats + dynDX);
                     if (quantizeStep > 0) d = Math.max(quantizeStep, Math.round(d/quantizeStep)*quantizeStep);
                     return { ...n, durationBeats: d };
                 }
                 return n;
             });
             if (dragTypeRef.current === 'create') {
                 const newNotes = [...notes];
                 const id = Array.from(selectedNoteIds)[0];
                 const idx = newNotes.findIndex(nn => nn.id === id);
                 if (idx !== -1) {
                     let d = Math.max(0.01, (x - dragStartXRef.current)/zoomX);
                     if (quantizeStep > 0) d = Math.max(quantizeStep, Math.round(d/quantizeStep)*quantizeStep);
                     newNotes[idx] = { ...newNotes[idx], durationBeats: d };
                     setNotes(newNotes);
                 }
             } else {
                 setNotes(updated);
             }
        } else if (dragTypeRef.current === 'select') {
             setLasso(prev => prev ? { ...prev, x2: x, y2: y } : null);
             
             // Analyze lasso intersection
             const lx1 = Math.min(dragStartXRef.current, x);
             const lx2 = Math.max(dragStartXRef.current, x);
             const ly1 = Math.min(dragStartYRef.current, y);
             const ly2 = Math.max(dragStartYRef.current, y);
             
             const lb1 = xToBeat(lx1);
             const lb2 = xToBeat(lx2);
             const lm1 = yToMidi(ly2, canvas.height); // bottom is lower midi
             const lm2 = yToMidi(ly1, canvas.height); // top is higher midi
             
             const inLasso = new Set<string>();
             dragStartNotesRef.current.forEach(n => {
                  const m = nameToMidiNoteOrNull(n.note);
                  if (m === null) return;
                  if (m >= lm1 && m <= lm2 && n.startBeat + n.durationBeats >= lb1 && n.startBeat <= lb2) {
                      inLasso.add(n.id);
                  }
             });
             
             if (e.shiftKey) {
                 const combined = new Set(selectionStartRef.current);
                 inLasso.forEach(id => combined.add(id));
                 setSelectedNoteIds(combined);
             } else {
                 setSelectedNoteIds(inLasso);
             }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        
        if (dragTypeRef.current === 'create') engine.releaseAll();
        if (dragTypeRef.current === 'select') {
            setLasso(null);
            // pushHistory not needed for selection change
        } else {
            // Push state if changed
            pushHistory(notes);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const point = getGridPoint(e.clientX, e.clientY, canvas);
        const x = point.x;
        const y = point.y;
        setPointerDebug(point);
        if (point.outOfBounds) return;
        
        const b = point.beat;
        const m = point.midi;
        
        for (let i = notes.length - 1; i >= 0; i--) {
             const n = notes[i];
             const noteMidi = nameToMidiNoteOrNull(n.note);
             if (noteMidi === m && b >= n.startBeat && b <= n.startBeat + n.durationBeats) {
                 setCtxMenu({ x: e.clientX, y: e.clientY, noteId: n.id });
                 if (!selectedNoteIds.has(n.id)) setSelectedNoteIds(new Set([n.id]));
                 return;
             }
        }
        setCtxMenu(null);
    };

    // Keyboard handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNoteIds.size > 0) {
                    const next = notes.filter(n => !selectedNoteIds.has(n.id));
                    pushHistory(next);
                    setSelectedNoteIds(new Set());
                }
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                if (notes.length === 0) return;
                const sorted = [...notes].sort((a,b) => a.startBeat - b.startBeat);
                const currentId = Array.from(selectedNoteIds)[0];
                const currentIndex = currentId ? sorted.findIndex(n => n.id === currentId) : -1;
                const nextIndex = e.shiftKey ? (currentIndex - 1 + sorted.length) % sorted.length : (currentIndex + 1) % sorted.length;
                setSelectedNoteIds(new Set([sorted[nextIndex].id]));
                // scroll to it
                const n = sorted[nextIndex];
                setScrollX(Math.max(0, (n.startBeat * zoomX) - (containerRef.current?.clientWidth || 800) / 2));
            }
            if (e.key === 'Home') {
                e.preventDefault();
                setScrollX(0);
                setPlayCursorBeat(0);
            }
            if (e.key === 'End') {
                e.preventDefault();
                setScrollX(getMaxScrollX());
                setPlayCursorBeat(projectEndBeat());
            }
            if (e.key === 'PageDown') {
                e.preventDefault();
                setScrollX(s => clampScrollX(s + (containerRef.current?.clientWidth || 900) * 0.8));
            }
            if (e.key === 'PageUp') {
                e.preventDefault();
                setScrollX(s => clampScrollX(s - (containerRef.current?.clientWidth || 900) * 0.8));
            }
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomAt(zoomX * 1.12);
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                zoomAt(zoomX * 0.88);
            }
            if (e.key === '0') {
                e.preventDefault();
                zoomAt(80);
                zoomYAt(16);
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (selectedNoteIds.size > 0) {
                     e.preventDefault();
                     const dBeats = e.key === 'ArrowRight' ? quantizeStep || 0.25 : e.key === 'ArrowLeft' ? -(quantizeStep || 0.25) : 0;
                     const dMidi = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
                     
                     const updated = notes.map(n => {
                         if (selectedNoteIds.has(n.id)) {
                              const currentMidi = nameToMidiNoteOrNull(n.note);
                              if (currentMidi === null) return n;
                              const newB = Math.max(0, n.startBeat + dBeats);
                              const newM = clampMidi(currentMidi + dMidi);
                              return {...n, startBeat: newB, note: midiToName(newM)};
                         }
                         return n;
                     });
                     pushHistory(updated);
                     const previewTarget = updated.find(n => selectedNoteIds.has(n.id));
                     if (dMidi !== 0 && previewTarget) previewNote(previewTarget.note, 0.8);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                     e.preventDefault();
                     const direction = e.key === 'ArrowRight' ? 1 : -1;
                     setScrollX(s => clampScrollX(s + direction * zoomX));
                }
            }
            
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') { e.preventDefault(); undo(); }
                if (e.key === 'y') { e.preventDefault(); redo(); }
                if (e.key === 'a') {
                    e.preventDefault();
                    setSelectedNoteIds(new Set(notes.map(n => n.id)));
                }
                if (e.key === 'c') {
                    e.preventDefault();
                    const sel = notes.filter(n => selectedNoteIds.has(n.id));
                    if (sel.length) {
                        const minBeat = Math.min(...sel.map(n => n.startBeat));
                        setClipboard(sel.map(n => ({...n, startBeat: n.startBeat - minBeat})));
                    }
                }
                if (e.key === 'v') {
                    e.preventDefault();
                    if (clipboard.length) {
                        const pasteStart = playCursorBeat || 0;
                        const newNotes = clipboard.map(n => ({
                            ...n,
                            id: 'n' + Math.random().toString(36).substr(2, 9),
                            startBeat: quantize(pasteStart + n.startBeat)
                        }));
                        const next = [...notes, ...newNotes];
                        pushHistory(next);
                        setSelectedNoteIds(new Set(newNotes.map(n => n.id)));
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const normalizeVels = () => {
         const next = notes.map(n => selectedNoteIds.has(n.id) || selectedNoteIds.size === 0 ? {...n, velocity: 0.8} : n);
         pushHistory(next);
    };
    
    const humanizeVels = () => {
         const next = notes.map(n => {
             if (selectedNoteIds.has(n.id) || selectedNoteIds.size === 0) {
                 return {...n, velocity: Math.max(0.1, Math.min(1.0, n.velocity + (Math.random() * 0.2 - 0.1)))};
             }
             return n;
         });
         pushHistory(next);
    };

    const velocityRamp = () => {
         const ids = targetNoteIds();
         const selected = notes.filter(n => ids.has(n.id)).sort((a, b) => a.startBeat - b.startBeat || (nameToMidiNoteOrNull(a.note) ?? startMidi) - (nameToMidiNoteOrNull(b.note) ?? startMidi));
         if (selected.length < 2) return;
         const rank = new Map<string, number>(selected.map((n, i) => [n.id, i]));
         const next = notes.map(n => {
             const index = rank.get(n.id);
             if (index === undefined) return n;
             const t = index / Math.max(1, selected.length - 1);
             return { ...n, velocity: 0.35 + t * 0.6 };
         });
         commitNotes(next, ids);
    };

    const transposeSelection = (semitones: number) => {
         mutateSelection((n) => {
             const currentMidi = nameToMidiNoteOrNull(n.note);
             if (currentMidi === null) return n;
             return { ...n, note: midiToName(clampMidi(currentMidi + semitones)) };
         });
    };

    const quantizeSelection = () => {
         if (quantizeStep === 0) return;
         mutateSelection((n) => ({
             ...n,
             startBeat: Math.max(0, Math.round(n.startBeat / quantizeStep) * quantizeStep),
             durationBeats: Math.max(quantizeStep, Math.round(n.durationBeats / quantizeStep) * quantizeStep),
         }));
    };

    const chopSelection = () => {
         if (quantizeStep === 0) return;
         const ids = targetNoteIds();
         const next: EditorNote[] = [];
         notes.forEach(note => {
             if (!ids.has(note.id) || note.durationBeats <= quantizeStep) {
                 next.push(note);
                 return;
             }
             const pieces = Math.max(1, Math.round(note.durationBeats / quantizeStep));
             for (let i = 0; i < pieces; i++) {
                 next.push({
                     ...note,
                     id: `${note.id}_chop_${i}_${Date.now()}`,
                     startBeat: note.startBeat + i * quantizeStep,
                     durationBeats: quantizeStep,
                 });
             }
         });
         commitNotes(next, new Set(next.filter(n => n.id.includes('_chop_')).map(n => n.id)));
    };

    const legatoSelection = () => {
         const ids = targetNoteIds();
         const selected = notes.filter(n => ids.has(n.id)).sort((a, b) => a.startBeat - b.startBeat);
         if (selected.length < 2) return;
         const nextDuration = new Map<string, number>();
         selected.forEach((note, index) => {
             const nextNote = selected[index + 1];
             if (!nextNote) return;
             nextDuration.set(note.id, Math.max(0.05, nextNote.startBeat - note.startBeat));
         });
         const next = notes.map(n => nextDuration.has(n.id) ? { ...n, durationBeats: nextDuration.get(n.id)! } : n);
         commitNotes(next, ids);
    };

    const strumSelection = (amount = 0.035) => {
         const ids = targetNoteIds();
         const selected = notes.filter(n => ids.has(n.id)).sort((a, b) => (nameToMidiNoteOrNull(a.note) ?? startMidi) - (nameToMidiNoteOrNull(b.note) ?? startMidi));
         const offset = new Map(selected.map((n, i) => [n.id, i * amount]));
         const next = notes.map(n => offset.has(n.id) ? { ...n, startBeat: Math.max(0, n.startBeat + offset.get(n.id)!) } : n);
         commitNotes(next, ids);
    };

    const stampChord = (type: ChordType) => {
         const base = selectedNotes[0] || {
             id: 'base',
             note: 'C4',
             startBeat: quantize(playCursorBeat),
             durationBeats: defaultDuration,
             velocity: 0.8,
         };
         const rootMidi = nameToMidiNoteOrNull(base.note);
         if (rootMidi === null) return;
         const created = CHORD_INTERVALS[type].map((interval, index) => ({
             ...base,
             id: `chord_${Date.now()}_${index}`,
             note: midiToName(clampMidi(rootMidi + interval)),
         }));
         const existing = selectedNotes.length > 0 ? notes.filter(n => !selectedNoteIds.has(n.id)) : notes;
         commitNotes([...existing, ...created].sort((a, b) => a.startBeat - b.startBeat), new Set(created.map(n => n.id)));
    };

    const setSelectionHand = (hand?: 'left' | 'right') => {
         mutateSelection((n) => ({ ...n, hand }));
    };
    
    const duplicateSel = () => {
         setCtxMenu(null);
         const next = [...notes];
         const newSel = new Set<string>();
         notes.filter(n => selectedNoteIds.has(n.id)).forEach(n => {
             const id = 'n' + Math.random().toString(36).substr(2, 9);
             next.push({...n, id, startBeat: n.startBeat + n.durationBeats}); // naive copy right after
             newSel.add(id);
         });
         pushHistory(next);
         setSelectedNoteIds(newSel);
    };

    const toExportPayload = () => {
        const safeNotes = normalizeEditorNotes(notes).notes;
        return {
           title,
           bpm,
           timeSignature,
           unit: 'beats',
           author,
           difficulty,
           tracks: [{
               notes: safeNotes.map(n => ({
                   pitch: n.note,
                   start: n.startBeat,
                   duration: n.durationBeats,
                   velocity: n.velocity
               }))
           }]
        };
    };

    const handleExportJson = () => {
        const payload = toExportPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '_')}.json`;
        a.click();
    };

    const handleExportMidi = () => {
        const safeNotes = normalizeEditorNotes(notes).notes;
        // Convert to Recording format for RecorderService to process
        const rec: Recording = {
            id: 'x', title, date: Date.now(), instrument: 'Piano', noteCount: safeNotes.length,
            durationMs: safeNotes.length ? Math.max(...safeNotes.map(n => (n.startBeat + n.durationBeats)*(60000/bpm))) : 0,
            data: safeNotes.map(n => ({
                note: n.note,
                time: n.startBeat * (60000/bpm),
                duration: n.durationBeats * (60000/bpm),
                velocity: n.velocity
            })),
            sustainEvents: []
        };
        const blob = recorder.generateMidiFile(rec);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '_')}.mid`;
        a.click();
    };

    const handleShareLink = () => {
        const b64 = btoa(JSON.stringify(toExportPayload()));
        const url = `${window.location.origin}${window.location.pathname}?song=${encodeURIComponent(b64)}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('¡Enlace copiado al portapapeles!');
        });
    };

    const loadRecIntoEditor = (rec: Recording) => {
        const recBpm = 120;
        setBpm(recBpm);
        setTitle(rec.title);
        const mapped = rec.data.map((n, i) => ({
            id: 'n'+i,
            note: n.note,
            startBeat: n.time / (60000/recBpm),
            durationBeats: n.duration / (60000/recBpm),
            velocity: n.velocity
        }));
        applyNormalizedNotes(mapped, 'Grabacion cargada');
    };

    const playInGame = () => {
         const payload = toExportPayload();
         songPlayer.loadSong(payload);
         songPlayer.setMode('practice');
         if (onPlaySong) {
             onPlaySong();
         } else {
             onClose();
         }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        FormatParser.parseFile(file).then(parsed => {
            setTitle(parsed.title);
            setBpm(parsed.bpm);
            if (parsed.timeSignature) setTimeSignature(parsed.timeSignature);
            
            const newNotes: EditorNote[] = [];
            // flatten tracks
            parsed.tracks.forEach(t => {
                t.notes.forEach((n, i) => {
                    newNotes.push({
                        id: 'imp' + Math.random().toString(36).substring(2) + i,
                        note: n.pitch,
                        startBeat: n.start,
                        durationBeats: n.duration,
                        velocity: n.velocity || 0.8
                    });
                });
            });
            applyNormalizedNotes(newNotes, 'Importacion');
            alert(`Archivo importado exitosamente: ${parsed.title}`);
        }).catch(err => {
            alert('Error importando: ' + err.message);
        });
        e.target.value = '';
    };

    return (
        <div className="absolute inset-0 z-50 bg-[#0a0a0f] flex flex-col font-sans" data-real-piano-editor="true">
            <header className="h-14 border-b border-white/10 bg-[#0f1115] flex items-center px-6 justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-medium text-sm flex items-center gap-2"><ArrowLeft size={15} /> Volver</button>
                    <input 
                        className="bg-transparent text-white font-bold text-lg outline-none max-w-xs"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                             <span className="text-slate-500 uppercase text-[10px] tracking-widest font-bold">BPM</span>
                             <input 
                                 type="number" min={40} max={240}
                                 className="bg-white/5 border border-white/10 text-cyan-400 font-mono w-16 px-2 py-1 rounded"
                                 value={bpm}
                                 onChange={e => setBpm(Number(e.target.value))}
                             />
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setMetronomeEnabled(v => !v)} 
                        className={`w-8 h-8 rounded shrink-0 flex items-center justify-center border font-bold transition-colors ${metronomeEnabled ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10'}`} 
                        title="Metronomo"
                    >
                        <Music size={14} />
                    </button>
                    <label className="bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded text-xs cursor-pointer border border-white/10 transition-colors uppercase tracking-wider font-bold">
                        Importar...
                        <input type="file" accept=".mid,.midi,.abc,.json,.mxl,.xml" className="hidden" onChange={handleImportFile} />
                    </label>

                    <button
                        onClick={() => persistDraft()}
                        className="bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 rounded text-xs border border-white/10 transition-colors uppercase tracking-wider font-bold flex items-center gap-1.5"
                        title={lastSavedAt ? `Guardado ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Guardar borrador'}
                    >
                        <Save size={13} /> Guardar
                    </button>

                    <button
                        onClick={restoreDraft}
                        disabled={!hasRecoverableDraft}
                        className="bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 text-slate-200 px-3 py-1.5 rounded text-xs border border-white/10 transition-colors uppercase tracking-wider font-bold flex items-center gap-1.5"
                    >
                        <RotateCcw size={13} /> Restaurar
                    </button>

                    <button 
                        className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${isPlaying ? 'bg-red-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-black'}`}
                        onClick={() => setIsPlaying(!isPlaying)}
                    >
                        <Play size={13} /> {isPlaying ? 'Detener' : 'Reproducir'}
                    </button>
                    
                    <div className="relative group p-1">
                        <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded text-xs transition-colors">
                            Exportar
                        </button>
                        <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-[#16181d] border border-white/10 rounded shadow-xl min-w-32 z-50 overflow-hidden">
                            <button onClick={handleExportJson} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">JSON</button>
                            <button onClick={handleExportMidi} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white border-t border-white/5">MIDI</button>
                            <button onClick={handleShareLink} className="w-full text-left px-4 py-2 text-sm text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 font-medium border-t border-white/5">Copiar Enlace</button>
                        </div>
                    </div>

                    <button onClick={playInGame} className="bg-purple-500 hover:bg-purple-400 text-black px-4 py-1.5 rounded text-xs uppercase font-bold tracking-wider transition-colors ml-2">
                        Jugar
                    </button>
                </div>
            </header>

            {draftRepairNotice && (
                <div className="h-9 border-b border-amber-400/20 bg-amber-400/10 px-6 flex items-center justify-between text-xs text-amber-100 shrink-0">
                    <span>{draftRepairNotice}</span>
                    <button onClick={() => setDraftRepairNotice(null)} className="px-2 py-1 rounded hover:bg-amber-300/10 text-amber-200">
                        Ocultar
                    </button>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <aside className="w-48 border-r border-white/10 bg-[#0d0e12] p-4 flex flex-col gap-6 shrink-0 overflow-y-auto">
                    <div className="space-y-2">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Herramientas</h3>
                        <button onClick={() => setTool('draw')} className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${tool === 'draw' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Pencil size={14} /> Dibujar</button>
                        <button onClick={() => setTool('select')} className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${tool === 'select' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><MousePointer2 size={14} /> Seleccionar</button>
                    </div>
                    
                    <div className="space-y-2">
                         <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Cuantización</h3>
                         <select 
                             value={quantizeStep} 
                             onChange={(e) => setQuantizeStep(Number(e.target.value))}
                             className="w-full bg-[#16181d] border border-white/10 text-white text-sm rounded px-2 py-1.5 outline-none font-medium"
                         >
                             <option value={1}>1/1 (Redonda)</option>
                             <option value={0.5}>1/2 (Blanca)</option>
                             <option value={0.25}>1/4 (Negra)</option>
                             <option value={0.125}>1/8 (Corchea)</option>
                             <option value={0.0625}>1/16 (Semicorchea)</option>
                             <option value={0}>Libre</option>
                         </select>
                         <button onClick={quantizeSelection} className="w-full text-left px-3 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-2">
                             <Wand2 size={13} /> Cuantizar seleccion
                         </button>
                         <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest pt-2">Duracion nueva</label>
                         <select
                             value={defaultDuration}
                             onChange={(e) => setDefaultDuration(Number(e.target.value))}
                             className="w-full bg-[#16181d] border border-white/10 text-white text-sm rounded px-2 py-1.5 outline-none font-medium"
                         >
                             <option value={1}>1 beat</option>
                             <option value={0.5}>1/2 beat</option>
                             <option value={0.25}>1/4 beat</option>
                             <option value={0.125}>1/8 beat</option>
                         </select>
                    </div>

                    <div className="space-y-2">
                         <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Escala</h3>
                         <div className="grid grid-cols-2 gap-2">
                            <select value={scaleRoot} onChange={(e) => setScaleRoot(e.target.value)} className="bg-[#16181d] border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none">
                                {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <select value={scaleMode} onChange={(e) => setScaleMode(e.target.value as ScaleMode)} className="bg-[#16181d] border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none">
                                <option value="major">Mayor</option>
                                <option value="minor">Menor</option>
                                <option value="chromatic">Cromatica</option>
                            </select>
                         </div>
                    </div>

                    <div className="space-y-2">
                         <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Transformar</h3>
                         <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => transposeSelection(-12)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1"><ArrowDown size={12} /> Oct</button>
                            <button onClick={() => transposeSelection(12)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1"><ArrowUp size={12} /> Oct</button>
                            <button onClick={() => transposeSelection(-1)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1"><ArrowLeft size={12} /> Semi</button>
                            <button onClick={() => transposeSelection(1)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1"><ArrowRight size={12} /> Semi</button>
                         </div>
                         <button onClick={legatoSelection} className="w-full text-left px-3 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-2"><Sparkles size={13} /> Legato</button>
                         <button onClick={chopSelection} className="w-full text-left px-3 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-2"><Scissors size={13} /> Chop por grid</button>
                         <button onClick={() => strumSelection(0.035)} className="w-full text-left px-3 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-2"><StepForward size={13} /> Strum</button>
                    </div>

                    <div className="space-y-2">
                         <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Acordes</h3>
                         <div className="grid grid-cols-2 gap-2">
                            {(['maj', 'min', 'sus4', 'dom7', 'maj7', 'min7'] as ChordType[]).map(chord => (
                                <button key={chord} onClick={() => stampChord(chord)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 uppercase">{chord}</button>
                            ))}
                         </div>
                    </div>

                    <div className="space-y-2">
                         <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Grabaciones</h3>
                         <div className="max-h-32 overflow-y-auto space-y-1">
                             {recorder.getRecordings().map(r => (
                                 <button onClick={() => loadRecIntoEditor(r)} key={r.id} className="w-full text-left px-2 py-1 text-xs bg-white/5 hover:bg-white/10 rounded truncate text-slate-300">
                                     {r.title}
                                 </button>
                             ))}
                             {recorder.getRecordings().length === 0 && <div className="text-xs text-slate-600 italic">No hay grabaciones</div>}
                         </div>
                    </div>
                </aside>

                <div 
                    ref={containerRef} 
                    className="flex-1 overflow-hidden relative cursor-crosshair touch-none"
                    onWheel={handleCanvasWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={() => setHoverPos(null)}
                    onContextMenu={handleContextMenu}
                >
                    <canvas ref={canvasRef} className="absolute inset-0 block"></canvas>
                    <div className="absolute top-3 left-[72px] z-30 flex items-center gap-1 bg-[#0b0d11]/90 border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
                        <button onClick={() => setScrollX(0)} className="px-2 py-1 rounded hover:bg-white/10" title="Ir al inicio (Home)">Inicio</button>
                        <button onClick={() => setScrollX(s => clampScrollX(s - zoomX * 4))} className="px-2 py-1 rounded hover:bg-white/10" title="Desplazar izquierda">←</button>
                        <input
                            type="range"
                            min={0}
                            max={Math.max(1, getMaxScrollX())}
                            value={Math.min(scrollX, Math.max(1, getMaxScrollX()))}
                            onChange={(e) => setScrollX(clampScrollX(Number(e.target.value)))}
                            className="w-40 accent-cyan-500"
                            aria-label="Navegación horizontal del editor"
                        />
                        <button onClick={() => setScrollX(s => clampScrollX(s + zoomX * 4))} className="px-2 py-1 rounded hover:bg-white/10" title="Desplazar derecha">→</button>
                        <span className="mx-1 text-slate-600">|</span>
                        <button onClick={() => zoomAt(zoomX * 0.85)} className="px-2 py-1 rounded hover:bg-white/10" title="Alejar. Atajos: Ctrl/Cmd + rueda, tecla -, 0 para reset">−</button>
                        <span className="font-mono text-slate-400 w-14 text-center" title="Zoom horizontal actual">{Math.round(zoomX)}px</span>
                        <button onClick={() => zoomAt(zoomX * 1.15)} className="px-2 py-1 rounded hover:bg-white/10" title="Acercar. Atajos: Ctrl/Cmd + rueda, tecla +, 0 para reset">+</button>
                    </div>
                    {showEditorGeometryDebug && pointerDebug && (
                        <div className={`absolute top-14 left-[72px] z-30 bg-[#0b0d11]/90 border ${pointerDebug.outOfBounds ? 'border-amber-500/40 text-amber-200' : 'border-cyan-500/30 text-cyan-100'} rounded px-2 py-1 text-[10px] font-mono shadow-lg pointer-events-none`}>
                            cssY {pointerDebug.cssLocalY.toFixed(1)} | canvasY {pointerDebug.scaledY.toFixed(1)} | rowFloat {pointerDebug.rowFloat.toFixed(3)} | vis {pointerDebug.visibleRow} + scroll {pointerDebug.verticalScrollRows} = row {pointerDebug.row} | {pointerDebug.note} MIDI {pointerDebug.midi} {pointerDebug.midiIsInteger && pointerDebug.noteIsValid ? 'OK' : 'INVALID'} | beat {pointerDebug.beat.toFixed(2)}
                        </div>
                    )}
                    
                    {hoverPos && !isDraggingRef.current && (
                        (() => {
                            const b = xToBeat(hoverPos.x);
                            const m = yToMidi(hoverPos.y, containerRef.current?.clientHeight || 0);
                            for (let i = notes.length - 1; i >= 0; i--) {
                                const n = notes[i];
                                const noteMidi = nameToMidiNoteOrNull(n.note);
                                if (noteMidi === m && b >= n.startBeat && b <= n.startBeat + n.durationBeats) {
                                    return (
                                        <div 
                                            className="absolute bg-black/90 border border-white/20 text-white text-[10px] px-2 py-1 rounded shadow-xl pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full mb-2"
                                            style={{ left: hoverPos.x, top: hoverPos.y - 10 }}
                                        >
                                            <span className="font-bold text-cyan-400">{n.note}</span> &middot; {n.durationBeats.toFixed(2)}b &middot; vel {Math.round(n.velocity * 100)}%
                                        </div>
                                    );
                                }
                            }
                            return null;
                        })()
                    )}
                </div>

                <aside className="w-72 border-l border-white/10 bg-[#0d0e12] p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Inspector</h3>
                        <span className="text-[10px] text-cyan-400 font-mono">{selectedNoteIds.size || notes.length} sel</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-black/30 border border-white/10 rounded p-2">
                            <div className="text-[9px] uppercase text-slate-500">Notas</div>
                            <div className="text-sm font-mono text-white">{notes.length}</div>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded p-2">
                            <div className="text-[9px] uppercase text-slate-500">Beats</div>
                            <div className="text-sm font-mono text-white">{notes.length ? Math.max(...notes.map(n => n.startBeat + n.durationBeats)).toFixed(1) : '0.0'}</div>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded p-2">
                            <div className="text-[9px] uppercase text-slate-500">Vel</div>
                            <div className="text-sm font-mono text-white">{selectedNotes.length ? Math.round((selectedNotes.reduce((sum, n) => sum + n.velocity, 0) / selectedNotes.length) * 100) : '--'}%</div>
                        </div>
                    </div>

                    <div className="space-y-3 border border-white/10 rounded bg-black/20 p-3">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Proyecto</h3>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                            Autor
                            <input
                                value={author}
                                onChange={(e) => setAuthor(e.target.value)}
                                className="mt-1 w-full bg-white/5 border border-white/10 text-slate-200 rounded px-2 py-1.5 outline-none"
                                placeholder="Tu nombre"
                            />
                        </label>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                            Dificultad {difficulty}
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={difficulty}
                                onChange={(e) => setDifficulty(Number(e.target.value))}
                                className="mt-2 w-full appearance-none bg-white/10 h-2 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 cursor-pointer"
                            />
                        </label>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{lastSavedAt ? `Autosave ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Sin borrador'}</span>
                            <button onClick={clearDraft} className="text-red-300 hover:text-red-200" title="Elimina solo el borrador guardado, no la canción abierta">Limpiar borrador</button>
                        </div>
                    </div>

                    {selectedNotes.length === 1 && (
                        <div className="space-y-3 border border-white/10 rounded bg-black/20 p-3">
                            <div className="text-xs font-bold text-white">{selectedNotes[0].note}</div>
                            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                Inicio (beat)
                                <input type="number" step={quantizeStep || 0.01} value={selectedNotes[0].startBeat}
                                    onChange={(e) => mutateSelection(n => ({ ...n, startBeat: Math.max(0, Number(e.target.value)) }))}
                                    className="mt-1 w-full bg-white/5 border border-white/10 text-slate-200 rounded px-2 py-1.5" />
                            </label>
                            <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                Duración (beats)
                                <input type="number" step={quantizeStep || 0.01} value={selectedNotes[0].durationBeats}
                                    onChange={(e) => mutateSelection(n => ({ ...n, durationBeats: Math.max(0.05, Number(e.target.value)) }))}
                                    className="mt-1 w-full bg-white/5 border border-white/10 text-slate-200 rounded px-2 py-1.5" />
                            </label>
                        </div>
                    )}

                    <div className="space-y-3">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Velocity</h3>
                        <input
                            type="range"
                            min={5}
                            max={100}
                            value={selectedNotes.length ? Math.round((selectedNotes.reduce((sum, n) => sum + n.velocity, 0) / selectedNotes.length) * 100) : 80}
                            onChange={(e) => mutateSelection(n => ({ ...n, velocity: Number(e.target.value) / 100 }))}
                            className="w-full appearance-none bg-white/10 h-2 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 cursor-pointer"
                        />
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={normalizeVels} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">80%</button>
                            <button onClick={humanizeVels} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">Human</button>
                            <button onClick={velocityRamp} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">Ramp</button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Mano</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setSelectionHand('left')} className="px-2 py-2 rounded text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/20">Izq</button>
                            <button onClick={() => setSelectionHand('right')} className="px-2 py-2 rounded text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20">Der</button>
                            <button onClick={() => setSelectionHand(undefined)} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">Auto</button>
                        </div>
                    </div>

                    <div className="space-y-2 mt-auto">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Edicion</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={duplicateSel} className="px-2 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1"><Copy size={12} /> Duplicar</button>
                            <button onClick={() => {
                                const next = notes.filter(n => !targetNoteIds().has(n.id));
                                commitNotes(next, new Set());
                            }} className="px-2 py-2 rounded text-xs bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 flex items-center justify-center gap-1"><Trash2 size={12} /> Borrar</button>
                        </div>
                        <button onClick={() => setShowVelocityLane(v => !v)} className="w-full px-3 py-2 rounded text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10">
                            {showVelocityLane ? 'Ocultar velocity lane' : 'Mostrar velocity lane'}
                        </button>
                    </div>
                </aside>
            </div>
            
            {/* Velocity Tool */}
            {showVelocityLane && <div className="h-32 border-t border-white/10 bg-[#0d0e12] shrink-0 flex">
                <div className="w-48 p-4 shrink-0 border-r border-white/10 flex flex-col gap-2 relative z-10">
                    <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Velocity</h3>
                    <button onClick={normalizeVels} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-slate-300 border border-white/10">Normalizar (80%)</button>
                    <button onClick={humanizeVels} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-slate-300 border border-white/10">Humanizar (±10%)</button>
                </div>
                <div
                    className="flex-1 relative overflow-hidden bg-black/20"
                    onPointerDown={(e) => handleVelocityPointer(e, false)}
                    onPointerMove={(e) => {
                        if (e.buttons > 0) handleVelocityPointer(e, false);
                    }}
                    onPointerUp={(e) => handleVelocityPointer(e, true)}
                    onWheel={(e) => {
                     // Sync scroll!
                     setScrollX(s => Math.max(0, s + e.deltaX));
                     e.preventDefault();
                }}>
                     <canvas ref={velCanvasRef} className="absolute inset-0 block"></canvas>
                </div>
            </div>}

            {/* Context menu portal */}
            {ctxMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => {e.preventDefault(); setCtxMenu(null);}}></div>
                  <div className="fixed z-50 bg-[#16181d] border border-white/10 rounded-lg shadow-2xl py-1 text-sm text-slate-300 min-w-36 overflow-hidden" style={{left: ctxMenu.x, top: ctxMenu.y}}>
                     <button onClick={duplicateSel} className="w-full text-left px-4 py-1.5 hover:bg-white/10 hover:text-white flex justify-between">
                         Duplicar <span className="text-slate-500 text-xs"></span>
                     </button>
                     <button onClick={() => {
                          const next = notes.filter(n => n.id !== ctxMenu.noteId && !selectedNoteIds.has(n.id));
                          pushHistory(next);
                          setSelectedNoteIds(new Set());
                          setCtxMenu(null);
                     }} className="w-full text-left px-4 py-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 border-t border-white/5 flex justify-between">
                         Borrar <span className="text-red-900 text-xs">Del</span>
                     </button>
                  </div>
                </>
            )}
        </div>
    );
};
