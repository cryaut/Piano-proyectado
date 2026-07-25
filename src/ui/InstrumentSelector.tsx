import React, { useEffect, useState } from 'react';
import { Play, Disc3, Radio, Piano, Library, Sparkles } from 'lucide-react';
import { engine } from '../audio/PianoEngine';
import { PRESETS } from '../audio/InstrumentPresets';

const Icons: Record<string, React.FC<any>> = {
  'acoustic-grand': Piano,
  'electric-piano': Radio,
  'soft-piano': Sparkles,
  'bright-piano': Disc3,
  'stage-piano': Library,
};

export const InstrumentSelector: React.FC = () => {
  const [activeId, setActiveId] = useState<string>('acoustic-grand');

  useEffect(() => {
    const saved = localStorage.getItem('realpiano_preset');
    if (saved && PRESETS.find(p => p.id === saved)) {
      setActiveId(saved);
      engine.applyPreset(saved);
    } else {
      engine.applyPreset('acoustic-grand');
    }
  }, []);

  const handleSelect = (id: string) => {
    setActiveId(id);
    localStorage.setItem('realpiano_preset', id);
    engine.applyPreset(id);
  };

  const handlePreviewEnter = () => {
    engine.startAudioContext();
    // Play Cmaj7 chord (C4, E4, G4, B4)
    engine.noteOn('C4', 0.7);
    engine.noteOn('E4', 0.6);
    engine.noteOn('G4', 0.6);
    engine.noteOn('B4', 0.65);
  };

  const handlePreviewLeave = () => {
    engine.noteOff('C4');
    engine.noteOff('E4');
    engine.noteOff('G4');
    engine.noteOff('B4');
  };

  return (
    <div className="space-y-2">
      {PRESETS.map((preset) => {
        const isActive = preset.id === activeId;
        const Icon = Icons[preset.id] || Piano;
        
        return (
          <div
            key={preset.id}
            onClick={() => handleSelect(preset.id)}
            className={`group relative flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer select-none overflow-hidden
              ${isActive 
                ? 'bg-cyan-500/10 border-cyan-500/30 text-white' 
                : 'bg-transparent border-transparent hover:bg-white/5 text-slate-400'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <Icon size={16} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none">{preset.name}</span>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 mt-1 truncate max-w-[120px]">
                  {preset.description}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onMouseEnter={handlePreviewEnter}
                onMouseLeave={handlePreviewLeave}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white pointer-events-auto"
                title="Preview Cmaj7 Chord"
                onClick={(e) => e.stopPropagation()} // Prevent selecting when previewing if we don't want to
              >
                <Play size={12} fill="currentColor" />
              </button>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

