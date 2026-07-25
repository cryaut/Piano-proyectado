# RealPiano Studio Web
A professional-grade, browser-based piano synthesizer and practice engine.

### Features
- **True Multi-Sample Engine:** Fully polyphonic Web Audio API utilizing the Tone.js `Sampler`, routing 3 velocity layers with independent filtering and custom synthesis pathways.
- **Accurate Physics & Dynamics:** Velocity simulation algorithm measures raw keydown-to-keydown depression velocity to approximate mechanical piano hammer physics on QWERTY input.
- **Fallback Synth System:** Seamlessly degrades to a rich Frequency Modulation (FM) Synthesizer if network sample loading fails.
- **Custom DSP Effects Chain:** Master bus processes parallel routing with modeled cabinet resonance (procedural IR), multi-stage compression, chorus, tremolo, distortion, and parametric EQ.
- **MIDI & Device Support:** Standard Web MIDI API support, integrating physical controllers flawlessly.

### Controls & Shortcuts
- **Keyboard (ISO-3-ROW):** `Z-M` / `A-L` / `Q-P` mapped intelligently across octaves to simulate a physical bed.
- **`Space`**: Sustain Pedal
- **`Arrows (←, →)`**: Shift Octave Root
- **`F11` / `F`**: Toggle Fullscreen Mode
- **`M`**: Global Audio Mute
- **`R`**: Toggle Loop Recording (Free Mode)
- **`Esc`**: Exit Modals / Minimize

### How to Run (Development)
```bash
npm install
npm run dev
```

### Architecture Overview
Built entirely in React 18, Vite, and Tailwind CSS. The audio processing is handled safely out-of-band by Tone.js to minimize React's render thread blocking. The `PianoEngine` handles concurrent streaming of ~80 MB of samples, deferring to the browser's audio decoder. Visual animations utilize framer-motion (`motion/react`) hardware-accelerated transforms targeting exact microsecond alignments to audio output.

### Licensing & Credits
- **Audio engine**: Built over `Tone.js`.
- **Samples**: "Salamander Grand Piano" samples provided by Alexander Holm under **Creative Commons Attribution 3.0 (CC BY 3.0)**.
- **UI Icons/Design**: Minimalist interface heavily relying on precise SVG and native grid capabilities.
