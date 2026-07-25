import { inputDebug } from '../debug/InputDebug';

export interface HidKeyboardDevice {
  id: string;
  name: string;
  vendorId: number;
  productId: number;
  opened: boolean;
}

const IROK_NAME_MATCH = /irok|mg75|sparklink/i;

class IrokHidBridgeService {
  private devices: HIDDevice[] = [];
  private selectedDevice: HIDDevice | null = null;

  public get isSupported() {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  public get availableDevices(): HidKeyboardDevice[] {
    return this.devices.map(this.toPublicDevice);
  }

  public get activeDevice(): HidKeyboardDevice | null {
    return this.selectedDevice ? this.toPublicDevice(this.selectedDevice) : null;
  }

  public async init() {
    if (!this.isSupported) return;
    const hid = (navigator as any).hid as HID;
    this.devices = await hid.getDevices();
    this.autoSelectIrok();
    this.notify();

    hid.addEventListener?.('connect', this.handleDeviceConnect);
    hid.addEventListener?.('disconnect', this.handleDeviceDisconnect);
  }

  public async requestDevice() {
    if (!this.isSupported) {
      window.dispatchEvent(new CustomEvent('piano-hid-error', { detail: { message: 'WebHID no esta disponible en este navegador.' } }));
      return;
    }

    const hid = (navigator as any).hid as HID;
    const selected = await hid.requestDevice({ filters: [] });
    if (selected.length === 0) return;

    this.devices = await hid.getDevices();
    await this.selectDevice(selected[0]);
    this.notify();
  }

  public async selectDeviceById(id: string) {
    const target = this.devices.find(device => this.getId(device) === id);
    if (target) await this.selectDevice(target);
  }

  private async selectDevice(device: HIDDevice) {
    if (this.selectedDevice) {
      this.selectedDevice.removeEventListener('inputreport', this.handleInputReport as EventListener);
    }

    this.selectedDevice = device;
    if (!device.opened) {
      await device.open();
    }
    device.addEventListener('inputreport', this.handleInputReport as EventListener);
    window.dispatchEvent(new CustomEvent('piano-hid-device-selected', { detail: { device: this.toPublicDevice(device) } }));
  }

  private autoSelectIrok() {
    const preferred = this.devices.find(device => IROK_NAME_MATCH.test(device.productName || '')) || this.devices[0];
    if (preferred && !this.selectedDevice) {
      this.selectDevice(preferred).catch((error) => {
        window.dispatchEvent(new CustomEvent('piano-hid-error', { detail: { message: error?.message || 'No se pudo abrir el dispositivo HID.' } }));
      });
    }
  }

  private handleDeviceConnect = async (event: HIDConnectionEvent) => {
    if (!this.devices.some(device => this.getId(device) === this.getId(event.device))) {
      this.devices = [...this.devices, event.device];
    }
    this.autoSelectIrok();
    this.notify();
  };

  private handleDeviceDisconnect = (event: HIDConnectionEvent) => {
    this.devices = this.devices.filter(device => this.getId(device) !== this.getId(event.device));
    if (this.selectedDevice && this.getId(this.selectedDevice) === this.getId(event.device)) {
      this.selectedDevice = null;
    }
    this.notify();
  };

  private handleInputReport = (event: HIDInputReportEvent) => {
    const bytes = Array.from(new Uint8Array(event.data.buffer));
    window.dispatchEvent(new CustomEvent('piano-hid-report', {
      detail: {
        reportId: event.reportId,
        byteLength: bytes.length,
        sample: bytes.slice(0, 16),
      },
    }));
    inputDebug.log({
      action: 'info',
      source: 'hid',
      rawInput: { hidCode: `report:${event.reportId}:${bytes.slice(0, 16).join(',')}` },
      match: true,
      matchLabel: 'INFO',
      mismatchReason: 'Raw HID report received; this bridge does not map HID reports to piano notes yet.',
    });
  };

  private notify() {
    window.dispatchEvent(new CustomEvent('piano-hid-devices-changed', {
      detail: { devices: this.availableDevices, activeDevice: this.activeDevice },
    }));
  }

  private toPublicDevice = (device: HIDDevice): HidKeyboardDevice => ({
    id: this.getId(device),
    name: device.productName || 'Dispositivo HID',
    vendorId: device.vendorId,
    productId: device.productId,
    opened: device.opened,
  });

  private getId(device: HIDDevice) {
    return `${device.vendorId}:${device.productId}:${device.productName || 'hid'}`;
  }
}

export const irokHidBridge = new IrokHidBridgeService();
