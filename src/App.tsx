import React, { useEffect, useState, useRef } from 'react';
import { PianoKeyboard } from './ui/PianoKeyboard';
import { InstrumentSelector } from './ui/InstrumentSelector';
import { NoteHighway } from './game/NoteHighway';
import { keyHandler } from './input/KeyHandler';
import { midiBridge, MidiDevice } from './input/MidiBridge';
import { velocitySimulator } from './input/VelocitySimulator';
import { SettingsModal } from './ui/SettingsModal';
import { engine } from './audio/PianoEngine';
import { irokHidBridge, HidKeyboardDevice } from './input/IrokHidBridge';
import confetti from 'canvas-confetti';

import { RecorderControls } from './record/RecorderControls';
import { RecordingsView } from './record/RecordingsView';
import { SongEditor } from './editor/SongEditor';
import { SongSelectionView } from './game/SongSelectionView';
import { songPlayer } from './game/SongPlayer';
import { KeyTesterPanel } from './debug/KeyTesterPanel';
import { inputDebug } from './debug/InputDebug';

export default function App() {
  const [sustainOn, setSustainOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentSection, setCurrentSection] = useState<'free' | 'play' | 'recordings' | 'editor'>('free');
  const [isFading, setIsFading] = useState(false);

  const changeSection = (newSection: 'free' | 'play' | 'recordings' | 'editor') => {
    if (newSection === currentSection || isFading) return;
    engine.releaseAll();
    keyHandler.releaseAll();
    if (newSection !== 'play') {
      songPlayer.resetPlayback();
    }
    setIsFading(true);
    setTimeout(() => {
      setCurrentSection(newSection);
      setIsFading(false);
    }, 200);
  };
  const [activeMidiDevice, setActiveMidiDevice] = useState<MidiDevice | null>(midiBridge.getActiveDevice());
  const [activeHidDevice, setActiveHidDevice] = useState<HidKeyboardDevice | null>(irokHidBridge.activeDevice);
  const [loadingProgress, setLoadingProgress] = useState(engine.isReady ? 1 : 0);
  const [isReady, setIsReady] = useState(engine.isReady);
  const [hasStartedContext, setHasStartedContext] = useState(false);
  const [useFallbackMessage, setUseFallbackMessage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [octaveOffset, setOctaveOffset] = useState(keyHandler.octaveOffset);
  const playedNotesRef = useRef<{note: string, time: number}[]>([]);
  const [, setForceRender] = useState(0);

  useEffect(() => {
    inputDebug.setAppMode(currentSection);
  }, [currentSection]);

  useEffect(() => {
    inputDebug.setOctaveOffset(octaveOffset);
  }, [octaveOffset]);

  useEffect(() => {
    return songPlayer.subscribe(() => {
        setForceRender(prev => prev + 1);
    });
  }, []);
  
  useEffect(() => {
    // Shared URL Detection
    const params = new URLSearchParams(window.location.search);
    const sharedSong = params.get('song');
    if (sharedSong) {
        try {
            const decoded = JSON.parse(atob(sharedSong));
            if (decoded && decoded.tracks && decoded.bpm) {
                if (window.confirm(`Se detectó una canción compartida: '${decoded.title || 'Nueva Canción'}'. ¿Cargar y jugar?`)) {
                    songPlayer.loadSong(decoded);
                    songPlayer.setMode('practice');
                    setCurrentSection('play'); // Switch to play
                }
                // Clear the parameter
                window.history.replaceState(null, '', window.location.pathname);
            }
        } catch (e) {
            console.error("Invalid shared song data", e);
        }
    }
  }, []);

  useEffect(() => {
    keyHandler.init();
    midiBridge.init();
    irokHidBridge.init().catch(() => {});
    
    const handleSustain = (e: CustomEvent<{active: boolean}>) => {
      setSustainOn(e.detail.active);
    };
    
    const handleMidiDeviceSelected = (e: any) => {
      setActiveMidiDevice(e.detail.device);
    };
    const handleHidDeviceSelected = (e: any) => {
      setActiveHidDevice(e.detail.device);
    };
    const handleHidDevicesChanged = (e: any) => {
      setActiveHidDevice(e.detail.activeDevice);
    };

    const handleLoading = (e: any) => {
      setLoadingProgress(e.detail.progress);
    };
    
    const handleReady = () => {
      setIsReady(true);
    };

    const handleError = () => {
      setUseFallbackMessage(true);
    };

    const handleBlur = () => {
      keyHandler.releaseAll();
      engine.releaseAll();
      engine.setSustain(false);
      window.dispatchEvent(new Event('piano-blur'));
    };

    const handleOctaveChange = (e: CustomEvent<{offset: number}>) => {
      setOctaveOffset(e.detail.offset);
    };

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === 'Escape') {
        setShowSettings(false);
        if (document.fullscreenElement) {
           document.exitFullscreen().catch(() => {});
           setIsFullscreen(false);
        }
      }
    };

    const handleNoteOn = (e: any) => {
      const note = e.detail.note;
      const now = Date.now();
      const newHistory = [...playedNotesRef.current, { note, time: now }].slice(-8);
      playedNotesRef.current = newHistory;

      // Check for C Major Scale
      if (newHistory.length === 8) {
        const scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
        const isMatch = newHistory.every((n, i) => n.note === scale[i]);
        if (isMatch) {
          const duration = newHistory[7].time - newHistory[0].time;
          if (duration < 3000) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#06b6d4', '#8b5cf6', '#ffffff']
            });
            playedNotesRef.current = []; // reset
          }
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('piano-sustain-change', handleSustain as EventListener);
    window.addEventListener('piano-octave-change', handleOctaveChange as EventListener);
    window.addEventListener('midi-device-selected', handleMidiDeviceSelected);
    window.addEventListener('piano-hid-device-selected', handleHidDeviceSelected);
    window.addEventListener('piano-hid-devices-changed', handleHidDevicesChanged);
    window.addEventListener('piano-engine-loading', handleLoading);
    window.addEventListener('piano-engine-ready', handleReady);
    window.addEventListener('piano-engine-error', handleError);
    window.addEventListener('piano-note-on', handleNoteOn);
    
    return () => {
      keyHandler.cleanup();
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('piano-sustain-change', handleSustain as EventListener);
      window.removeEventListener('piano-octave-change', handleOctaveChange as EventListener);
      window.removeEventListener('midi-device-selected', handleMidiDeviceSelected);
      window.removeEventListener('piano-hid-device-selected', handleHidDeviceSelected);
      window.removeEventListener('piano-hid-devices-changed', handleHidDevicesChanged);
      window.removeEventListener('piano-engine-loading', handleLoading);
      window.removeEventListener('piano-engine-ready', handleReady);
      window.removeEventListener('piano-engine-error', handleError);
      window.removeEventListener('piano-note-on', handleNoteOn);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const startInteraction = async () => {
    await engine.startAudioContext();
    setHasStartedContext(true);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0f] text-slate-300 font-sans overflow-hidden select-none relative">
      {!hasStartedContext && (
        <div 
          className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center cursor-pointer"
          onClick={startInteraction}
        >
          <div className="w-20 h-20 bg-cyan-500/20 border border-cyan-500 rounded-full flex items-center justify-center mb-6 animate-pulse shadow-[0_0_30px_rgba(6,182,212,0.5)]">
            <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-cyan-400 border-b-[12px] border-b-transparent ml-2"></div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">RealPiano Studio</h2>
          <p className="text-sm tracking-widest uppercase text-cyan-400 font-bold mb-8">Haz clic en la pantalla para empezar</p>
          <p className="text-xs text-slate-500 max-w-sm text-center">Iniciando el motor de audio web. Asegúrate de tener el volumen encendido.</p>
        </div>
      )}

      {!isReady && hasStartedContext && (
        <div className="absolute inset-0 z-50 bg-[#0a0a0f] flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-8"></div>
          <h2 className="text-xl font-bold tracking-widest uppercase text-white mb-4">Calentando el piano...</h2>
          <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* TOP HUD / HEADER */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-white/5 bg-[#0f1115] shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center rounded hidden lg:flex">
            <div className="w-4 h-4 bg-cyan-500 rounded-sm shadow-[0_0_10px_rgba(6,182,212,0.6)]"></div>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">RealPiano Studio <span className="text-[10px] text-cyan-500 border border-cyan-500/40 px-1 rounded ml-1 uppercase hidden lg:inline">v1.0</span></h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 hidden lg:block">Professional Sample Engine</p>
          </div>
        </div>

        <nav className="hidden md:flex bg-black/40 border border-white/5 p-1 rounded-lg">
           <button onClick={() => changeSection('free')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors uppercase tracking-wider ${currentSection === 'free' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'}`}>🎹 Libre</button>
           <button onClick={() => changeSection('play')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors uppercase tracking-wider ${currentSection === 'play' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'}`}>🎮 Jugar</button>
           <button onClick={() => changeSection('recordings')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors uppercase tracking-wider ${currentSection === 'recordings' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'}`}>⏺ Grabaciones</button>
           <button onClick={() => changeSection('editor')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors uppercase tracking-wider ${currentSection === 'editor' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'}`}>✏️ Editor</button>
        </nav>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-center hidden lg:flex">
            <span className="text-[9px] uppercase text-slate-500 tracking-tighter">Tempo</span>
            <span className="text-xl font-mono font-medium text-cyan-400">090 <span className="text-[10px] text-slate-600">BPM</span></span>
          </div>
          <div className="h-8 w-px bg-white/10 hidden sm:block"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase text-slate-500 tracking-tighter hidden sm:inline">Octave</span>
            <div className="flex items-center gap-2">
              <button type="button" className={`p-1 border border-white/10 rounded hover:bg-white/5 text-[10px] ${octaveOffset <= -2 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} disabled={octaveOffset <= -2} onClick={() => keyHandler.shiftOctave(-1)} aria-label="Bajar octava">←</button>
              <span className="text-base sm:text-lg font-mono text-white tabular-nums">{octaveOffset > 0 ? `+${octaveOffset}` : octaveOffset}</span>
              <button type="button" className={`p-1 border border-white/10 rounded hover:bg-white/5 text-[10px] ${octaveOffset >= 2 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} disabled={octaveOffset >= 2} onClick={() => keyHandler.shiftOctave(1)} aria-label="Subir octava">→</button>
            </div>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase text-slate-500 tracking-tighter">Input</span>
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowSettings(true)}>
              {activeMidiDevice ? (
                <>
                  <span className="text-[10px] sm:text-[11px] font-medium text-cyan-400">🎹 <span className="hidden sm:inline">{activeMidiDevice.name}</span><span className="sm:hidden">MIDI</span></span>
                  <div className="w-2 h-2 rounded-full bg-cyan-400/40 border border-cyan-400"></div>
                </>
              ) : activeHidDevice ? (
                <>
                  <span className="text-[10px] sm:text-[11px] font-medium text-cyan-400">HID <span className="hidden sm:inline">{activeHidDevice.name}</span><span className="sm:hidden">IROK</span></span>
                  <div className="w-2 h-2 rounded-full bg-cyan-400/40 border border-cyan-400"></div>
                </>
              ) : (
                <>
                  <span className="text-[10px] sm:text-[11px] font-medium text-amber-500">⌨️ <span className="hidden sm:inline">Teclado</span></span>
                  <div className="w-2 h-2 rounded-full bg-amber-500/40 border border-amber-500"></div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative" style={{ transition: 'opacity 0.2s ease-in-out', opacity: isFading ? 0 : 1 }}>
        {currentSection === 'free' && (
          <RecorderControls />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {currentSection === 'editor' && <SongEditor onClose={() => changeSection('free')} onPlaySong={() => changeSection('play')} />}
        {currentSection === 'play' && !engine.isReady /* temp fix while loading ? */ && null}
        
        {/* LEFT SIDEBAR: INSTRUMENTS (hidden on small) */}
        {(currentSection === 'free' || currentSection === 'play') && (
          <aside className="w-64 border-r border-white/5 bg-[#0f1115] p-4 hidden md:flex flex-col gap-4">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-2">Instrument Engine</h2>
            
            <InstrumentSelector />

            <div className="mt-auto p-4 rounded-lg bg-[#0a0a0f] border border-white/5 text-xs text-slate-500 leading-relaxed">
              Los presets aplican efectos reales desde el selector de instrumento. Los medidores simulados se quitaron para evitar información falsa.
            </div>
          </aside>
        )}

        {currentSection === 'play' && !songPlayer.currentSong && (
           <div className="flex-1 absolute inset-0 z-40 bg-[#0a0a0f]">
              <SongSelectionView onPlay={() => { songPlayer.togglePlay(); }} />
           </div>
        )}

        {/* CENTER: PIANO ROLL & KEYBOARD */}
        {(currentSection === 'free' || currentSection === 'play') && (
          <section className="flex-1 flex flex-col relative min-w-0">
            {/* NOTE HIGHWAY */}
            <div className="flex-1 bg-[#050608] relative border-b border-white/10 hidden sm:block">
              <NoteHighway />
            </div>

            {/* KEYBOARD SECTION */}
            <div className="flex-1 sm:flex-none sm:h-[340px] bg-[#0a0a0f] p-2 sm:p-4 flex flex-col min-h-[50%]">
              <PianoKeyboard />

              {/* CONTROL OVERLAY */}
              <div className="flex items-center justify-between mt-2 sm:mt-4 px-2">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-3 sm:w-8 sm:h-4 rounded-full p-0.5 flex transition-colors ${sustainOn ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'}`}>
                      <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full shadow-sm transition-colors ${sustainOn ? 'bg-white' : 'bg-slate-400'}`}></div>
                    </div>
                    <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors ${sustainOn ? 'text-white' : 'text-slate-400'}`}>
                      Sustain <span className="text-cyan-500 ml-1 hidden sm:inline">(Space)</span>
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 items-center bg-[#16181d] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-white/5">
                   <button onClick={toggleFullscreen} className="px-2 sm:px-4 py-1 sm:py-1.5 border border-white/5 bg-white/5 text-slate-300 text-[10px] sm:text-xs font-bold rounded uppercase tracking-widest hover:bg-white/10 transition-colors">
                      {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                   </button>
                </div>
              </div>
            </div>
          </section>
        )}
        
        {currentSection === 'recordings' && (
          <RecordingsView onPlay={() => changeSection('play')} />
        )}
      </main>

      <KeyTesterPanel />

      {/* BOTTOM STATUS BAR (Hidden on mobile) */}
      <footer className="h-8 px-6 bg-[#050608] border-t border-white/5 items-center justify-between text-[10px] font-mono shrink-0 hidden md:flex">
        <div className="flex gap-6">
          <span className="text-slate-500">CPU LOAD: <span className="text-green-500">2.4%</span></span>
          <span className="text-slate-500 hidden sm:block">SAMPLES LOADED: <span className={useFallbackMessage ? "text-amber-400" : "text-slate-300"}>{useFallbackMessage ? "FMSynth Fallback" : "Tone.js"}</span></span>
        </div>
        <div className="flex gap-4">
          <span className="text-slate-500 hidden sm:block">MAP: <span className="text-cyan-500">ISO-3-ROW-QWERTY</span></span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            AUDIO ENGINE STABLE
          </span>
        </div>
      </footer>
    </div>
  );
}
