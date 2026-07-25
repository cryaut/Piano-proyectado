import React, { useEffect, useRef, useState } from 'react';
import { songPlayer } from './SongPlayer';
import { scoringEngine } from './ScoringEngine';
import { keyHandler } from '../input/KeyHandler';
import { getKeyboardLayout } from '../input/KeyboardMap';
import { engine } from '../audio/PianoEngine';
import { inputDebug, noteNameToMidi } from '../debug/InputDebug';

const PIXELS_PER_BEAT = 200;

export const NoteHighway: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scoreStats, setScoreStats] = useState(scoringEngine.stats);
  const [isPlaying, setIsPlaying] = useState(songPlayer.isPlaying);
  const [mode, setMode] = useState(songPlayer.mode);
  const pressedNotesRef = useRef<Set<string>>(new Set());


  useEffect(() => {
    return songPlayer.subscribe(() => {
        setIsPlaying(songPlayer.isPlaying);
        setMode(songPlayer.mode);
    });
  }, []);

  useEffect(() => {
    const handleScoreUpdate = (e: any) => setScoreStats(e.detail);
    const handleModeUpdate = (e: any) => setMode(e.detail.mode);
    const handleNoteOn = (e: any) => pressedNotesRef.current.add(e.detail.note);
    const handleNoteOff = (e: any) => pressedNotesRef.current.delete(e.detail.note);
    const handleAllNotesOff = () => pressedNotesRef.current.clear();
    window.addEventListener('scoring-update', handleScoreUpdate);
    window.addEventListener('piano-mode-change', handleModeUpdate);
    window.addEventListener('piano-note-on', handleNoteOn);
    window.addEventListener('piano-note-off', handleNoteOff);
    window.addEventListener('piano-all-notes-off', handleAllNotesOff);
    return () => {
       window.removeEventListener('scoring-update', handleScoreUpdate);
       window.removeEventListener('piano-mode-change', handleModeUpdate);
       window.removeEventListener('piano-note-on', handleNoteOn);
       window.removeEventListener('piano-note-off', handleNoteOff);
       window.removeEventListener('piano-all-notes-off', handleAllNotesOff);
    };
  }, []);

  useEffect(() => {
    const layout = getKeyboardLayout(3, 5);
    const keyPositions: Record<string, { x: number, w: number, isBlack: boolean }> = {};
    
    layout.keys.forEach(k => {
      keyPositions[k.id] = { x: k.x, w: k.w, isBlack: k.isBlack };
    });

    const canvasWidth = layout.width;
    let animationId: number;

    const render = () => {
       const canvas = canvasRef.current;
       const ctx = canvas?.getContext('2d');
       if (!canvas || !ctx) return;

       const rect = containerRef.current?.getBoundingClientRect();
       if (rect) {
          canvas.width = canvasWidth;
          canvas.height = rect.height;
       }

       ctx.clearRect(0, 0, canvas.width, canvas.height);

       // Grid
       ctx.fillStyle = '#050608';
       ctx.fillRect(0, 0, canvas.width, canvas.height);
       
       const HIT_LINE_Y = canvas.height - 30;
       
       ctx.beginPath();
       ctx.moveTo(0, HIT_LINE_Y);
       ctx.lineTo(canvas.width, HIT_LINE_Y);
       ctx.strokeStyle = '#22d3ee';
       ctx.lineWidth = 2;
       ctx.stroke();

        if (songPlayer.currentSong && (mode === 'practice' || mode === 'rhythm' || mode === 'listen')) {
           const currentBeats = songPlayer.getCurrentBeats();
           const offsetX = 2; 

           let shouldPause = false;

           let isSustainedCurrently = false;

           // Render sustain blocks below notes if available
           if (songPlayer.currentSong.sustain) {
               songPlayer.currentSong.sustain.forEach(block => {
                   if (currentBeats >= block.start && currentBeats <= block.end) {
                       isSustainedCurrently = true;
                   }
                   const blockYBottom = HIT_LINE_Y - ((block.start - currentBeats) * PIXELS_PER_BEAT);
                   const blockHeight = (block.end - block.start) * PIXELS_PER_BEAT;
                   const blockYTop = blockYBottom - blockHeight;
                   
                   if (blockYTop > canvas.height || blockYBottom < 0) return;

                   ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                   ctx.fillRect(0, blockYTop, canvas.width, blockHeight);
                   ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                   ctx.fillRect(0, blockYBottom - 2, canvas.width, 2);
                   ctx.fillRect(0, blockYTop, canvas.width, 2);
               });
           }

           if (mode === 'listen') {
               engine.setSustain(isSustainedCurrently);
           }

           songPlayer.currentSong.notes.forEach(note => {
               const noteYBottom = HIT_LINE_Y - ((note.start - currentBeats) * PIXELS_PER_BEAT);
               const noteHeight = note.duration * PIXELS_PER_BEAT;
               const noteYTop = noteYBottom - noteHeight;

               const isHitting = noteYBottom >= HIT_LINE_Y && noteYTop <= HIT_LINE_Y;
               const isPassed = noteYTop > HIT_LINE_Y;
               const isPhysicallyPressed = pressedNotesRef.current.has(note.pitch) || keyHandler.isNoteActive(note.pitch);

               if (mode === 'practice' || mode === 'rhythm') {
                   // Scoring & Pause logic embedded
                   if (note.status === 'future') {
                       // If the note has reached the line, wait for the user to press it
                       if (noteYBottom >= HIT_LINE_Y) {
                           if (isPhysicallyPressed) {
                               note.status = 'active';
                               const errorMs = (currentBeats - note.start) * (60000 / songPlayer.currentSong!.bpm);
                               note.errorMs = errorMs;
                               scoringEngine.registerHit(errorMs);
                               songPlayer.resumeFromPractice();
                           } else if (mode === 'practice' && noteYBottom > HIT_LINE_Y + 10) {
                               // If it passes 10px below without being pressed, pause the scrolling until pressed
                               shouldPause = true;
                           } else if (mode === 'rhythm' && noteYBottom > HIT_LINE_Y + 26) {
                               note.status = 'missed';
                               scoringEngine.registerMiss();
                           }
                       }
                   } else if (note.status === 'active') {
                       if (isPassed) {
                           note.status = 'perfect';
                       } else if (!isPhysicallyPressed && isHitting) {
                           note.status = 'sustained';
                       }
                   } else if ((note.status as any) === 'future' && isPassed) {
                       note.status = 'missed';
                       scoringEngine.registerMiss();
                   }
               } else if (mode === 'listen') {
                   if (note.status === 'future') {
                       if (noteYBottom >= HIT_LINE_Y) {
                           note.status = 'active';
                           engine.noteOn(note.pitch, note.velocity);
                           inputDebug.log({
                               action: 'press',
                               source: 'song-player',
                               resolvedInput: { noteName: note.pitch, midiNote: noteNameToMidi(note.pitch), velocity: note.velocity },
                               interfaceResult: { expectedMidiNote: noteNameToMidi(note.pitch), highlightedMidiNote: noteNameToMidi(note.pitch), highlightedNoteName: note.pitch },
                               audioResult: { attackedMidiNote: noteNameToMidi(note.pitch), noteName: note.pitch },
                           });
                       }
                   } else if (note.status === 'active') {
                       if (isPassed) {
                           note.status = 'perfect';
                           engine.noteOff(note.pitch);
                           inputDebug.log({
                               action: 'release',
                               source: 'song-player',
                               resolvedInput: { noteName: note.pitch, midiNote: noteNameToMidi(note.pitch) },
                               audioResult: { releasedMidiNote: noteNameToMidi(note.pitch), noteName: note.pitch },
                           });
                       }
                   }
               }

               // Rendering note rects
               if (noteYTop > canvas.height || noteYBottom < 0) return;

               const pos = keyPositions[note.pitch];
               if (!pos) return;

               const x = pos.x + offsetX;
               const w = pos.w;

               let fillStr = 'rgba(34, 211, 238, 0.4)';
               let strokeStr = '#22d3ee';
               let shadowColor = 'transparent';
               
               if (note.hand === 'left') {
                   fillStr = 'rgba(249, 115, 22, 0.4)'; // Orange-500
                   strokeStr = '#f97316';
               } else if (note.hand === 'right') {
                   fillStr = 'rgba(59, 130, 246, 0.4)'; // Blue-500
                   strokeStr = '#3b82f6';
               }
               
               if (note.status === 'active' || (isPhysicallyPressed && isHitting)) {
                   fillStr = 'rgba(34, 197, 94, 0.6)';
                   strokeStr = '#4ade80';
                   shadowColor = 'rgba(74,222,128,0.4)';
               } else if (note.status === 'sustained') {
                   fillStr = 'rgba(245, 158, 11, 0.6)';
                   strokeStr = '#fbbf24';
               } else if (note.status === 'missed') {
                   fillStr = 'rgba(239, 68, 68, 0.6)';
                   strokeStr = '#f87171';
               } else if (note.status === 'perfect') {
                   fillStr = 'rgba(255, 255, 255, 0.8)';
                   strokeStr = '#fff';
               }

               ctx.fillStyle = fillStr;
               ctx.strokeStyle = strokeStr;
               ctx.lineWidth = 1;
               ctx.shadowBlur = shadowColor !== 'transparent' ? 10 : 0;
               ctx.shadowColor = shadowColor;
               
               ctx.beginPath();
               ctx.roundRect(x, noteYTop, w, noteHeight, 4);
               ctx.fill();
               ctx.stroke();
               ctx.shadowBlur = 0;

               // Render error label if active or passed
               if (note.errorMs !== undefined && (note.status !== 'future')) {
                   ctx.fillStyle = note.errorMs > 0 ? '#f87171' : '#4ade80';
                   ctx.font = '10px monospace';
                   const sign = note.errorMs > 0 ? '+' : '';
                   ctx.fillText(`${sign}${Math.round(note.errorMs)}ms`, x + w + 5, noteYBottom - 10);
               }
           });

           if (shouldPause && songPlayer.isPlaying && !songPlayer.isPausedForPractice) {
               songPlayer.pauseForPractice();
           } else if (!shouldPause && songPlayer.isPausedForPractice) {
               songPlayer.resumeFromPractice();
           }

           const currentMeasure = Math.floor(currentBeats / songPlayer.currentSong.timeSignature[0]) + 1;
           const currentBeat = Math.floor(currentBeats % songPlayer.currentSong.timeSignature[0]) + 1;
           
           ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
           ctx.font = '12px monospace';
           ctx.fillText(`M: ${currentMeasure} / B: ${currentBeat}  (${songPlayer.currentSong.bpm} BPM)`, 20, 30);
           
           // Song completion check / Summary trigger
           const isComplete = songPlayer.currentSong.notes.every(n => n.status === 'perfect' || n.status === 'missed' || n.status === 'sustained');
           if (isComplete && songPlayer.isPlaying) {
               songPlayer.togglePlay();
               // Trigger overlay update could happen here
           }
       } else if (mode === 'free') {
           ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
           ctx.font = '32px font-sans font-bold';
           ctx.textAlign = 'center';
           ctx.fillText('FREE PLAY MODE', canvas.width / 2, canvas.height / 2);
           ctx.textAlign = 'left';
       }
       
       animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [mode]);

  const togglePlay = () => {
      songPlayer.togglePlay();
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const keyboardScroll = document.getElementById('keyboard-scroll');
      if (keyboardScroll && keyboardScroll.scrollLeft !== e.currentTarget.scrollLeft) {
          keyboardScroll.scrollLeft = e.currentTarget.scrollLeft;
      }
  };

  const isComplete = (mode === 'practice' || mode === 'rhythm') && !isPlaying && scoreStats.totalStrokes > 0 && songPlayer.currentSong?.notes.every(n => n.status !== 'future');

  return (
      <div ref={containerRef} className="absolute inset-0 overflow-hidden flex justify-center">
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden" id="highway-scroll" onScroll={handleScroll}>
             <canvas ref={canvasRef} className="block mx-auto max-w-none" />
          </div>

          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
            <div className="flex gap-6 items-center bg-[#0a0b0d]/90 px-5 py-2.5 rounded-lg border border-white/10 shadow-xl backdrop-blur-md">
                {(mode === 'practice' || mode === 'rhythm' || mode === 'listen') && (
                  <>
                  <button 
                      onClick={() => {
                          songPlayer.currentSong = null;
                          songPlayer.resetPlayback();
                          songPlayer.setMode('free');
                      }}
                      className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 transition-colors text-red-100 text-[10px] font-bold rounded uppercase tracking-widest"
                  >
                      CERRAR CANCIÓN
                  </button>
                  <button 
                      onClick={togglePlay}
                      className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 transition-colors text-black text-[10px] font-bold rounded uppercase tracking-widest shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                  >
                      {isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>
                  <div className="flex bg-black/40 border border-white/5 p-0.5 rounded">
                    <button onClick={() => songPlayer.setMode('practice')} className={`px-2 py-1 text-[9px] rounded uppercase ${mode === 'practice' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>Practica</button>
                    <button onClick={() => songPlayer.setMode('rhythm')} className={`px-2 py-1 text-[9px] rounded uppercase ${mode === 'rhythm' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>Ritmo</button>
                    <button onClick={() => songPlayer.setMode('listen')} className={`px-2 py-1 text-[9px] rounded uppercase ${mode === 'listen' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>Escuchar</button>
                  </div>
                  </>
                )}
                

                {(mode === 'practice' || mode === 'rhythm') && (
                  <div className="flex gap-4 border-l border-white/10 pl-4">
                      <div className="flex flex-col items-center">
                          <span className="text-[9px] uppercase tracking-widest text-slate-500">Combo</span>
                          <span className="text-sm font-mono text-cyan-400 font-bold">{scoreStats.combo}</span>
                      </div>
                      <div className="flex flex-col items-center">
                          <span className="text-[9px] uppercase tracking-widest text-slate-500">Hits</span>
                          <span className="text-sm font-mono text-green-400 font-bold">{scoreStats.correct}</span>
                      </div>
                      <div className="flex flex-col items-center">
                          <span className="text-[9px] uppercase tracking-widest text-slate-500">Miss</span>
                          <span className="text-sm font-mono text-red-400 font-bold">{scoreStats.missed}</span>
                      </div>
                  </div>
                )}
            </div>
          </div>
          
          {/* Summary Overlay */}
          {isComplete && (
            <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-[#0f1115] border border-white/10 p-8 rounded-xl shadow-2xl flex flex-col items-center max-w-md w-full">
                   <h2 className="text-xl text-white font-bold tracking-widest uppercase mb-6">Práctica Completada</h2>
                   
                   <div className="w-full space-y-4 mb-8">
                       <div className="flex justify-between items-center border-b border-white/5 pb-2">
                           <span className="text-slate-400 text-sm">Precisión</span>
                           <span className="text-2xl font-mono text-cyan-400">
                               {Math.round((scoreStats.correct / scoreStats.totalStrokes) * 100)}%
                           </span>
                       </div>
                       <div className="flex justify-between items-center border-b border-white/5 pb-2">
                           <span className="text-slate-400 text-sm">Error de Tiempo (Promedio)</span>
                           <span className="text-xl font-mono text-amber-400">
                               ±{Math.round(scoreStats.timingErrorMs)}ms
                           </span>
                       </div>
                       <div className="flex justify-between items-center border-b border-white/5 pb-2">
                           <span className="text-slate-400 text-sm">Combo Máximo</span>
                           <span className="text-xl font-mono text-green-400">
                               {scoreStats.maxCombo}
                           </span>
                       </div>
                   </div>
                   
                   <button 
                     onClick={() => {
                         songPlayer.resetPlayback();
                         setScoreStats(scoringEngine.stats);
                     }}
                     className="px-6 py-3 w-full bg-cyan-500 hover:bg-cyan-400 transition-colors text-black font-bold uppercase tracking-widest rounded"
                   >
                     Reintentar
                   </button>
                </div>
            </div>
          )}

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-cyan-500/50 uppercase tracking-[0.5em] whitespace-nowrap z-0 pointer-events-none">
             Audio Thread Active — Salamander Engine Latency: 12ms
          </div>
      </div>
  );
};
