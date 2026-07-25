import { engine } from '../audio/PianoEngine';
import { inputDebug, noteNameToMidi } from '../debug/InputDebug';

export interface MidiDevice {
  id: string;
  name: string;
}

class MidiBridgeService {
  private midiAccess: any = null;
  private selectedInputId: string | null = null;
  public availableInputs: MidiDevice[] = [];
  
  public async init() {
    try {
      if (navigator.requestMIDIAccess) {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.onstatechange = this.refreshInputs.bind(this);
        this.refreshInputs();
      } else {
        console.warn("Web MIDI API is not supported in this browser.");
      }
    } catch (e) {
      console.error("Failed to get MIDI access", e);
    }
  }

  private refreshInputs() {
    if (!this.midiAccess) return;
    const inputs = Array.from(this.midiAccess.inputs.values()) as any[];
    this.availableInputs = inputs.map(i => ({ id: i.id, name: i.name || 'Unknown Device' }));
    
    // Dispatch event so UI can update
    window.dispatchEvent(new CustomEvent('midi-devices-changed', {
      detail: { inputs: this.availableInputs }
    }));

    // Auto-select first input if none selected
    if (!this.selectedInputId && inputs.length > 0) {
      this.selectInput(inputs[0].id);
    }
  }

  public getActiveDevice(): MidiDevice | null {
    if (!this.selectedInputId) return null;
    return this.availableInputs.find(i => i.id === this.selectedInputId) || null;
  }

  public selectInput(id: string) {
    if (!this.midiAccess) return;
    
    // Clean up current listener
    if (this.selectedInputId) {
      const oldInput = this.midiAccess.inputs.get(this.selectedInputId);
      if (oldInput) {
        oldInput.onmidimessage = null; // Also clear the event just in case
      }
    }
    
    this.selectedInputId = id;
    const input = this.midiAccess.inputs.get(id);
    if (input) {
      // Use both addEventListener and onmidimessage for maximum browser compatibility
      input.onmidimessage = this.handleMidiMessage.bind(this);
      
      // Attempt to open the port explicitly (some browsers expect this)
      if (typeof input.open === 'function') {
         input.open().catch(e => console.warn("Could not explicitly open MIDI input: ", e));
      }
      
      window.dispatchEvent(new CustomEvent('midi-device-selected', {
        detail: { device: { id: input.id, name: input.name } }
      }));
    }
  }

  private midiNoteToName(midiNote: number): string {
    const octave = Math.floor(midiNote / 12) - 1;
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteName = noteNames[midiNote % 12];
    return `${noteName}${octave}`;
  }

  private handleMidiMessage(message: any) {
    // Make sure AudioContext is started
    engine.startAudioContext();

    const [statusBlock, data1, data2] = message.data;
    const command = statusBlock & 0xf0;
    
    // Note On
    if (command === 0x90 && data2 > 0) {
      const noteName = this.midiNoteToName(data1);
      const velocity = data2 / 127.0; // scale 0-127 to 0.0-1.0
      engine.noteOn(noteName, velocity);
      window.dispatchEvent(new CustomEvent('piano-note-on', { detail: { note: noteName, velocity, source: 'midi' }}));
      inputDebug.log({
        action: 'press',
        source: 'midi',
        rawInput: { midiData: Array.from(message.data) },
        resolvedInput: { noteName, midiNote: noteNameToMidi(noteName), velocity },
        interfaceResult: { expectedMidiNote: noteNameToMidi(noteName), highlightedMidiNote: noteNameToMidi(noteName), highlightedNoteName: noteName },
        audioResult: { attackedMidiNote: noteNameToMidi(noteName), noteName },
      });
    }
    // Note Off (or Note On with 0 velocity)
    else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const noteName = this.midiNoteToName(data1);
      engine.noteOff(noteName);
      window.dispatchEvent(new CustomEvent('piano-note-off', { detail: { note: noteName, source: 'midi' }}));
      inputDebug.log({
        action: 'release',
        source: 'midi',
        rawInput: { midiData: Array.from(message.data) },
        resolvedInput: { noteName, midiNote: noteNameToMidi(noteName) },
        interfaceResult: { expectedMidiNote: noteNameToMidi(noteName), highlightedMidiNote: noteNameToMidi(noteName), highlightedNoteName: noteName },
        audioResult: { releasedMidiNote: noteNameToMidi(noteName), noteName },
      });
    }
    // Control Change
    else if (command === 0xB0) {
      if (data1 === 64) { // Sustain pedal
        engine.setSustain(data2 > 63);
      }
    }
    // Aftertouch (0xA0 = Polyphonic Aftertouch, 0xD0 = Channel Aftertouch)
    else if (command === 0xA0 || command === 0xD0) {
      // Just passing it or handling if we actually used aftertouch.
      // Not logging to avoid fake "presión analógica detectada". 
    }
  }
}

export const midiBridge = new MidiBridgeService();
