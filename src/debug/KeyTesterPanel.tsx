import React, { useMemo, useSyncExternalStore } from 'react';
import { inputDebug, InputDebugSettings, PianoInputDebugEvent, PianoInputDebugSource } from './InputDebug';

const SOURCES: Array<'all' | PianoInputDebugSource> = ['all', 'qwerty', 'pointer', 'midi', 'hid', 'song-player', 'editor-preview', 'audio-engine', 'visual', 'system'];

const TEST_STEPS = [
  'QWERTY: press/release every mapped key',
  'QWERTY: Shift layer produces only black keys or no-note',
  'QWERTY: hold a key, change octave, release',
  'QWERTY: hold simultaneous chords',
  'QWERTY: verify repeated keydown is ignored/logged',
  'QWERTY: type inside editor/input fields',
  'Pointer: center of every white key',
  'Pointer: center and edges of every black key',
  'Pointer: below black keys and between key seams',
  'Pointer: slide white→black and black→white',
  'Lifecycle: switch Free→Game→Editor while holding notes',
  'Lifecycle: window blur/tab hidden while notes are active',
  'Lifecycle: releaseAll while notes are active',
];

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();
const midiLabel = (noteName?: string, midi?: number) => noteName || midi === undefined ? (noteName ?? '—') : `MIDI ${midi}`;

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
};

const exportJson = (events: PianoInputDebugEvent[]) => {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `realpiano-key-tester-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Field: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-white/5 py-1">
    <dt className="text-slate-500 uppercase tracking-wide text-[10px]">{label}</dt>
    <dd className={`font-mono text-[11px] truncate ${warn ? 'text-red-300' : 'text-slate-200'}`}>{value ?? '—'}</dd>
  </div>
);

const LatestEventDetails: React.FC<{ event?: PianoInputDebugEvent }> = ({ event }) => {
  if (!event) {
    return <div className="p-4 text-slate-500 text-xs">No events yet. Press a mapped key or touch the piano.</div>;
  }

  return (
    <dl className="p-3 text-xs">
      <Field label="Result" value={event.matchLabel} warn={!event.match} />
      {event.mismatchReason && <Field label="Reason" value={event.mismatchReason} warn />}
      <Field label="Source / Action" value={`${event.source} / ${event.action}`} />
      <Field label="Time" value={formatTime(event.timestamp)} />
      <Field label="Mode" value={event.currentState.appMode} />
      <Field label="Octave" value={event.currentState.octaveOffset > 0 ? `+${event.currentState.octaveOffset}` : event.currentState.octaveOffset} />
      <Field label="Visible Range" value={`${event.currentState.visibleRange} (${event.currentState.firstVisibleMidiNote}-${event.currentState.lastVisibleMidiNote})`} />
      <Field label="Raw Key" value={event.rawInput?.key} />
      <Field label="Event Code" value={event.rawInput?.code} />
      <Field label="Modifiers" value={event.rawInput ? `shift=${event.rawInput.shiftKey ?? false} L=${event.rawInput.leftShift ?? false} R=${event.rawInput.rightShift ?? false} ctrl=${event.rawInput.ctrlKey ?? false}` : undefined} />
      <Field label="Repeat" value={event.rawInput?.repeat === undefined ? undefined : String(event.rawInput.repeat)} />
      <Field label="Row" value={event.mapping?.row} />
      <Field label="Pointer" value={event.rawInput?.pointerId === undefined ? undefined : `#${event.rawInput.pointerId} rel ${event.rawInput.relativeX?.toFixed(1)},${event.rawInput.relativeY?.toFixed(1)} client ${event.rawInput.clientX},${event.rawInput.clientY}`} />
      <Field label="Normal" value={midiLabel(event.mapping?.normalNoteName ?? event.mapping?.baseNoteName, event.mapping?.normalMidiNote ?? event.mapping?.baseMidiNote)} />
      <Field label="Shift Black" value={event.mapping?.noNoteReason ? event.mapping.noNoteReason : midiLabel(event.mapping?.shiftNoteName, event.mapping?.shiftMidiNote)} warn={event.mapping?.noNoteReason === 'no-black-key-above'} />
      <Field label="Resolved" value={midiLabel(event.resolvedInput?.noteName, event.resolvedInput?.midiNote)} />
      <Field label="Velocity" value={event.resolvedInput?.velocity?.toFixed(2)} />
      <Field label="Hitbox" value={event.pointerHitTest ? `${event.pointerHitTest.hitboxType ?? '—'} | black=${event.pointerHitTest.blackCandidate ?? '—'} white=${event.pointerHitTest.whiteCandidate ?? '—'} selected=${event.pointerHitTest.selectedNoteName ?? '—'}` : undefined} />
      <Field label="Highlighted" value={midiLabel(event.interfaceResult?.highlightedNoteName, event.interfaceResult?.highlightedMidiNote)} />
      <Field label="Audio Attack" value={event.audioResult?.attackedMidiNote === undefined ? undefined : `${event.audioResult.noteName} / MIDI ${event.audioResult.attackedMidiNote}`} />
      <Field label="Audio Release" value={event.audioResult?.releasedMidiNote === undefined ? undefined : `${event.audioResult.noteName} / MIDI ${event.audioResult.releasedMidiNote}`} />
      <Field label="Engine" value={event.audioResult ? `${event.audioResult.backend ?? '—'} ${event.audioResult.layer ?? ''} ready=${event.audioResult.engineReady ?? '—'}` : undefined} />
    </dl>
  );
};

