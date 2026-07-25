import * as Tone from 'tone';
import { PRESETS } from './InstrumentPresets';
import { inputDebug } from '../debug/InputDebug';

interface ActiveNote {
    freq: number;
    layer: 'L' | 'M' | 'H';
}

export class PianoEngine {
  private samplerL!: Tone.Sampler;
  private samplerM!: Tone.Sampler;
  private samplerH!: Tone.Sampler;

  private filterL!: Tone.Filter;
  private filterM!: Tone.Filter;
  private filterH!: Tone.Filter;

  private volL!: Tone.Volume;
  private volM!: Tone.Volume;
  private volH!: Tone.Volume;

  private effectsBus!: Tone.Gain;

  private chorus!: Tone.Chorus;
  private tremolo!: Tone.Tremolo;
  private dist!: Tone.Distortion;
  private masterFilter!: Tone.Filter;
  private reverbMix!: Tone.Gain;

  private compressor!: Tone.Compressor;
  private eq!: Tone.EQ3;
  private convolver!: Tone.Convolver;
  
  private _isReady = false;

  public get isReady() {
    return this._isReady;
  }

  private fallbackSynth!: Tone.PolySynth;
  private useFallback = false;

  private activeNotesMap = new Map<string, ActiveNote>();
  private physicallyHeld = new Set<string>();
  private sustainedNotes = new Set<string>();
  private sustainPedal = false;

  constructor() {
    this.init();
  }

