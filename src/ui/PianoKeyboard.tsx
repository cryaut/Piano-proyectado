import React, { useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { getKeyboardLayout } from '../input/KeyboardMap';
import { engine } from '../audio/PianoEngine';
import { motion, AnimatePresence } from 'motion/react';
import { inputDebug, noteNameToMidi } from '../debug/InputDebug';

export const PianoKeyboard: React.FC = () => {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const pointerHeldNotes = useRef<Set<string>>(new Set());
  const keyboardRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<{ id: string, noteId: string, timestamp: number }[]>([]);
  const [highContrast, setHighContrast] = useState(false);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const debugSnapshot = useSyncExternalStore(inputDebug.subscribe.bind(inputDebug), inputDebug.getSnapshot.bind(inputDebug));
  const debugSettings = debugSnapshot.settings;

  useEffect(() => {
    const handleNoteOn = (e: CustomEvent<{ note: string, velocity?: number, source?: string }>) => {
      inputDebug.setVisualActive(e.detail.note, true);
      const activeVisualNotes = new Set(inputDebug.getSnapshot().activeVisualNotes);
      activeVisualNotes.add(e.detail.note);
      inputDebug.log({
        action: 'press',
        source: 'visual',
        resolvedInput: { noteName: e.detail.note, midiNote: noteNameToMidi(e.detail.note), velocity: e.detail.velocity },
        interfaceResult: {
          expectedMidiNote: noteNameToMidi(e.detail.note),
          highlightedMidiNote: noteNameToMidi(e.detail.note),
          highlightedNoteName: e.detail.note,
          activeVisualNotes: [...activeVisualNotes].sort(),
        },
      });
      setActiveNotes(prev => {
        const next = new Set<string>(prev);
        next.add(e.detail.note);
        return next;
      });
    };
    
    const handleNoteOff = (e: CustomEvent<{ note: string, source?: string }>) => {
      inputDebug.setVisualActive(e.detail.note, false);
      const activeVisualNotes = new Set(inputDebug.getSnapshot().activeVisualNotes);
      activeVisualNotes.delete(e.detail.note);
        inputDebug.log({
          action: 'release',
          source: 'visual',
          resolvedInput: { noteName: e.detail.note, midiNote: noteNameToMidi(e.detail.note) },
          interfaceResult: {
            expectedMidiNote: noteNameToMidi(e.detail.note),
            highlightedMidiNote: noteNameToMidi(e.detail.note),
            highlightedNoteName: e.detail.note,
            activeVisualNotes: [...activeVisualNotes].sort(),
          },
        });
      setActiveNotes(prev => {
        const next = new Set<string>(prev);
        next.delete(e.detail.note);
        return next;
      });
      // Add ripple effect on keyup
      if (!prefersReducedMotion) {
        setRipples(prev => [...prev, { id: Math.random().toString(), noteId: e.detail.note, timestamp: Date.now() }]);
        setTimeout(() => {
          setRipples(prev => prev.filter(r => Date.now() - r.timestamp < 1000));
        }, 1000);
      }
    };

    const handleHighContrast = (e: CustomEvent<{ active: boolean }>) => {
      setHighContrast(e.detail.active);
    };

    const handleAllNotesOff = () => {
      pointerHeldNotes.current.clear();
      inputDebug.clearVisual();
      setActiveNotes(new Set());
    };

    window.addEventListener('piano-note-on', handleNoteOn as EventListener);
    window.addEventListener('piano-note-off', handleNoteOff as EventListener);
    window.addEventListener('piano-high-contrast', handleHighContrast as EventListener);
    window.addEventListener('piano-all-notes-off', handleAllNotesOff);
    return () => {
      window.removeEventListener('piano-note-on', handleNoteOn as EventListener);
      window.removeEventListener('piano-note-off', handleNoteOff as EventListener);
      window.removeEventListener('piano-high-contrast', handleHighContrast as EventListener);
      window.removeEventListener('piano-all-notes-off', handleAllNotesOff);
    };
  }, [prefersReducedMotion]);

  // Render 4 octaves (C3 to B6) to cover all keys and share geometry with the note highway.
  const layout = useMemo(() => getKeyboardLayout(3, 5), []);
  const keys = layout.keys;

  useEffect(() => {
    inputDebug.setVisibleRange(3, 5);
  }, []);

  const getPointerDebug = (e: React.PointerEvent, noteId: string, keyType: 'white' | 'black') => {
    const rect = keyboardRef.current?.getBoundingClientRect();
    const relativeX = rect ? e.clientX - rect.left : 0;
    const relativeY = rect ? e.clientY - rect.top : 0;
    return {
      rawInput: {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        relativeX,
        relativeY,
        containerWidth: rect?.width,
        containerHeight: rect?.height,
      },
      pointerHitTest: inputDebug.buildPointerHitTest({
        noteName: noteId,
        keyType,
        relativeX,
        relativeY,
        containerHeight: rect?.height ?? 0,
        scrollLeft: keyboardRef.current?.scrollLeft ?? 0,
      }),
    };
  };

  const handlePointerDown = (noteId: string, e: React.PointerEvent, keyType: 'white' | 'black') => {
    const pointerDebug = getPointerDebug(e, noteId, keyType);
    if (pointerHeldNotes.current.has(noteId)) {
      inputDebug.log({
        action: 'press',
        source: 'pointer',
        ...pointerDebug,
        resolvedInput: { noteName: noteId, midiNote: noteNameToMidi(noteId), velocity: 0.85 },
        interfaceResult: { expectedMidiNote: noteNameToMidi(noteId), highlightedMidiNote: noteNameToMidi(noteId), highlightedNoteName: noteId, hitboxType: keyType },
        audioResult: { attackedMidiNote: noteNameToMidi(noteId), noteName: noteId, duplicateAttack: true },
      });
      return;
    }
    pointerHeldNotes.current.add(noteId);
    inputDebug.trackInputPress(`pointer:${e.pointerId}`, noteId);
    engine.startAudioContext();
    engine.noteOn(noteId, 0.85);
    window.dispatchEvent(new CustomEvent('piano-note-on', { detail: { note: noteId, velocity: 0.85, source: 'pointer' }}));
    inputDebug.log({
      action: 'press',
      source: 'pointer',
      ...pointerDebug,
      resolvedInput: { noteName: noteId, midiNote: noteNameToMidi(noteId), velocity: 0.85 },
      interfaceResult: { expectedMidiNote: noteNameToMidi(noteId), highlightedMidiNote: noteNameToMidi(noteId), highlightedNoteName: noteId, hitboxType: keyType },
      audioResult: { attackedMidiNote: noteNameToMidi(noteId), noteName: noteId },
    });
  };

  const handlePointerUp = (noteId: string, e?: React.PointerEvent, keyType?: 'white' | 'black', action: 'release' | 'cancel' = 'release') => {
    const storedNote = e ? inputDebug.trackInputRelease(`pointer:${e.pointerId}`) : noteId;
    if (!pointerHeldNotes.current.has(noteId)) {
      inputDebug.log({
        action,
        source: 'pointer',
        ...(e && keyType ? getPointerDebug(e, noteId, keyType) : {}),
        resolvedInput: { noteName: storedNote, midiNote: noteNameToMidi(storedNote) },
        audioResult: { releasedMidiNote: noteNameToMidi(noteId), noteName: noteId, releaseWithoutActive: true },
      });
      return;
    }
    pointerHeldNotes.current.delete(noteId);
    engine.noteOff(noteId);
    window.dispatchEvent(new CustomEvent('piano-note-off', { detail: { note: noteId, source: 'pointer' }}));
    inputDebug.log({
      action,
      source: 'pointer',
      ...(e && keyType ? getPointerDebug(e, noteId, keyType) : {}),
      resolvedInput: { noteName: storedNote, midiNote: noteNameToMidi(storedNote) },
      interfaceResult: { expectedMidiNote: noteNameToMidi(storedNote), highlightedMidiNote: noteNameToMidi(noteId), highlightedNoteName: noteId, hitboxType: keyType },
      audioResult: { releasedMidiNote: noteNameToMidi(noteId), noteName: noteId },
    });
  };

  const releasePointerHeldNotes = () => {
    for (const noteId of pointerHeldNotes.current) {
      inputDebug.trackInputRelease(`pointer:unknown`);
      engine.noteOff(noteId);
      window.dispatchEvent(new CustomEvent('piano-note-off', { detail: { note: noteId, source: 'pointer' }}));
      inputDebug.log({
        action: 'cancel',
        source: 'pointer',
        resolvedInput: { noteName: noteId, midiNote: noteNameToMidi(noteId) },
        audioResult: { releasedMidiNote: noteNameToMidi(noteId), noteName: noteId },
        match: true,
        matchLabel: 'MATCH',
        mismatchReason: 'Pointer note released by global cleanup.',
      });
    }
    pointerHeldNotes.current.clear();
  };

  useEffect(() => {
    window.addEventListener('pointerup', releasePointerHeldNotes);
    window.addEventListener('pointercancel', releasePointerHeldNotes);
    window.addEventListener('blur', releasePointerHeldNotes);
    window.addEventListener('piano-blur', releasePointerHeldNotes);
    return () => {
      window.removeEventListener('pointerup', releasePointerHeldNotes);
      window.removeEventListener('pointercancel', releasePointerHeldNotes);
      window.removeEventListener('blur', releasePointerHeldNotes);
      window.removeEventListener('piano-blur', releasePointerHeldNotes);
      releasePointerHeldNotes();
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const highwayScroll = document.getElementById('highway-scroll');
    if (highwayScroll && highwayScroll.scrollLeft !== e.currentTarget.scrollLeft) {
      highwayScroll.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div ref={keyboardRef} className="flex-1 flex overflow-x-auto bg-[#0a0a0f] p-[2px] rounded-sm relative shadow-inner touch-pan-x touch-none" id="keyboard-scroll" role="region" aria-label="Piano Keyboard" onScroll={handleScroll}> 
      <div className="flex flex-1 items-stretch gap-[1px] relative shrink-0 min-w-max touch-none" style={{ width: layout.width, minWidth: layout.width }}> 
        {keys.map((k) => {
          if (k.isBlack) return null; // Render whites first
          const isActive = activeNotes.has(k.id);
          const keyRipples = ripples.filter(r => r.noteId === k.id);
          
          return (
            <motion.button
              key={k.id}
              role="button"
              aria-label={`Tecla blanca ${k.id}`}
              data-midi-note={noteNameToMidi(k.id)}
              data-note-name={k.id}
              data-key-type="white"
              className={`flex flex-col justify-end items-center pb-3 rounded-b-[4px] relative cursor-pointer select-none overflow-hidden outline-none touch-none
                ${isActive 
                  ? highContrast ? 'bg-cyan-400 z-20' : 'bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.8)] z-20' 
                  : highContrast ? 'bg-white border-2 border-black' : 'bg-[#e5e7eb] group hover:bg-[#f3f4f6]'
                }
              `}
              initial={false}
              animate={{
                scale: isActive && !prefersReducedMotion ? 0.96 : 1,
                transformOrigin: "top center",
              }}
              transition={{ duration: 0.1 }}
              style={{ width: k.w, minWidth: k.w }}
              onPointerDown={(e) => { 
                  e.preventDefault(); 
                  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch(err){}
                  handlePointerDown(k.id, e, 'white'); 
              }}
              onPointerEnter={(e) => {
                  e.preventDefault();
                  if (e.buttons > 0 || e.pressure > 0) handlePointerDown(k.id, e, 'white');
              }}
              onPointerUp={(e) => { e.preventDefault(); handlePointerUp(k.id, e, 'white'); }}
              onPointerLeave={(e) => { e.preventDefault(); if (pointerHeldNotes.current.has(k.id)) handlePointerUp(k.id, e, 'white'); }}
              onPointerCancel={(e) => { e.preventDefault(); handlePointerUp(k.id, e, 'white', 'cancel'); }}
            >
              <AnimatePresence>
                {keyRipples.map(r => (
                  <motion.div
                    key={r.id}
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-cyan-400 pointer-events-none"
                  />
                ))}
              </AnimatePresence>
              <span className={`text-[10px] font-bold z-10 ${isActive ? (highContrast ? 'text-black' : 'text-white') : (highContrast ? 'text-black' : 'text-slate-400 group-hover:text-cyan-600')}`}>
                {k.physicalKey || ''}
              </span>
            </motion.button>
          );
        })}
        {/* Render black keys layout */}
        {keys.map((k) => {
          if (!k.isBlack) return null;
          const isActive = activeNotes.has(k.id);
          const keyRipples = ripples.filter(r => r.noteId === k.id);
          
          return (
            <motion.button
              key={k.id}
              role="button"
              aria-label={`Tecla negra ${k.id}`}
              data-midi-note={noteNameToMidi(k.id)}
              data-note-name={k.id}
              data-key-type="black"
              className={`absolute top-0 z-30 flex flex-col justify-end items-center pb-2 rounded-b-[3px] border cursor-pointer select-none overflow-hidden outline-none touch-none
                ${isActive 
                  ? highContrast ? 'bg-violet-400 border-violet-500' : 'bg-violet-500 border-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.8)]' 
                  : highContrast ? 'bg-black border-2 border-white' : 'bg-[#1a1a1a] border-black hover:bg-[#2a2a2a]'
                }
              `}
              initial={false}
              animate={{
                scale: isActive && !prefersReducedMotion ? 0.96 : 1,
                transformOrigin: "top center",
              }}
              transition={{ duration: 0.1 }}
              style={{ 
                left: k.x,
                width: k.w, 
                height: '60%' // proportional to container 
              }}
              onPointerDown={(e) => { 
                e.preventDefault(); 
                try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch(err){}
                handlePointerDown(k.id, e, 'black'); 
              }}
              onPointerEnter={(e) => {
                e.preventDefault();
                if (e.buttons > 0 || e.pressure > 0) handlePointerDown(k.id, e, 'black');
              }}
              onPointerUp={(e) => { e.preventDefault(); handlePointerUp(k.id, e, 'black'); }}
              onPointerLeave={(e) => { e.preventDefault(); if (pointerHeldNotes.current.has(k.id)) handlePointerUp(k.id, e, 'black'); }}
              onPointerCancel={(e) => { e.preventDefault(); handlePointerUp(k.id, e, 'black', 'cancel'); }}
            >
              <AnimatePresence>
                {keyRipples.map(r => (
                  <motion.div
                    key={r.id}
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-violet-400 pointer-events-none"
                  />
                ))}
              </AnimatePresence>
              <span className={`text-[8px] z-10 ${isActive ? (highContrast ? 'text-black' : 'text-white') : (highContrast ? 'text-white' : 'text-slate-500')}`}>
                {k.physicalKey || ''}
              </span>
            </motion.button>
          );
        })}
        {(debugSettings.showGeometryOverlay || debugSettings.showPointerHitboxes || debugSettings.showNoteLabels) && (
          <div className="absolute inset-0 pointer-events-none z-40">
            {keys.map((k) => {
              const isBlack = k.isBlack;
              const isActive = activeNotes.has(k.id);
              return (
                <div
                  key={`debug-${k.id}`}
                  className={`absolute border ${isBlack ? 'border-violet-300/70 bg-violet-500/10' : 'border-cyan-300/35 bg-cyan-500/5'} ${isActive ? 'ring-2 ring-green-300' : ''}`}
                  style={{ left: k.x, top: 0, width: k.w, height: isBlack ? '60%' : '100%' }}
                >
                  {debugSettings.showNoteLabels && (
                    <div className={`absolute ${isBlack ? 'top-1 text-[8px] text-violet-100' : 'bottom-6 text-[9px] text-cyan-900'} left-0 right-0 text-center font-mono leading-tight`}> 
                      <div>{k.id}</div>
                      <div>{noteNameToMidi(k.id)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
