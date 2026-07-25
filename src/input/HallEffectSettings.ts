export type VelocityCurve = 'linear' | 'soft' | 'hard';

export interface HallEffectSettingsState {
  enabled: boolean;
  sensitivity: number;
  minVelocity: number;
  maxVelocity: number;
  curve: VelocityCurve;
}

const STORAGE_KEY = 'piano-hall-effect-settings';

const DEFAULT_SETTINGS: HallEffectSettingsState = {
  enabled: true,
  sensitivity: 6,
  minVelocity: 0.25,
  maxVelocity: 1,
  curve: 'linear',
};

class HallEffectSettingsService {
  private state: HallEffectSettingsState = this.load();

  public get settings() {
    return { ...this.state };
  }

  public update(patch: Partial<HallEffectSettingsState>) {
    this.state = {
      ...this.state,
      ...patch,
      sensitivity: Math.max(1, Math.min(10, patch.sensitivity ?? this.state.sensitivity)),
      minVelocity: Math.max(0.05, Math.min(1, patch.minVelocity ?? this.state.minVelocity)),
      maxVelocity: Math.max(0.05, Math.min(1, patch.maxVelocity ?? this.state.maxVelocity)),
    };

    if (this.state.minVelocity > this.state.maxVelocity) {
      const swap = this.state.minVelocity;
      this.state.minVelocity = this.state.maxVelocity;
      this.state.maxVelocity = swap;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    window.dispatchEvent(new CustomEvent('piano-hall-settings-change', { detail: this.settings }));
  }

  public applyCurve(rawPressure: number) {
    const safePressure = Math.max(0, Math.min(1, rawPressure));
    let curved = safePressure;

    if (this.state.curve === 'soft') {
      curved = Math.sqrt(safePressure);
    } else if (this.state.curve === 'hard') {
      curved = safePressure * safePressure;
    }

    const dynamicRange = this.state.maxVelocity - this.state.minVelocity;
    return Math.max(0.05, Math.min(1, this.state.minVelocity + curved * dynamicRange));
  }

  private load(): HallEffectSettingsState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

export const hallEffectSettings = new HallEffectSettingsService();
