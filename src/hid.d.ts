interface HIDDevice extends EventTarget {
  opened: boolean;
  productId: number;
  productName: string;
  vendorId: number;
  open(): Promise<void>;
  close(): Promise<void>;
}

interface HIDConnectionEvent extends Event {
  device: HIDDevice;
}

interface HIDInputReportEvent extends Event {
  data: DataView;
  device: HIDDevice;
  reportId: number;
}

interface HIDDeviceRequestOptions {
  filters: Array<{
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }>;
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}
