import MidiParser from 'midi-parser-js';
import abcjs from 'abcjs';

// The returned parsed song uses the application's internal structure
export interface ParsedSong {
  title: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: Array<{
    name?: string;
    notes: Array<{
      pitch: string;
      start: number; // in beats
      duration: number; // in beats
      velocity: number;
      hand?: 'left' | 'right';
    }>;
  }>;
}

export const analyzeMidiFile = (arrayBuffer: ArrayBuffer): ParsedSong => {
  const uint8Array = new Uint8Array(arrayBuffer);
  // midi-parser-js works better if passed a buffer or file, but we can pass Unit8Array cast to array-like
  // wait, midi-parser expects a base64 string or an ArrayBuffer?
  // Let's create an intermediate parser
  const parser = MidiParser.parse(uint8Array);
  
  if (!parser || !parser.track) {
    throw new Error('Formato MIDI inválido o corrupto.');
  }

  let bpm = 120;
  let timeSignature: [number, number] = [4, 4];
  const ticksPerBeat = parser.timeDivision || 480;

  let mergedTracks: ParsedSong['tracks'] = [];

  // Tempo parsing usually happens in track 0 meta events
  parser.track.forEach((trackData: any, trackIndex: number) => {
    let currentTicks = 0;
    
    let trackName = `Track ${trackIndex + 1}`;
    let isMelody = false;
    let isAccompaniment = false;

    // Track state for note on/off
    const activeNotes = new Map<number, { pitch: string; startTick: number; velocity: number }>();
    const finishedNotes: any[] = [];

    trackData.event.forEach((event: any) => {
      currentTicks += event.deltaTime;

      // Meta events
      if (event.type === 255) {
        if (event.metaType === 81) { // Tempo
           // event.data is microsec per quarter note
           const microsecondsPerBeat = event.data;
           bpm = Math.round(60000000 / microsecondsPerBeat);
        } else if (event.metaType === 88) { // Time Signature
           timeSignature = [event.data[0], Math.pow(2, event.data[1])];
        } else if (event.metaType === 3) { // Track Name
           trackName = event.data;
           const lowerName = typeof trackName === 'string' ? trackName.toLowerCase() : '';
           if (lowerName.includes('right') || lowerName.includes('melody')) isMelody = true;
           if (lowerName.includes('left') || lowerName.includes('accompaniment')) isAccompaniment = true;
        }
      }

      // MIDI Channel events
      if (event.type === 8 || event.type === 9) { // Note Off (8) or Note On (9)
        const midiNote = event.data[0];
        const velocity = event.type === 9 ? event.data[1] : 0;
        const pitch = midiNoteToName(midiNote);
        
        if (event.type === 9 && velocity > 0) {
          activeNotes.set(midiNote, { pitch, startTick: currentTicks, velocity: velocity / 127 });
        } else {
          // Note off
          const active = activeNotes.get(midiNote);
          if (active) {
            finishedNotes.push({
              pitch: active.pitch,
              start: active.startTick / ticksPerBeat, // Start in beats
              duration: (currentTicks - active.startTick) / ticksPerBeat, // Duration in beats
              velocity: active.velocity,
              hand: isMelody ? 'right' : (isAccompaniment ? 'left' : undefined)
            });
            activeNotes.delete(midiNote);
          }
        }
      }
    });

    if (finishedNotes.length > 0) {
      mergedTracks.push({
        name: typeof trackName === 'string' ? trackName : `Track ${trackIndex + 1}`,
        notes: finishedNotes
      });
    }
  });

  return {
    title: 'Imported MIDI',
    bpm,
    timeSignature,
    tracks: mergedTracks
  };
};

// Utils
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiNoteToName(midiVal: number): string {
  const octave = Math.floor(midiVal / 12) - 1;
  const name = NOTE_NAMES[midiVal % 12];
  return `${name}${octave}`;
}