const update = (partial: Partial<InputDebugSettings>) => inputDebug.updateSettings(partial);

export const KeyTesterPanel: React.FC = () => {
  const snapshot = useSyncExternalStore(inputDebug.subscribe.bind(inputDebug), inputDebug.getSnapshot.bind(inputDebug));
  const { events, settings, activeAudioNotes, activeVisualNotes, activeInputs, currentState } = snapshot;

  const visibleEvents = useMemo(() => {
    return events.filter(event => {
      if (settings.sourceFilter !== 'all' && event.source !== settings.sourceFilter) return false;
      if (settings.mismatchesOnly && event.match) return false;
      return true;
    });
  }, [events, settings.sourceFilter, settings.mismatchesOnly]);

  const latest = visibleEvents[0] ?? events[0];

  if (!settings.enabled) {
    return (
      <button
        type="button"
        onClick={() => update({ enabled: true })}
        className="fixed right-4 bottom-4 z-70 bg-[#101318] border border-cyan-500/40 text-cyan-300 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider shadow-xl hover:bg-[#161b22]"
      >
        Key Tester
      </button>
    );
  }

  return (
    <section className="fixed right-3 bottom-3 z-70 w-[min(520px,calc(100vw-1.5rem))] max-h-[78vh] bg-[#0b0d11]/95 border border-white/15 shadow-2xl backdrop-blur-md text-slate-200 flex flex-col rounded-md overflow-hidden">
      <header className="px-3 py-2 border-b border-white/10 bg-[#12161d] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Key Tester</h2>
          <p className="text-[10px] text-slate-500 font-mono truncate">{currentState.appMode} · octave {currentState.octaveOffset} · {currentState.visibleRange}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => update({ logging: !settings.logging })} className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${settings.logging ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>{settings.logging ? 'Logging' : 'Paused'}</button>
          <button onClick={() => inputDebug.clear()} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] uppercase">Clear</button>
          <button onClick={() => update({ enabled: false })} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] uppercase">Hide</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-0 border-b border-white/10 bg-black/15">
        <label className="px-3 py-2 text-[10px] uppercase text-slate-500 flex items-center gap-2">
          Source
          <select value={settings.sourceFilter} onChange={e => update({ sourceFilter: e.target.value as InputDebugSettings['sourceFilter'] })} className="min-w-0 flex-1 bg-[#171b22] border border-white/10 rounded px-2 py-1 text-slate-200 normal-case font-mono">
            {SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
          </select>
        </label>
        <label className="px-3 py-2 text-[10px] uppercase text-slate-500 flex items-center gap-2">
          Max
          <input type="number" min={25} max={2000} value={settings.maxEntries} onChange={e => update({ maxEntries: Number(e.target.value) })} className="w-20 bg-[#171b22] border border-white/10 rounded px-2 py-1 text-slate-200 font-mono" />
          entries
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-b border-white/10 bg-white/10 text-[10px]">
        <label className="bg-[#0b0d11] px-3 py-2 flex items-center gap-2"><input type="checkbox" checked={settings.mismatchesOnly} onChange={e => update({ mismatchesOnly: e.target.checked })} /> Mismatches</label>
        <label className="bg-[#0b0d11] px-3 py-2 flex items-center gap-2"><input type="checkbox" checked={settings.showActiveNotes} onChange={e => update({ showActiveNotes: e.target.checked })} /> Active notes</label>
        <label className="bg-[#0b0d11] px-3 py-2 flex items-center gap-2"><input type="checkbox" checked={settings.showPointerHitboxes} onChange={e => update({ showPointerHitboxes: e.target.checked })} /> Hitboxes</label>
        <label className="bg-[#0b0d11] px-3 py-2 flex items-center gap-2"><input type="checkbox" checked={settings.showGeometryOverlay} onChange={e => update({ showGeometryOverlay: e.target.checked })} /> Geometry</label>
        <label className="bg-[#0b0d11] px-3 py-2 flex items-center gap-2"><input type="checkbox" checked={settings.showNoteLabels} onChange={e => update({ showNoteLabels: e.target.checked })} /> Labels/MIDI</label>
      </div>

      {settings.showActiveNotes && (
        <div className="px-3 py-2 border-b border-white/10 grid grid-cols-3 gap-2 text-[10px] font-mono bg-black/20">
          <div><span className="text-slate-500 uppercase block font-sans">Visual</span>{activeVisualNotes.join(', ') || '—'}</div>
          <div><span className="text-slate-500 uppercase block font-sans">Audio</span>{activeAudioNotes.join(', ') || '—'}</div>
          <div><span className="text-slate-500 uppercase block font-sans">Inputs</span>{activeInputs.map(([input, note]) => `${input}:${note}`).join(', ') || '—'}</div>
        </div>
      )}

      <div className="grid md:grid-cols-[1.1fr_0.9fr] min-h-0 overflow-hidden">
        <div className="min-h-0 overflow-y-auto border-r border-white/10">
          <LatestEventDetails event={latest} />
        </div>
        <div className="min-h-0 overflow-y-auto">
          <div className="p-2 border-b border-white/10 flex flex-wrap gap-1">
            <button onClick={() => latest && copyText(JSON.stringify(latest, null, 2))} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] uppercase">Copy latest</button>
            <button onClick={() => copyText(JSON.stringify(visibleEvents, null, 2))} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] uppercase">Copy log</button>
            <button onClick={() => exportJson(visibleEvents)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] uppercase">Export JSON</button>
          </div>

          <div className="divide-y divide-white/5">
            {visibleEvents.slice(0, 80).map(event => (
              <button
                key={event.id}
                onClick={() => copyText(JSON.stringify(event, null, 2))}
                className={`w-full text-left px-3 py-2 hover:bg-white/5 ${event.match ? '' : 'bg-red-500/10 border-l-2 border-red-400'}`}
                title="Click to copy this event"
              >
                <div className="flex justify-between gap-2 text-[10px] uppercase">
                  <span className={event.match ? 'text-green-300' : 'text-red-300'}>{event.matchLabel}</span>
                  <span className="text-slate-500 font-mono">{formatTime(event.timestamp)}</span>
                </div>
                <div className="font-mono text-[11px] truncate text-slate-200">{event.source}/{event.action} · {event.resolvedInput?.noteName ?? event.audioResult?.noteName ?? event.interfaceResult?.highlightedNoteName ?? event.mapping?.finalNoteName ?? '—'}</div>
                {event.mismatchReason && <div className="text-[10px] text-red-300 truncate">{event.mismatchReason}</div>}
              </button>
            ))}
            {visibleEvents.length === 0 && <div className="p-4 text-xs text-slate-500">No events match the current filters.</div>}
          </div>
        </div>
      </div>

      <details className="border-t border-white/10 bg-[#0d1016]">
        <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400">Guided automatic key-test sequence</summary>
        <ol className="px-6 pb-3 list-decimal text-[11px] text-slate-400 grid sm:grid-cols-2 gap-x-5 gap-y-1">
          {TEST_STEPS.map(step => <li key={step}>{step}</li>)}
        </ol>
      </details>
    </section>
  );
};
