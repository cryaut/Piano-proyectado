# RealPiano Studio Architecture Notes

## Product Direction

RealPiano Studio is moving from a simple playable piano app toward a browser-based practice workstation: low-latency input, reliable game scoring, recording, import/export, and a piano-roll editor that can create playable lessons.

## Current Architecture

- React/Vite frontend with Tone.js audio engine.
- Input layer split into QWERTY keyboard, Web MIDI, and WebHID discovery for magnetic keyboards.
- Game layer uses a shared song payload in beats.
- Editor layer owns piano-roll note creation, transforms, metadata, export, and hand assignment.
- Local persistence currently uses `localStorage` for editor drafts and recordings.

## Editor UX Strategy

The editor should behave like a compact MIDI piano roll, not a form-based song builder.

Core workflows:

- Draw notes quickly on a beat/pitch grid.
- Select, move, resize, copy, delete, and lasso notes.
- Transform selected notes musically: quantize, transpose, legato, chop, strum, and chord stamp.
- Edit expression through a velocity lane and inspector.
- Preserve work automatically through draft recovery.
- Export to app JSON, MIDI, share link, and game mode.

## Implemented Slice

- Scale-aware grid shading.
- Advanced transform panel.
- Chord stamping.
- Inspector with velocity, hand assignment, metadata, and deletion/duplication.
- Interactive velocity lane.
- Editor draft autosave and manual recovery.

## Next Expansion

- Multi-track/staff model for left/right hand instead of hand metadata only.
- Command palette for editor operations.
- Snapshots/version history beyond a single draft.
- Loop region and punch-in recording inside the editor.
- Better MIDI import normalization with tempo-map support.
- Code splitting for the large app bundle.
