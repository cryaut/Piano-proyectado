import twinkleJson from '../songs/twinkle.json';
import { engine } from '../audio/PianoEngine';
import { scoringEngine } from './ScoringEngine';

export interface NoteEvent {
  id: string;
  pitch: string;
  start: number;
  duration: number;
  velocity: number;
  status: 'future' | 'active' | 'sustained' | 'missed' | 'perfect';
  errorMs?: number;
  hand?: 'left' | 'right';
}

export interface SustainBlock {
  start: number;
  end: number;
}

export interface Song {
  title: string;
  bpm: number;
  timeSignature: [number, number];
  sustain?: SustainBlock[];
  notes: NoteEvent[];
}

export type PlayMode = 'free' | 'practice' | 'rhythm' | 'listen';

class SongPlayerService {
  public currentSong: Song | null = null;
  public isPlaying = false;
  public mode: PlayMode = 'practice';
  public isPausedForPractice = false;
  
  private effectiveStartTime = 0;
  private pauseTimeMs = 0;

  private listeners: Set<() => void> = new Set();
  
  public subscribe(listener: () => void) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
  }
  
  private notify() {
      this.listeners.forEach(l => l());
  }
  
  public loadSong(jsonPayload: any) {
    const notes: NoteEvent[] = [];
    const rawNotes = jsonPayload.tracks?.flatMap((track: any) => track.notes || []) || [];
    const unit = jsonPayload.unit || jsonPayload.timeUnit || 'auto';
    const shouldConvertFromMs = unit === 'milliseconds' || unit === 'ms' || (
      unit === 'auto' && rawNotes.some((n: any) => n.start > 512 || n.duration > 128)
    );
    const msPerBeat = 60000 / (jsonPayload.bpm || 120);

    if (rawNotes.length > 0) {
       rawNotes.forEach((n: any, i: number) => {
         notes.push({
           id: `note_${i}`,
           pitch: n.pitch,
           start: shouldConvertFromMs ? n.start / msPerBeat : n.start,
           duration: shouldConvertFromMs ? n.duration / msPerBeat : n.duration,
           velocity: n.velocity || 0.8,
           status: 'future',
           hand: n.hand
         });
       });
    }
    
    // Sort notes by start time
    notes.sort((a, b) => a.start - b.start);

    this.currentSong = {
      title: jsonPayload.title,
      bpm: jsonPayload.bpm,
      timeSignature: jsonPayload.timeSignature,
      sustain: jsonPayload.sustain,
      notes
    };
    
    this.resetPlayback();
    scoringEngine.reset();
  }

  public resetPlayback() {
    this.isPlaying = false;
    this.isPausedForPractice = false;
    this.effectiveStartTime = 0;
    this.pauseTimeMs = 0;
    engine.releaseAll();
    engine.setSustain(false);
    if (this.currentSong) {
      this.currentSong.notes.forEach(n => { n.status = 'future'; n.errorMs = undefined; });
    }
    this.notify();
  }

  public togglePlay() {
    if (!this.currentSong) {
      this.loadSong(twinkleJson);
    }
    
    const now = performance.now();
    if (this.isPlaying) {
      this.isPlaying = false;
      engine.releaseAll();
      if (!this.isPausedForPractice) {
          this.pauseTimeMs = now - this.effectiveStartTime;
      }
    } else {
      this.isPlaying = true;
      if (!this.isPausedForPractice) {
          this.effectiveStartTime = now - this.pauseTimeMs;
      }
    }
    this.notify();
  }

  public pauseForPractice() {
    if (!this.isPausedForPractice && this.isPlaying) {
        this.isPausedForPractice = true;
        this.pauseTimeMs = performance.now() - this.effectiveStartTime;
    }
  }

  public resumeFromPractice() {
    if (this.isPausedForPractice) {
        this.isPausedForPractice = false;
        if (this.isPlaying) {
            this.effectiveStartTime = performance.now() - this.pauseTimeMs;
        }
    }
  }

  public getCurrentBeats(): number {
    if (!this.currentSong) return 0;
    
    let timeMs = this.pauseTimeMs;
    
    if (this.isPlaying && !this.isPausedForPractice) {
        timeMs = performance.now() - this.effectiveStartTime;
    }
    
    return (timeMs / 1000) * (this.currentSong.bpm / 60);
  }

  public setMode(mode: PlayMode) {
      this.mode = mode;
      window.dispatchEvent(new CustomEvent('piano-mode-change', { detail: { mode } }));
  }
}

export const songPlayer = new SongPlayerService();