// XML Support using DOMParser
export const analyzeMusicXML = (xmlString: string): ParsedSong => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");
  
  if (xml.querySelector('parsererror')) {
    throw new Error('Invalid XML');
  }

  // Very basic extraction logic
  const parts = xml.querySelectorAll('part');
  let bpm = 120;
  
  const tempoEl = xml.querySelector('sound[tempo]');
  if (tempoEl) bpm = parseInt(tempoEl.getAttribute('tempo') || '120');
  
  const timeSignature: [number, number] = [4, 4];
  const beatsEl = xml.querySelector('time > beats');
  const typeEl = xml.querySelector('time > beat-type');
  if (beatsEl && typeEl) {
     timeSignature[0] = parseInt(beatsEl.textContent || '4');
     timeSignature[1] = parseInt(typeEl.textContent || '4');
  }
  
  const tracks: ParsedSong['tracks'] = [];

  parts.forEach((part, index) => {
    let currentBeat = 0;
    const notes: ParsedSong['tracks'][0]['notes'] = [];
    const measures = part.querySelectorAll('measure');
    
    let divisions = 1;

    measures.forEach(measure => {
      const divEl = measure.querySelector('attributes > divisions');
      if (divEl) divisions = parseInt(divEl.textContent || '1');
      
      const children = Array.from(measure.children);
      
      children.forEach(el => {
        if (el.tagName === 'note') {
           const restEl = el.querySelector('rest');
           const durationEl = el.querySelector('duration');
           const pitchEl = el.querySelector('pitch');
           
           const durBeats = durationEl ? parseInt(durationEl.textContent || '0') / divisions : 0;
           
           if (restEl) {
               currentBeat += durBeats;
           } else if (pitchEl) {
               const step = pitchEl.querySelector('step')?.textContent || 'C';
               const alter = pitchEl.querySelector('alter')?.textContent === '1' ? '#' : '';
               const octave = pitchEl.querySelector('octave')?.textContent || '4';
               
               const chordEl = el.querySelector('chord');
               if (chordEl) {
                   // Starts at same time as previous note
                   currentBeat -= durBeats; // Rewind
               }
               
               notes.push({
                   pitch: `${step}${alter}${octave}`,
                   start: currentBeat,
                   duration: Math.max(0.125, durBeats),
                   velocity: 0.7
               });
               
               currentBeat += durBeats;
           }
        } else if (el.tagName === 'backup') {
           const durationEl = el.querySelector('duration');
           const durBeats = durationEl ? parseInt(durationEl.textContent || '0') / divisions : 0;
           currentBeat -= durBeats;
        } else if (el.tagName === 'forward') {
           const durationEl = el.querySelector('duration');
           const durBeats = durationEl ? parseInt(durationEl.textContent || '0') / divisions : 0;
           currentBeat += durBeats;
        }
      });
    });
    
    if (notes.length > 0) {
      tracks.push({
        name: part.getAttribute('id') || `Part ${index + 1}`,
        notes
      });
    }
  });

  return {
    title: xml.querySelector('work-title')?.textContent || 'Imported XML',
    bpm,
    timeSignature,
    tracks
  };
};

// ABC Notation using abcjs
export const analyzeAbcNotation = (abcString: string): ParsedSong => {
  const parsed = abcjs.parseOnly(abcString);
  if (!parsed || !parsed[0]) throw new Error('Invalid ABC Notation');
  
  const tune = parsed[0];
  const title = tune.metaText?.title || 'Imported ABC';
  
  // Abcjs represents lines and measures. Extracting precise timing is complex, 
  // we will map roughly using the linear event sequence.
  const notes: ParsedSong['tracks'][0]['notes'] = [];
  let currentBeat = 0;
  
  tune.lines?.forEach((line: any) => {
    line.staff?.forEach((staff: any) => {
      staff.voices?.forEach((voice: any) => {
        voice.forEach((elem: any) => {
          if (elem.el_type === 'note' && elem.pitches) {
             const duration = elem.duration || 1; // Assuming 1 is a quarter note here roughly
             elem.pitches.forEach((p: any) => {
                // p.pitch is an integer mapping to note name. 
                // C4 is around pitch 0 or 60?? Abcjs uses 0 for C as well if relative. Let's approximate based on string format if available...
                // Actually ABCjs gives name if we extract it, but let's fall back to a safe mapping:
                const noteName = abcPitchToName(p.pitch);
                notes.push({
                   pitch: noteName,
                   start: currentBeat,
                   duration: Math.max(0.25, duration),
                   velocity: 0.7
                });
             });
             currentBeat += duration;
          } else if (elem.el_type === 'note' && elem.rest) {
             currentBeat += (elem.duration || 1);
          }
        });
      });
    });
  });

  return {
    title,
    bpm: 120, // default if not found
    timeSignature: [4, 4],
    tracks: [{ name: 'ABC Track', notes }]
  };
};

function abcPitchToName(pitchValue: number): string {
    // ABCJS relative pitch: 0 = middle C (C4).
    const isNegative = pitchValue < 0;
    const absVal = Math.abs(pitchValue);
    
    // Scale: C, D, E, F, G, A, B (7 diatonic steps per octave, but wait, pitch is diatonic or chromatic?)
    // ABCjs pitch is diatonic relative steps from C.
    const diatonicScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    
    let octaveOffset = Math.floor(absVal / 7);
    let step = absVal % 7;
    
    if (isNegative) {
        octaveOffset = -octaveOffset - 1;
        step = 7 - step;
        if (step === 7) {
            step = 0;
            octaveOffset++;
        }
    }
    
    const octave = 4 + octaveOffset;
    return `${diatonicScale[step]}${octave}`;
}

// The unified parser 
export class FormatParser {
  public static async parseFile(file: File): Promise<ParsedSong> {
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (ext === 'mid' || ext === 'midi') {
          const buffer = await file.arrayBuffer();
          return analyzeMidiFile(buffer);
      } else if (ext === 'mxl' || ext === 'xml') {
          const text = await file.text();
          return analyzeMusicXML(text);
      } else if (ext === 'abc') {
          const text = await file.text();
          return analyzeAbcNotation(text);
      } else if (ext === 'json') {
          const text = await file.text();
          const json = JSON.parse(text);
          // Auto detect format compatibility
          if (json.tracks && json.tracks[0].notes) {
              return json as ParsedSong;
          }
          throw new Error('Unsupported JSON Structure');
      }
      
      throw new Error('Formato de archivo no soportado. Usa .mid, .mxl, .abc o .json');
  }
}
