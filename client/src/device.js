import { nanoid } from "nanoid";
import { getDeviceInfo } from "./utils/device-info";

export class Device {
  constructor() {
    this.id = "";
    this.name = "";
    this.ip = "";
    this.os = "";
    this.userAnent = "";
    this.socketId = "";

    this.#initProperty();
  }
  #initProperty() {
    const deviceId = sessionStorage.getItem("deviceId");
    this.id = deviceId || nanoid();
    sessionStorage.setItem("deviceId", this.id);
    const baseDeviceInfo = getDeviceInfo();
    this.name = baseDeviceInfo.deviceName;
    this.os = baseDeviceInfo.os;
    this.userAnent = baseDeviceInfo.userAgent;
  }

  setServerProperty(socketId, ip) {
    this.socketId = socketId;
    this.ip = ip;
  }

  addConnect(device, rtcPeerConnection) {
    this.peerConnectionMap.set(device.id, rtcPeerConnection);
  }
}
