export interface ScoreStats {
  correct: number;
  missed: number;
  timingErrorMs: number;
  combo: number;
  maxCombo: number;
  totalStrokes: number;
}

class ScoringEngineService {
  public stats: ScoreStats = {
    correct: 0,
    missed: 0,
    timingErrorMs: 0,
    combo: 0,
    maxCombo: 0,
    totalStrokes: 0
  };

  private totalErrors = 0;

  public reset() {
    this.stats = { correct: 0, missed: 0, timingErrorMs: 0, combo: 0, maxCombo: 0, totalStrokes: 0 };
    this.totalErrors = 0;
    this.notify();
  }

  public registerHit(errorMs: number) {
    this.stats.correct++;
    this.stats.combo++;
    if (this.stats.combo > this.stats.maxCombo) {
      this.stats.maxCombo = this.stats.combo;
    }
    
    this.stats.totalStrokes++;
    this.totalErrors += Math.abs(errorMs);
    this.stats.timingErrorMs = this.totalErrors / this.stats.totalStrokes;
    
    this.notify();
  }

  public registerMiss() {
    this.stats.missed++;
    this.stats.totalStrokes++;
    this.stats.combo = 0;
    this.notify();
  }

  private notify() {
    window.dispatchEvent(new CustomEvent('scoring-update', { detail: { ...this.stats } }));
  }
}

export const scoringEngine = new ScoringEngineService();
