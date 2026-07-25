import React, { useCallback, useState } from 'react';
import { FormatParser, ParsedSong } from './FormatParser';
import { songPlayer } from '../game/SongPlayer';

export const ImporterUI: React.FC<{ onImportSuccess?: () => void }> = ({ onImportSuccess }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [pendingSong, setPendingSong] = useState<ParsedSong | null>(null);
    const [selectedTracks, setSelectedTracks] = useState<number[]>([]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleFile = async (file: File) => {
        try {
            const parsed = await FormatParser.parseFile(file);
            
            if (parsed.tracks.length > 1) {
                // Show multiple tracks modal if more than one track with notes
                const trackListWithNotes = parsed.tracks.filter(t => t.notes.length > 0);
                if (trackListWithNotes.length > 1) {
                    setPendingSong(parsed);
                    setSelectedTracks([0]); // Default select first
                    return;
                }
            }
            
            finalizeImport(parsed, [0]);
        } catch (err: any) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };

    const finalizeImport = (song: ParsedSong, tracksToKeep: number[]) => {
        // Merge notes from selected tracks
        const mergedNotes = tracksToKeep.flatMap(i => song.tracks[i].notes);
        // Ensure they are sorted
        mergedNotes.sort((a, b) => a.start - b.start);
        
        const finalSong = { ...song, tracks: [{ name: 'Merged', notes: mergedNotes }] };
        
        songPlayer.loadSong(finalSong);
        showToast(`✓ Importado: ${finalSong.title}, ${mergedNotes.length} notas, ${finalSong.bpm} BPM`, 'success');
        setPendingSong(null);
        if (onImportSuccess) onImportSuccess();
    };

    const toggleTrack = (idx: number) => {
        setSelectedTracks(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, []);

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    if (pendingSong) {
        return (
            <div className="w-full text-left">
                <h4 className="text-white font-bold mb-2">Se detectaron múltiples tracks</h4>
                <p className="text-xs text-slate-400 mb-4">El archivo MIDI ({pendingSong.title}) contiene varios tracks. Selecciona los que deseas importar y combinar:</p>
                <div className="space-y-2 mb-6 max-h-48 overflow-y-auto pr-2">
                    {pendingSong.tracks.map((track, i) => (
                        <div key={i} 
                             onClick={() => toggleTrack(i)}
                             className={`cursor-pointer border p-3 rounded flex items-center justify-between transition-colors
                                ${selectedTracks.includes(i) ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10 hover:bg-white/5'}
                             `}>
                            <div>
                                <h5 className="text-sm text-white font-bold">{track.name || `Track ${i+1}`}</h5>
                                <span className="text-[10px] text-slate-500">{track.notes.length} notas</span>
                            </div>
                            <div className={`w-5 h-5 rounded border ${selectedTracks.includes(i) ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'} flex items-center justify-center`}>
                                {selectedTracks.includes(i) && <span className="text-white text-xs">✓</span>}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-4">
                    <button onClick={() => setPendingSong(null)} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-white/10 rounded">Cancelar</button>
                    <button 
                       onClick={() => finalizeImport(pendingSong, selectedTracks)}
                       className="flex-1 py-2 text-sm bg-cyan-500 text-black font-bold rounded hover:bg-cyan-400 disabled:opacity-50"
                       disabled={selectedTracks.length === 0}
                    >
                        Importar Selección
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full mx-auto">
            {toast && (
                <div className={`absolute -top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm font-bold z-50 whitespace-nowrap transition-opacity
                  ${toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}
                >
                    {toast.message}
                </div>
            )}
            
            <div 
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                    ${isDragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-600 bg-[#1a1c23] hover:border-slate-500 hover:bg-[#22252e]'}`}
            >
                <input 
                    type="file" 
                    accept=".mid,.midi,.xml,.mxl,.abc,.json" 
                    onChange={handleFileInput}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="Arrastra o haz clic para importar"
                />
                <div className="pointer-events-none">
                    <div className="text-3xl mb-3">📁</div>
                    <h3 className="text-white font-bold text-lg mb-1">Importar canción</h3>
                    <p className="text-slate-400 text-sm">Arrastra tu archivo aquí o haz clic</p>
                    <p className="text-slate-500 text-xs mt-2 mt-4 inline-flex gap-2 justify-center">
                        <span className="bg-white/5 px-2 py-1 rounded">.mid</span>
                        <span className="bg-white/5 px-2 py-1 rounded">.xml</span>
                        <span className="bg-white/5 px-2 py-1 rounded">.abc</span>
                        <span className="bg-white/5 px-2 py-1 rounded">.json</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
