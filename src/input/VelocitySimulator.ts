import { hallEffectSettings } from './HallEffectSettings';

export class VelocitySimulatorService {
  public sensitivity = 5;
  private lastKeyTime = 0;

  public getVelocity(isShiftKey: boolean, isCtrlKey: boolean): number {
    const settings = hallEffectSettings.settings;

    if (!settings.enabled) {
      return isShiftKey ? 1 : isCtrlKey ? 0.35 : 0.75;
    }

    const now = performance.now();
    const gapMs = this.lastKeyTime === 0 ? 120 : now - this.lastKeyTime;
    this.lastKeyTime = now;

    const timingPressure = 1 - Math.max(0, Math.min(1, (gapMs - 20) / 180));
    const sensitivityBoost = settings.sensitivity / 10;
    let pressure = 0.45 + timingPressure * 0.45 * sensitivityBoost;

    if (isShiftKey) pressure = 1;
    if (isCtrlKey) pressure = 0.15;

    return hallEffectSettings.applyCurve(pressure);
  }
}

export const velocitySimulator = new VelocitySimulatorService();
