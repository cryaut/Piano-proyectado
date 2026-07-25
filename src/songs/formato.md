# Formato de Canción JSON

El formato utiliza un objeto JSON principal que define los metadatos de la canción y un arreglo de pistas (`tracks`). También soporta la especificación de pedal de sustain.

## Atributos principales

- `title` (string): Nombre de la canción.
- `bpm` (number): Velocidad en Beats Per Minute.
- `timeSignature` (array): Firma de tiempo, e.g. `[4, 4]`.
- `sustain` (array of objects): Opcional. Bloques donde el pedal de sustain está activo.
  - `start` (number): Tiempo de inicio en beats.
  - `end` (number): Tiempo de fin en beats.
- `tracks` (array of objects): Arreglo con las pistas.
  - `instrument` (string): Instrumento asociado a la pista.
  - `notes` (array of objects):
    - `pitch` (string): Nota, e.g. `"C4"`, `"F#4"`.
    - `start` (number): Tiempo de inicio en beats.
    - `duration` (number): Duración en beats.
    - `velocity` (number): Intensidad de 0.0 a 1.0 (opcional, por defecto 0.8).

---

## Ejemplos

### 1. Melodía Simple
```json
{
  "title": "Melodía Simple",
  "bpm": 100,
  "timeSignature": [4, 4],
  "tracks": [
    {
      "instrument": "acoustic-grand",
      "notes": [
        { "pitch": "C4", "start": 0.0, "duration": 1.0, "velocity": 0.8 },
        { "pitch": "D4", "start": 1.0, "duration": 1.0, "velocity": 0.8 },
        { "pitch": "E4", "start": 2.0, "duration": 2.0, "velocity": 0.7 }
      ]
    }
  ]
}
```

### 2. Acordes (Polifonía)
```json
{
  "title": "Progresión de Acordes",
  "bpm": 80,
  "timeSignature": [4, 4],
  "tracks": [
    {
      "instrument": "electric-piano",
      "notes": [
        { "pitch": "C4", "start": 0.0, "duration": 4.0, "velocity": 0.7 },
        { "pitch": "E4", "start": 0.0, "duration": 4.0, "velocity": 0.6 },
        { "pitch": "G4", "start": 0.0, "duration": 4.0, "velocity": 0.6 },
        
        { "pitch": "A3", "start": 4.0, "duration": 4.0, "velocity": 0.7 },
        { "pitch": "C4", "start": 4.0, "duration": 4.0, "velocity": 0.6 },
        { "pitch": "E4", "start": 4.0, "duration": 4.0, "velocity": 0.6 }
      ]
    }
  ]
}
```

### 3. Con Pedal de Sustain Explícito
```json
{
  "title": "Arpegios con Sustain",
  "bpm": 90,
  "timeSignature": [3, 4],
  "sustain": [
    { "start": 0.0, "end": 3.0 },
    { "start": 3.0, "end": 6.0 }
  ],
  "tracks": [
    {
      "instrument": "soft-piano",
      "notes": [
        { "pitch": "C3", "start": 0.0, "duration": 1.0, "velocity": 0.8 },
        { "pitch": "G3", "start": 1.0, "duration": 1.0, "velocity": 0.6 },
        { "pitch": "C4", "start": 2.0, "duration": 1.0, "velocity": 0.5 },
        
        { "pitch": "F2", "start": 3.0, "duration": 1.0, "velocity": 0.8 },
        { "pitch": "C3", "start": 4.0, "duration": 1.0, "velocity": 0.6 },
        { "pitch": "F3", "start": 5.0, "duration": 1.0, "velocity": 0.5 }
      ]
    }
  ]
}
```
