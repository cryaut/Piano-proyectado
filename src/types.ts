export interface SongNote {
    note: string;
    time: number; // in milliseconds (or beats, depending on context context)
    duration: number;
    velocity: number;
    hand?: 'left' | 'right';
}

export interface Recording {
    id: string;
    title: string;
    date: number;
    durationMs: number;
    noteCount: number;
    instrument: string;
    data: SongNote[];
    sustainEvents?: { time: number; value: boolean }[];
}
