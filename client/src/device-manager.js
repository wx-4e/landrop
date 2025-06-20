export class DeviceManager {
  constructor(eventListener) {
    this.eventListener = eventListener; // 注入事件监听器

    this.devices = new Map();
  }

  get devicesList() {
    return [...this.devices.values()].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  }

  get localDeviceId() {
    return sessionStorage.getItem("deviceId");
  }

  getSocketId(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      return device.socketId;
    }
    return null;
  }

  async updateDevices(devices) {
    this.#recordDevice(devices);
    this.eventListener.emit("devicesReady", this.devicesList); // 触发就绪事件
  }

  handleDeviceAction(event, deviceId) {
    const target = event.target;

    if (!target.matches(".sendbtn, .icon")) return;

    console.log("操作设备 ID:", deviceId);

    // const fileInput = document.getElementById("file-input");
    // this.targetDevice = this.devices.get(deviceId);
    // fileInput.click();
  }

  #recordDevice(devices) {
    this.devices.clear();
    for (const device of devices) {
      this.devices.set(device.id, device);
    }
  }
}