  private async init() {
    this.effectsBus = new Tone.Gain(1);

    // Master Effects Chain
    this.eq = new Tone.EQ3({
      low: 1,
      mid: -1,
      high: 3, // EQ paramétrico subtly enhancing presence
    });
    
    this.compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 3, // Ratio 3:1
      attack: 0.005,
      release: 0.2
    });

    this.fallbackSynth = new Tone.PolySynth(Tone.FMSynth).connect(this.effectsBus);
    Tone.getContext().lookAhead = 0.005;

    // Procedural IR Convolver for cabinet resonance
    const ctx = Tone.getContext();
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 2.5; // decay 2.5s
    const audioCtx = ctx.rawContext as AudioContext;
    let buffer: AudioBuffer;
    
    try {
        buffer = audioCtx.createBuffer(2, length, sampleRate);
        for (let c = 0; c < 2; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
                // Exponential decay envelope
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
            }
        }
        this.convolver = new Tone.Convolver(buffer);
    } catch (e) {
        console.warn("Failed to create procedural IR buffer", e);
        // Fallback or empty convolver if AudioContext lacks native createBuffer
        this.convolver = new Tone.Convolver();
    }
    
    // Convolver doesn't have a wet property, so we route it in parallel
    this.reverbMix = new Tone.Gain(0.15);
    
    this.chorus = new Tone.Chorus(4, 2.5, 0.5).start();
    this.tremolo = new Tone.Tremolo(6, 0.75).start();
    this.dist = new Tone.Distortion(0.4);
    this.masterFilter = new Tone.Filter(20000, "lowpass");

    // Main effects path
    this.effectsBus.chain(this.tremolo, this.chorus, this.dist, this.masterFilter);

    // Dry path
    this.masterFilter.connect(this.eq);
    // Wet path
    this.masterFilter.connect(this.convolver);
    this.convolver.connect(this.reverbMix);
    this.reverbMix.connect(this.eq);

    this.eq.chain(this.compressor, Tone.getDestination());

    // Layer Filters and Volumes
    this.filterL = new Tone.Filter(2000, "lowpass");
    this.filterM = new Tone.Filter(4000, "lowpass");
    this.filterH = new Tone.Filter(8000, "lowpass");

    this.volL = new Tone.Volume(-12);
    this.volM = new Tone.Volume(-6);
    this.volH = new Tone.Volume(0);

    this.filterL.chain(this.volL, this.effectsBus);
    this.filterM.chain(this.volM, this.effectsBus);
    this.filterH.chain(this.volH, this.effectsBus);

    const urls = {
      A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
      A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
      A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
      A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
      A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
      A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
      A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
      A7: "A7.mp3", C8: "C8.mp3"
    };
    
    const baseUrl = "https://tonejs.github.io/audio/salamander/";

    let loadedCount = 0;
    const onLoad = () => {
        loadedCount++;
        window.dispatchEvent(new CustomEvent('piano-engine-loading', { detail: { progress: loadedCount / 3 } }));
        if (loadedCount === 3) {
            this._isReady = true;
            console.log("All 3 simulated velocity layers loaded!");
            window.dispatchEvent(new Event('piano-engine-ready'));
        }
    };
    
    const onError = () => {
        if (!this.useFallback) {
             console.warn("Failed to load samples, using FMSynth fallback.");
             this.useFallback = true;
             this._isReady = true;
             window.dispatchEvent(new Event('piano-engine-error'));
             window.dispatchEvent(new Event('piano-engine-ready'));
        }
    };

    this.samplerL = new Tone.Sampler({ urls, baseUrl, release: 1.2, onload: onLoad, onerror: onError });
    this.samplerM = new Tone.Sampler({ urls, baseUrl, release: 1.2, onload: onLoad, onerror: onError });
    this.samplerH = new Tone.Sampler({ urls, baseUrl, release: 1.2, onload: onLoad, onerror: onError });

    this.samplerL.connect(this.filterL);
    this.samplerM.connect(this.filterM);
    this.samplerH.connect(this.filterH);
  }

  public async startAudioContext() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
      // Reduce Tone's internal scheduling look-ahead for more instantaneous real-time playback
      Tone.getContext().lookAhead = 0.005;
    }
  }

  public setSustain(active: boolean) {
      this.sustainPedal = active;
      inputDebug.log({
        action: 'sustain',
        source: 'audio-engine',
        match: true,
        matchLabel: 'INFO',
        mismatchReason: `Sustain ${active ? 'on' : 'off'}`,
      });
      if (!active) {
          const now = Tone.now();
          this.sustainedNotes.forEach(note => {
             if (!this.physicallyHeld.has(note)) {
                this.triggerReleaseInternal(note, now);
             }
          });
          this.sustainedNotes.clear();
      }
      
      window.dispatchEvent(new CustomEvent('piano-sustain-change', { detail: { active } }));
  }

  public applyPreset(id: string) {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    
    if (!this.chorus) return; // Wait until init completes

    this.reverbMix.gain.rampTo(preset.reverbWet, 0.1);
    this.eq.low.value = preset.eqLow;
    this.eq.mid.value = preset.eqMid;
    this.eq.high.value = preset.eqHigh;
    
    this.compressor.threshold.value = preset.compThreshold;
    this.compressor.ratio.value = preset.compRatio;
    
    this.chorus.wet.rampTo(preset.chorusWet, 0.1);
    this.tremolo.wet.rampTo(preset.tremoloWet, 0.1);
    this.dist.wet.rampTo(preset.distWet, 0.1);
    
    this.masterFilter.frequency.rampTo(preset.filterFreq, 0.1);
  }

  public lastNoteTime: number = 0;

  public noteOn(note: string, velocity: number = Math.random() * 0.4 + 0.6) {
    if (!this.isReady) {
      inputDebug.logAudioAttack(note, { velocity, backend: 'none', engineReady: false });
      return;
    }
    
    this.lastNoteTime = performance.now();
    this.physicallyHeld.add(note);
    
    // Immediate execution for zero latency
    const time = Tone.immediate();
    
    const baseFreq = Tone.Frequency(note).toFrequency() as number;
    const playbackFreq = baseFreq;

    let layer: 'L' | 'M' | 'H' = 'H';
    let targetSampler = this.samplerH;
    
    // Velocity Routing
    if (velocity < 0.4) {
        layer = 'L';
        targetSampler = this.samplerL;
    } else if (velocity < 0.75) {
        layer = 'M';
        targetSampler = this.samplerM;
    }

    const duplicateAttack = this.activeNotesMap.has(note);

    if (this.useFallback) {
        const existing = this.activeNotesMap.get(note);
        if (existing) this.fallbackSynth.triggerRelease([existing.freq], time);
        
        this.activeNotesMap.set(note, { freq: playbackFreq, layer });
        this.fallbackSynth.triggerAttack(playbackFreq, time, velocity);
        inputDebug.logAudioAttack(note, { velocity, layer, backend: 'fallback', engineReady: true, duplicateAttack });
    } else if (targetSampler) {
        const existing = this.activeNotesMap.get(note);
        if (existing) {
             const prevSampler = existing.layer === 'L' ? this.samplerL : existing.layer === 'M' ? this.samplerM : this.samplerH;
             // Immediate release of the prev exact frequency for this note to prevent buildup
             prevSampler?.triggerRelease(existing.freq, time);
        }

        this.activeNotesMap.set(note, { freq: playbackFreq, layer });
        targetSampler.triggerAttack(playbackFreq, time, velocity);
        inputDebug.logAudioAttack(note, { velocity, layer, backend: 'sampler', engineReady: true, duplicateAttack });
    }
  }

  public noteOff(note: string) {
    if (!this.isReady) {
        inputDebug.logAudioRelease(note, { backend: 'none', engineReady: false, releaseWithoutActive: true });
        return;
    }
    
    this.physicallyHeld.delete(note);
    
    if (this.sustainPedal) {
        this.sustainedNotes.add(note);
    } else {
        const time = Tone.immediate();
        this.triggerReleaseInternal(note, time);
    }
  }

  private triggerReleaseInternal(note: string, time: number) {
      const activeInfo = this.activeNotesMap.get(note);
      if (!activeInfo) {
          inputDebug.logAudioRelease(note, { backend: this.useFallback ? 'fallback' : 'sampler', engineReady: this.isReady, releaseWithoutActive: true });
          return;
      }

      const targetSampler = activeInfo.layer === 'L' ? this.samplerL :
                            activeInfo.layer === 'M' ? this.samplerM : this.samplerH;
      
      if (this.useFallback) {
          this.fallbackSynth.triggerRelease([activeInfo.freq], time);
      } else if (targetSampler) {
          targetSampler.triggerRelease(activeInfo.freq, time);
      }
      this.activeNotesMap.delete(note);
      inputDebug.logAudioRelease(note, { backend: this.useFallback ? 'fallback' : 'sampler', engineReady: this.isReady });
  }

  public releaseAll() {
      this.physicallyHeld.clear();
      this.sustainedNotes.clear();
      const now = Tone.now();
      
      if (this.useFallback) {
          this.fallbackSynth.releaseAll(now);
      } else {
          for (const [note, activeInfo] of this.activeNotesMap.entries()) {
              const targetSampler = activeInfo.layer === 'L' ? this.samplerL :
                                    activeInfo.layer === 'M' ? this.samplerM : this.samplerH;
              if (targetSampler) targetSampler.triggerRelease(activeInfo.freq, now);
          }
      }
      this.activeNotesMap.clear();
      inputDebug.clearAudio();
      inputDebug.log({
          action: 'all-notes-off',
          source: 'audio-engine',
          match: true,
          matchLabel: 'MATCH',
          mismatchReason: 'Audio engine releaseAll cleared active note tracking.',
      });
      window.dispatchEvent(new Event('piano-all-notes-off'));
  }

  public toggleMute() {
     Tone.getDestination().mute = !Tone.getDestination().mute;
  }
}

export const engine = new PianoEngine();
