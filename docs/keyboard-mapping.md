# RealPiano Computer Keyboard Mapping

The computer keyboard is intentionally used as a three-row piano controller.

## Normal Layer

Normal mode maps only to white keys, left to right, with no duplicate MIDI notes.

| Row | Keys | Notes |
|---|---|---|
| Bottom | `Z X C V B N M , . /` | `C3 D3 E3 F3 G3 A3 B3 C4 D4 E4` |
| Middle | `A S D F G H J K L ; '` | `F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5` |
| Top | `Q W E R T Y U I O P [ ] \` | `C6 D6 E6 F6 G6 A6 B6 C7 D7 E7 F7 G7 A7` |

## Shift Layer

Shift is a black-key layer only. It never falls back to the normal white note.

- `C`, `D`, `F`, `G`, and `A` white keys resolve to the sharp directly above.
- `E` and `B` white keys intentionally produce no note because there is no black key above them.
- Keyup always releases the exact note stored at keydown, even if Shift or octave state changes before release.

## Intentional No-Note Shift Keys

`Shift+C`, `Shift+M`, `Shift+/`, `Shift+F`, `Shift+J`, `Shift+'`, `Shift+E`, `Shift+U`, and `Shift+P`.

## Regression Verification

Run:

```powershell
npx tsx scripts\verify-keyboard-map.ts
```

This verifies ascending white-key order, no normal-layer duplicates, black-key-only Shift behavior, and no white-note fallback.
