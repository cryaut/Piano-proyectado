import React from 'react';
import { ImporterUI } from '../import/ImporterUI';
import { songPlayer } from './SongPlayer';

export const SongSelectionView: React.FC<{ onPlay: () => void }> = ({ onPlay }) => {
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0f] p-8 overflow-y-auto">
            <h2 className="text-3xl font-bold tracking-widest text-white uppercase mb-8">Seleccionar Canción</h2>
            
            {songPlayer.currentSong && (
                <div className="w-full max-w-4xl bg-cyan-500/10 border border-cyan-500/50 rounded-xl p-6 shadow-xl mb-8 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm uppercase tracking-widest text-cyan-400 font-bold mb-1">Canción Actual</h3>
                        <p className="text-xl text-white font-bold">{songPlayer.currentSong.title}</p>
                        <p className="text-xs text-cyan-500/70">{songPlayer.currentSong.notes.length} notas &middot; {songPlayer.currentSong.bpm} BPM</p>
                    </div>
                    <button 
                        onClick={() => {
                            songPlayer.setMode('practice');
                            onPlay();
                        }}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-3 rounded-lg font-bold uppercase tracking-wider transition-colors"
                    >
                        ▶ Jugar Ahora
                    </button>
                </div>
            )}

            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
                {/* Column 1: Import */}
                <div className="flex flex-col gap-6">
                    <div className="bg-[#0f1115] border border-white/5 rounded-xl p-6 shadow-xl">
                        <h3 className="text-sm uppercase tracking-widest text-cyan-500 font-bold mb-4">Importar Externa</h3>
                        <ImporterUI onImportSuccess={() => {
                            songPlayer.setMode('practice');
                            onPlay();
                        }} />
                        <div className="mt-4 text-xs text-slate-500 bg-white/5 p-3 rounded">
                            Compatible con MIDI, MusicXML, ABC Notation y formato interno JSON.
                        </div>
                    </div>
                </div>

                {/* Column 2: Default List */}
                <div className="flex flex-col gap-6">
                    <div className="bg-[#0f1115] border border-white/5 rounded-xl p-6 shadow-xl h-full flex flex-col">
                        <h3 className="text-sm uppercase tracking-widest text-cyan-500 font-bold mb-4">Repertorio</h3>
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                            <p>Usa el botón de la izquierda para cargar una canción nueva.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
