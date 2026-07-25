import { engine } from '../audio/PianoEngine';
import { SongNote, Recording } from '../types';

class RecorderService {
  public isRecording = false;
  private startTime = 0;
  private recordedNotes: SongNote[] = [];
  
  // To keep track of active notes to set their durations
  private activeNotes = new Map<string, { startMs: number; velocity: number }>();
  // Sustain
  private sustainEvents: { time: number; value: boolean }[] = [];

  public toggleRecording() {
    if (this.isRecording) {
      return this.stop();
    } else {
      return this.start();
    }
  }

  public start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.startTime = performance.now();
    this.recordedNotes = [];
    this.activeNotes.clear();
    this.sustainEvents = [];
    window.dispatchEvent(new Event('recorder-status-change'));
  }

  public getDurationMs(): number {
    if (!this.isRecording) return 0;
    return performance.now() - this.startTime;
  }

  public stop(): Recording | null {
    if (!this.isRecording) return null;
    this.isRecording = false;
    
    const now = performance.now();
    const durationMs = now - this.startTime;
    
    // Close any unclosed notes
    this.activeNotes.forEach((data, note) => {
        this.recordedNotes.push({
            note,
            time: data.startMs,
            duration: Math.max(12, durationMs - data.startMs),
            velocity: data.velocity
        });
    });
    this.activeNotes.clear();
    
    window.dispatchEvent(new Event('recorder-status-change'));
    
    if (this.recordedNotes.length === 0) return null;

    const recording: Recording = {
        id: 'rec_' + Date.now(),
        title: `Grabación ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        date: Date.now(),
        durationMs,
        noteCount: this.recordedNotes.length,
        instrument: 'Grand Piano', // Always for now
        data: this.recordedNotes.filter(n => n.duration >= 12).sort((a,b) => a.time - b.time),
        sustainEvents: [...this.sustainEvents]
    };

    this.saveRecording(recording);
    return recording;
  }

  public handleNoteOn(note: string, velocity: number) {
    if (!this.isRecording) return;
    // Check 4 minute limit
    if (this.getDurationMs() >= 240000) {
      this.stop();
      return;
    }
    if (this.activeNotes.has(note)) {
      return;
    }

    this.activeNotes.set(note, {
        startMs: performance.now() - this.startTime,
        velocity
    });
  }

  public handleNoteOff(note: string) {
    if (!this.isRecording) return;
    
    const active = this.activeNotes.get(note);
    if (active) {
        const nowMs = performance.now() - this.startTime;
        this.recordedNotes.push({
            note,
            time: active.startMs,
            duration: Math.max(12, nowMs - active.startMs),
            velocity: active.velocity
        });
        this.activeNotes.delete(note);
    }
  }
  
  public handleSustain(isOn: boolean) {
      if (!this.isRecording) return;
      this.sustainEvents.push({
          time: performance.now() - this.startTime,
          value: isOn
      });
  }

  // --- Persistence ---
  public getRecordings(): Recording[] {
      try {
          const raw = localStorage.getItem('realpiano_recordings');
          if (raw) return JSON.parse(raw);
      } catch (e) {
          console.error("Error loading recordings", e);
      }
      return [];
  }

  public saveRecording(rec: Recording) {
      let recs = this.getRecordings();
      recs.push(rec);
      // Hard cap at 20 recordings by deleting older ones if necessary
      if (recs.length > 20) {
          recs = recs.slice(recs.length - 20);
          console.warn("Límite de 20 grabaciones alcanzado. Se eliminaron las más antiguas.");
      }
      localStorage.setItem('realpiano_recordings', JSON.stringify(recs));
      window.dispatchEvent(new Event('recordings-updated'));
  }

  public deleteRecording(id: string) {
      let recs = this.getRecordings();
      recs = recs.filter(r => r.id !== id);
      localStorage.setItem('realpiano_recordings', JSON.stringify(recs));
      window.dispatchEvent(new Event('recordings-updated'));
  }

  public renameRecording(id: string, newTitle: string) {
      let recs = this.getRecordings();
      const rec = recs.find(r => r.id === id);
      if (rec) {
          rec.title = newTitle;
          localStorage.setItem('realpiano_recordings', JSON.stringify(recs));
          window.dispatchEvent(new Event('recordings-updated'));
      }
  }

  // --- Exporting ---
  public generateMidiFile(recording: Recording): Blob {
      // Manual MIDI File building
      // Based on Standard MIDI File Format Specification
      
      const BPM = 120;
      const ticksPerBeat = 480;
      const msPerBeat = 60000 / BPM;
      const msToTicks = (ms: number) => Math.round((ms / msPerBeat) * ticksPerBeat);

      const notes = [...recording.data].sort((a,b) => a.time - b.time);
      
      // Events: Note On / Note Off
      interface MidiEvent { tick: number; type: number; note: number; velocity: number; }
      const events: MidiEvent[] = [];
      
      notes.forEach(n => {
         const tickOn = msToTicks(n.time);
         const tickOff = msToTicks(n.time + n.duration);
         const midiVal = this.nameToMidiNote(n.note);
         
         events.push({ tick: tickOn, type: 0x90, note: midiVal, velocity: Math.round((n.velocity || 0.8) * 127) });
         events.push({ tick: tickOff, type: 0x80, note: midiVal, velocity: 0 });
      });

      if (recording.sustainEvents) {
          recording.sustainEvents.forEach(ev => {
              events.push({ 
                  tick: msToTicks(ev.time), 
                  type: 0xB0, 
                  note: 64, 
                  velocity: ev.value ? 127 : 0 
              });
          });
      }

      events.sort((a,b) => a.tick - b.tick);

      // Track writing
      const trackData: number[] = [];
      let previousTick = 0;
      
      // Tempo track meta-event (Track 0 technically, but single track for Type 0)
      trackData.push(0x00, 0xFF, 0x51, 0x03); 
      const mpqn = Math.round(60000000 / BPM);
      trackData.push((mpqn >> 16) & 0xFF, (mpqn >> 8) & 0xFF, mpqn & 0xFF);

      events.forEach(ev => {
         const delta = ev.tick - previousTick;
         previousTick = ev.tick;
         
         const varLength = this.toVariableLength(delta);
         trackData.push(...varLength);
         trackData.push(ev.type, ev.note, ev.velocity);
      });
      
      // End of track
      trackData.push(0x00, 0xFF, 0x2F, 0x00);

      // Header: 4d 54 68 64 | length: 6 | format: 0 | tracks: 1 | ticksPerBeat
      const header = [
          0x4D, 0x54, 0x68, 0x64,
          0x00, 0x00, 0x00, 0x06,
          0x00, 0x00,
          0x00, 0x01,
          (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
      ];
      
      // Track length header
      const trackLen = trackData.length;
      const trackHeader = [
          0x4D, 0x54, 0x72, 0x6B,
          (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF
      ];

      const fullBytes = new Uint8Array([...header, ...trackHeader, ...trackData]);
      return new Blob([fullBytes.buffer], { type: 'audio/midi' });
  }

  private toVariableLength(value: number): number[] {
      const buffer = [value & 0x7F];
      while ((value >>= 7) > 0) {
          buffer.unshift((value & 0x7F) | 0x80);
      }
      return buffer;
  }

  private nameToMidiNote(name: string): number {
      const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const alpha = name.replace(/[0-9-]/g, '');
      const oct = parseInt(name.replace(/[^0-9-]/g, ''), 10);
      const index = NOTE_NAMES.indexOf(alpha);
      return (oct + 1) * 12 + index;
  }
}

export const recorder = new RecorderService();
