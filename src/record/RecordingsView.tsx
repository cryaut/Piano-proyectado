import React, { useEffect, useState } from 'react';
import { recorder } from './Recorder';
import { Recording } from '../types';
import { songPlayer } from '../game/SongPlayer';

const formatTime = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const recordingToPayload = (rec: Recording) => {
  const bpm = 120;
  const msPerBeat = 60000 / bpm;
  const sustain: { start: number; end: number }[] = [];

  if (rec.sustainEvents) {
    let currentStart = -1;
    rec.sustainEvents.forEach(ev => {
      if (ev.value && currentStart === -1) currentStart = ev.time;
      else if (!ev.value && currentStart !== -1) {
        sustain.push({ start: currentStart / msPerBeat, end: ev.time / msPerBeat });
        currentStart = -1;
      }
    });
    if (currentStart !== -1) sustain.push({ start: currentStart / msPerBeat, end: rec.durationMs / msPerBeat });
  }

  return {
    title: rec.title,
    bpm,
    timeSignature: [4, 4] as [number, number],
    sustain,
    tracks: [{
      notes: rec.data.map(n => ({
        pitch: n.note,
        start: n.time / msPerBeat,
        duration: n.duration / msPerBeat,
        velocity: n.velocity,
      })),
    }],
  };
};

export const RecordingsView: React.FC<{ onPlay?: () => void }> = ({ onPlay }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    const load = () => setRecordings(recorder.getRecordings());
    window.addEventListener('recordings-updated', load);
    load();
    return () => window.removeEventListener('recordings-updated', load);
  }, []);

  const preparePlay = (rec: Recording, mode: 'practice' | 'listen') => {
    songPlayer.loadSong(recordingToPayload(rec));
    songPlayer.setMode(mode);
    songPlayer.togglePlay();
    onPlay?.();
  };

  const exportMidi = (rec: Recording) => {
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

  const exportJson = (rec: Recording) => {
    const blob = new Blob([JSON.stringify(recordingToPayload(rec), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveTitle = (id: string) => {
    const title = editTitle.trim();
    if (title) recorder.renameRecording(id, title);
    setEditingId(null);
  };

  return (
    <section className="absolute inset-0 z-40 bg-[#0a0a0f] overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6 sm:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white tracking-tight">Grabaciones</h2>
            <p className="text-sm text-slate-500">Gestiona, reproduce, renombra, exporta o elimina tus tomas guardadas.</p>
          </div>
          <div className="text-xs font-mono text-slate-500">{recordings.length}/20 guardadas</div>
        </div>

        {recordings.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/3 p-10 text-center text-slate-500">
            No hay grabaciones todavía. Vuelve a Libre y pulsa Grabar para capturar una interpretación.
          </div>
        ) : (
          <div className="grid gap-3">
            {recordings.map(rec => (
              <article key={rec.id} className="grid gap-3 rounded-lg border border-white/10 bg-[#101318] p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  {editingId === rec.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => saveTitle(rec.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveTitle(rec.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="mb-2 w-full max-w-lg rounded border border-cyan-500/50 bg-black/40 px-3 py-2 text-white outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingId(rec.id); setEditTitle(rec.title); }}
                      className="block truncate text-left text-base font-medium text-white hover:text-cyan-300"
                      title="Click para renombrar"
                    >
                      {rec.title}
                    </button>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{formatTime(rec.durationMs)}</span>
                    <span>{rec.noteCount} notas</span>
                    <span>{new Date(rec.date).toLocaleString()}</span>
                    <span>{rec.instrument}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button onClick={() => preparePlay(rec, 'listen')} className="rounded border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-purple-200 hover:bg-purple-500/20">Escuchar</button>
                  <button onClick={() => preparePlay(rec, 'practice')} className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-200 hover:bg-cyan-500/20">Jugar</button>
                  <button onClick={() => exportMidi(rec)} className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-white/10">MIDI</button>
                  <button onClick={() => exportJson(rec)} className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-white/10">JSON</button>
                  <button onClick={() => confirm('¿Eliminar grabación?') && recorder.deleteRecording(rec.id)} className="rounded border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-300 hover:bg-red-500/20">Borrar</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
