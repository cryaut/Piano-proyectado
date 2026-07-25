export interface InstrumentPreset {
    id: string;
    name: string;
    description: string;
    reverbWet: number;
    eqLow: number;
    eqMid: number;
    eqHigh: number;
    compThreshold: number;
    compRatio: number;
    chorusWet: number;
    tremoloWet: number;
    distWet: number;
    filterFreq: number;
}

export const PRESETS: InstrumentPreset[] = [
    {
        id: 'acoustic-grand',
        name: 'Acoustic Grand',
        description: 'Dry sample, medium room',
        reverbWet: 0.15,
        eqLow: 0, eqMid: 0, eqHigh: 0,
        compThreshold: -12, compRatio: 2,
        chorusWet: 0, tremoloWet: 0, distWet: 0, filterFreq: 20000
    },
    {
        id: 'electric-piano',
        name: 'Electric Piano',
        description: 'Tremolo, chorus, lowpass',
        reverbWet: 0.1,
        eqLow: 2, eqMid: -2, eqHigh: -4,
        compThreshold: -20, compRatio: 4,
        chorusWet: 0.4, tremoloWet: 0.6, distWet: 0.1, filterFreq: 6000
    },
    {
        id: 'soft-piano',
        name: 'Soft Piano',
        description: 'Muffled attack, long ambient tail',
        reverbWet: 0.4,
        eqLow: 4, eqMid: 0, eqHigh: -8,
        compThreshold: -24, compRatio: 2,
        chorusWet: 0.1, tremoloWet: 0, distWet: 0, filterFreq: 3000
    },
    {
        id: 'bright-piano',
        name: 'Bright Piano',
        description: 'Enhanced 5kHz presence, short verb',
        reverbWet: 0.1,
        eqLow: -2, eqMid: 2, eqHigh: 6,
        compThreshold: -18, compRatio: 3,
        chorusWet: 0, tremoloWet: 0, distWet: 0, filterFreq: 20000
    },
    {
        id: 'stage-piano',
        name: 'Stage Piano',
        description: 'Heavy compression, tape sat',
        reverbWet: 0.15,
        eqLow: 1, eqMid: 1, eqHigh: 2,
        compThreshold: -30, compRatio: 6,
        chorusWet: 0.05, tremoloWet: 0, distWet: 0.3, filterFreq: 15000
    }
];

