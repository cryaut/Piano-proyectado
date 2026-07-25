import React, { useState, useEffect, useRef } from 'react';
import { recorder } from './Recorder';
import { Recording } from '../types';
import { songPlayer } from '../game/SongPlayer';

export const RecorderControls: React.FC = () => {
  const [isRecording, setIsRecording] = useState(recorder.isRecording);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  useEffect(() => {
    let timer: number | null = null;
    if (isRecording) {
      timer = window.setInterval(() => {
        setDurationMs(recorder.getDurationMs());
      }, 100);
    } else {
      setDurationMs(0);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [isRecording]);

  useEffect(() => {
    const handleStatus = () => setIsRecording(recorder.isRecording);
    const handleUpdated = () => setRecordings(recorder.getRecordings());
    
    // Notes hooking
    const handleNoteOn = (e: any) => recorder.handleNoteOn(e.detail.note, e.detail.velocity || 0.8);
    const handleNoteOff = (e: any) => recorder.handleNoteOff(e.detail.note);
    const handleSustain = (e: any) => recorder.handleSustain(e.detail.active);
    const handleToggleRecord = () => recorder.toggleRecording();

    window.addEventListener('recorder-status-change', handleStatus);
    window.addEventListener('recordings-updated', handleUpdated);
    window.addEventListener('piano-note-on', handleNoteOn);
    window.addEventListener('piano-note-off', handleNoteOff);
    window.addEventListener('piano-sustain-change', handleSustain);
    window.addEventListener('piano-toggle-record', handleToggleRecord);
    
    handleUpdated(); // load initial

    return () => {
        window.removeEventListener('recorder-status-change', handleStatus);
        window.removeEventListener('recordings-updated', handleUpdated);
        window.removeEventListener('piano-note-on', handleNoteOn);
        window.removeEventListener('piano-note-off', handleNoteOff);
        window.removeEventListener('piano-sustain-change', handleSustain);
        window.removeEventListener('piano-toggle-record', handleToggleRecord);
    };
  }, []);

  const preparePlay = (rec: Recording, mode: 'practice' | 'listen') => {
      const bpm = 120;
      const msPerBeat = 60000 / bpm;
      
      const payload = {
          title: rec.title,
          bpm,
          unit: 'beats',
          timeSignature: [4, 4],
          sustain: [], // optionally we can build it if we need, but for now we map it if we can
          // Actually, let's turn sustainEvents into SustainBlocks
          tracks: [{
             notes: rec.data.map(n => ({
                 pitch: n.note,
                 start: n.time / msPerBeat,
                 duration: n.duration / msPerBeat,
                 velocity: n.velocity
             }))
          }]
      };

      if (rec.sustainEvents && rec.sustainEvents.length > 0) {
          const blocks: {start: number, end: number}[] = [];
          let currentStart = -1;
          rec.sustainEvents.forEach(ev => {
              if (ev.value && currentStart === -1) {
                  currentStart = ev.time;
              } else if (!ev.value && currentStart !== -1) {
                  blocks.push({ start: currentStart / msPerBeat, end: ev.time / msPerBeat });
                  currentStart = -1;
              }
          });
          if (currentStart !== -1) {
              blocks.push({ start: currentStart / msPerBeat, end: rec.durationMs / msPerBeat });
          }
          (payload as any).sustain = blocks;
      }
      
      songPlayer.loadSong(payload);
      songPlayer.setMode(mode);
      songPlayer.togglePlay();
  };

  const handleExportMidi = (rec: Recording) => {
      const blob = recorder.generateMidiFile(rec);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rec.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleExportJson = (rec: Recording) => {
       const bpm = 120;
       const msPerBeat = 60000 / bpm;
       const payload = {
          title: rec.title,
          bpm,
          unit: 'beats',
          timeSignature: [4, 4],
          sustain: [] as {start: number, end: number}[],
          tracks: [{
             notes: rec.data.map(n => ({
                 pitch: n.note,
                 start: n.time / msPerBeat,
                 duration: n.duration / msPerBeat,
                 velocity: n.velocity
             }))
          }]
       };
       if (rec.sustainEvents && rec.sustainEvents.length > 0) {
          let currentStart = -1;
          rec.sustainEvents.forEach(ev => {
              if (ev.value && currentStart === -1) {
                  currentStart = ev.time;
              } else if (!ev.value && currentStart !== -1) {
                  payload.sustain.push({ start: currentStart / msPerBeat, end: ev.time / msPerBeat });
                  currentStart = -1;
              }
          });
          if (currentStart !== -1) {
              payload.sustain.push({ start: currentStart / msPerBeat, end: rec.durationMs / msPerBeat });
          }
       }
       const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `${rec.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
  };

  const handleDelete = (id: string) => {
      if (confirm('¿Eliminar grabación?')) {
          recorder.deleteRecording(id);
      }
  };

  const formatTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTitleDoubleClick = (rec: Recording) => {
      setEditingId(rec.id);
      setEditTitle(rec.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter') {
          recorder.renameRecording(id, editTitle);
          setEditingId(null);
      } else if (e.key === 'Escape') {
          setEditingId(null);
      }
  };

  return (
    <>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4">
            <button
                onClick={() => recorder.toggleRecording()}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${
                    isRecording 
                    ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] border border-red-400' 
                    : 'bg-black/50 text-white border border-white/10 hover:bg-black/70 backdrop-blur-md'
                }`}
            >
                <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-red-500'}`}></div>
                {isRecording ? `GRABANDO ${formatTime(durationMs)} / 4:00` : 'GRABAR'}
            </button>
            <button
                onClick={() => setShowPanel(!showPanel)}
                className="bg-black/50 backdrop-blur-md text-white border border-white/10 hover:bg-black/70 px-4 py-2 rounded-full font-bold text-sm"
            >
                Mis Grabaciones ({recordings.length}/20)
            </button>
        </div>

        {isRecording && (
            <div className={`absolute inset-0 pointer-events-none border-[3px] z-50 rounded-lg transition-colors ${Math.floor(durationMs / 500) % 2 === 0 ? 'border-red-500/50' : 'border-transparent'}`}></div>
        )}

        {showPanel && (
            <div className="absolute right-4 top-20 w-80 bg-[#0a0a0f] border border-white/10 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden max-h-[70vh]">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40">
                    <h3 className="text-white font-bold tracking-widest text-sm uppercase">Mis Grabaciones</h3>
                    <button onClick={() => setShowPanel(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                    {recordings.length === 0 ? (
                        <div className="text-center p-8 text-slate-500 text-sm">
                            No hay grabaciones todavía. Presiona GRABAR para empezar.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recordings.map(rec => (
                                <div key={rec.id} className="bg-white/5 p-3 rounded group hover:bg-white/10 transition-colors">
                                    {editingId === rec.id ? (
                                        <input 
                                           autoFocus
                                           type="text" 
                                           value={editTitle}
                                           onChange={e => setEditTitle(e.target.value)}
                                           onBlur={() => { recorder.renameRecording(rec.id, editTitle); setEditingId(null); }}
                                           onKeyDown={e => handleKeyDown(e, rec.id)}
                                           className="w-full bg-black/50 border border-cyan-500 text-white px-2 py-1 mb-1 rounded text-sm"
                                        />
                                    ) : (
                                        <h4 className="text-white font-medium text-sm mb-1 cursor-pointer" onDoubleClick={() => handleTitleDoubleClick(rec)} title="Doble clic para editar">{rec.title}</h4>
                                    )}
                                    <div className="text-xs text-slate-400 mb-3 flex gap-4">
                                        <span>{(rec.durationMs / 1000).toFixed(1)}s</span>
                                        <span>{rec.noteCount} notas</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => preparePlay(rec, 'listen')} className="text-[10px] uppercase tracking-wider bg-purple-500/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-500/30">
                                            ▶ Escuchar
                                        </button>
                                        <button onClick={() => preparePlay(rec, 'practice')} className="text-[10px] uppercase tracking-wider bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded hover:bg-cyan-500/30">
                                            🎮 Jugar
                                        </button>
                                        <button onClick={() => handleExportMidi(rec)} className="text-[10px] uppercase tracking-wider bg-white/10 text-white px-2 py-1 rounded hover:bg-white/20" title="Descargar MIDI">
                                            MIDI
                                        </button>
                                        <button onClick={() => handleExportJson(rec)} className="text-[10px] uppercase tracking-wider bg-white/10 text-white px-2 py-1 rounded hover:bg-white/20" title="Descargar JSON">
                                            JSON
                                        </button>
                                        <button onClick={() => handleDelete(rec.id)} className="text-[10px] uppercase tracking-wider bg-red-500/10 text-red-400 px-2 py-1 rounded ml-auto hover:bg-red-500/20">
                                            Borrar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}
    </>
  );
};
