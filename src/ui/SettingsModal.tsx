import React, { useEffect, useState } from 'react';
import { midiBridge, MidiDevice } from '../input/MidiBridge';
import { velocitySimulator } from '../input/VelocitySimulator';
import { hallEffectSettings, HallEffectSettingsState, VelocityCurve } from '../input/HallEffectSettings';
import { irokHidBridge, HidKeyboardDevice } from '../input/IrokHidBridge';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [devices, setDevices] = useState<MidiDevice[]>(midiBridge.availableInputs);
  const [activeDevice, setActiveDevice] = useState<MidiDevice | null>(midiBridge.getActiveDevice());
  const [hidDevices, setHidDevices] = useState<HidKeyboardDevice[]>(irokHidBridge.availableDevices);
  const [activeHidDevice, setActiveHidDevice] = useState<HidKeyboardDevice | null>(irokHidBridge.activeDevice);
  const [hallSettings, setHallSettings] = useState<HallEffectSettingsState>(hallEffectSettings.settings);
  const [lastHidReport, setLastHidReport] = useState<{ byteLength: number; sample: number[] } | null>(null);
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('piano-high-contrast') === 'true');

  useEffect(() => {
    const handleDevices = (e: any) => setDevices(e.detail.inputs);
    const handleActive = (e: any) => setActiveDevice(e.detail.device);
    const handleHidDevices = (e: any) => {
      setHidDevices(e.detail.devices);
      setActiveHidDevice(e.detail.activeDevice);
    };
    const handleHidActive = (e: any) => setActiveHidDevice(e.detail.device);
    const handleHallSettings = (e: any) => setHallSettings(e.detail);
    const handleHidReport = (e: any) => setLastHidReport({ byteLength: e.detail.byteLength, sample: e.detail.sample });

    window.addEventListener('midi-devices-changed', handleDevices);
    window.addEventListener('midi-device-selected', handleActive);
    window.addEventListener('piano-hid-devices-changed', handleHidDevices);
    window.addEventListener('piano-hid-device-selected', handleHidActive);
    window.addEventListener('piano-hall-settings-change', handleHallSettings);
    window.addEventListener('piano-hid-report', handleHidReport);
    irokHidBridge.init().catch(() => {});

    return () => {
      window.removeEventListener('midi-devices-changed', handleDevices);
      window.removeEventListener('midi-device-selected', handleActive);
      window.removeEventListener('piano-hid-devices-changed', handleHidDevices);
      window.removeEventListener('piano-hid-device-selected', handleHidActive);
      window.removeEventListener('piano-hall-settings-change', handleHallSettings);
      window.removeEventListener('piano-hid-report', handleHidReport);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('piano-high-contrast', { detail: { active: highContrast } }));
  }, [highContrast]);

  const updateHallSettings = (patch: Partial<HallEffectSettingsState>) => {
    hallEffectSettings.update(patch);
    if (patch.sensitivity !== undefined) velocitySimulator.sensitivity = patch.sensitivity;
  };

  const toggleHighContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    localStorage.setItem('piano-high-contrast', next.toString());
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f1115] border border-white/10 rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white" aria-label="Cerrar">
          X
        </button>

        <h2 className="text-xl font-bold tracking-tight text-white mb-6 uppercase">Configuracion</h2>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold">Dispositivos MIDI</h3>
              <button onClick={() => midiBridge.init()} className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded hover:bg-cyan-500/10 transition-colors">
                RESCANEAR
              </button>
            </div>
            {devices.length === 0 ? (
              <div className="text-sm text-slate-500 bg-white/5 p-3 rounded space-y-2">
                <p>No se detectaron dispositivos MIDI. Si el IROK MG75 no tiene modo MIDI, conectalo tambien por WebHID abajo.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {devices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => midiBridge.selectInput(device.id)}
                    className={`p-3 rounded border text-left text-sm transition-colors flex items-center justify-between ${device.id === activeDevice?.id ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <span>{device.name}</span>
                    {device.id === activeDevice?.id && <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="w-full h-px bg-white/10" />

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold">IROK MG75 / Hall Effect</h3>
              <button
                onClick={() => irokHidBridge.requestDevice().catch((err) => alert(err?.message || 'No se pudo abrir WebHID'))}
                className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded hover:bg-cyan-500/10 transition-colors"
              >
                CONECTAR HID
              </button>
            </div>

            {!irokHidBridge.isSupported ? (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-3 rounded">
                WebHID no esta disponible. Usa Chrome o Edge para detectar el IROK MG75 como dispositivo magnetico.
              </p>
            ) : (
              <div className="space-y-2">
                {hidDevices.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-white/5 p-3 rounded">
                    Pulsa conectar HID y elige el IROK MG75. El navegador necesita permiso explicito para leer el dispositivo.
                  </p>
                ) : hidDevices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => irokHidBridge.selectDeviceById(device.id)}
                    className={`p-3 rounded border text-left text-xs transition-colors w-full flex items-center justify-between ${device.id === activeHidDevice?.id ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <span>{device.name}</span>
                    <span className="font-mono text-slate-500">{device.vendorId.toString(16)}:{device.productId.toString(16)}</span>
                  </button>
                ))}
                {lastHidReport && (
                  <div className="text-[10px] text-slate-500 bg-black/30 border border-white/5 rounded p-2 font-mono">
                    HID activo: {lastHidReport.byteLength} bytes [{lastHidReport.sample.join(', ')}]
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-5 rounded-full p-1 transition-colors ${hallSettings.enabled ? 'bg-cyan-500' : 'bg-white/10'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${hallSettings.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <input type="checkbox" checked={hallSettings.enabled} onChange={() => updateHallSettings({ enabled: !hallSettings.enabled })} className="hidden" />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Niveles de presion activados</span>
            </label>
          </section>

          <div className="w-full h-px bg-white/10" />

          <section className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold">Respuesta de Presion</h3>
            <p className="text-xs text-slate-500">
              MIDI usa velocity real. El teclado de PC usa una simulacion estable por rapidez de pulsacion para evitar notas mudas en acordes.
              SHIFT fuerza maximo y CTRL fuerza minimo.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Sensibilidad: {hallSettings.sensitivity}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={hallSettings.sensitivity}
                onChange={(e) => updateHallSettings({ sensitivity: parseInt(e.target.value, 10) })}
                className="w-full appearance-none bg-white/5 h-2 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1 estable</span>
                <span>10 dinamico</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-400">
                Min velocity
                <input type="number" min={0.05} max={1} step={0.05} value={hallSettings.minVelocity}
                  onChange={(e) => updateHallSettings({ minVelocity: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200" />
              </label>
              <label className="space-y-1 text-xs text-slate-400">
                Max velocity
                <input type="number" min={0.05} max={1} step={0.05} value={hallSettings.maxVelocity}
                  onChange={(e) => updateHallSettings({ maxVelocity: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200" />
              </label>
            </div>

            <select
              value={hallSettings.curve}
              onChange={(e) => updateHallSettings({ curve: e.target.value as VelocityCurve })}
              className="w-full bg-[#16181d] border border-white/10 text-white text-sm rounded px-2 py-1.5 outline-none"
            >
              <option value="linear">Curva lineal</option>
              <option value="soft">Curva suave</option>
              <option value="hard">Curva dura</option>
            </select>
          </section>

          <div className="w-full h-px bg-white/10" />

          <section className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold">Accesibilidad</h3>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-5 rounded-full p-1 transition-colors ${highContrast ? 'bg-cyan-500' : 'bg-white/10'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${highContrast ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <input type="checkbox" checked={highContrast} onChange={toggleHighContrast} className="hidden" />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Modo de alto contraste</span>
            </label>
          </section>
        </div>
      </div>
    </div>
  );
};
