import SocketService from "./socket-service";
import { SocketMessageType } from "./constants";

export class SignalHandler {
  constructor(eventListener) {
    this.eventListener = eventListener;
    this.localDeviceId = null;
    this.#updateDevices();
  }

  #updateDevices() {
    SocketService.on(SocketMessageType.LIST, (devices) => {
      console.log("[SignalHandler] 注册设备更新回调");
      this.eventListener.emit("devicesUpdated", devices);
    });
    this.localDeviceId = sessionStorage.getItem("deviceId");
  }

  deviceJoined(device) {
    SocketService.emit(SocketMessageType.JOINED, device);
  }

  sendOffer(targetDeviceId, offer) {
    this.#sendWebRTCMessage(
      SocketMessageType.OFFER,
      targetDeviceId,
      this.localDeviceId,
      offer
    );
  }

  // 发送Answer到对端（新增）
  sendAnswer(targetDeviceId, answer) {
    this.#sendWebRTCMessage(
      SocketMessageType.ANSWER,
      targetDeviceId,
      this.localDeviceId,
      answer
    );
  }

  /**
   * 发送ice
   * @param {string} deviceId
   * @param {any} candidate
   */
  sendIceCandidate(targetDeviceId, candidate) {
    this.#sendWebRTCMessage(
      SocketMessageType.ICE,
      targetDeviceId,
      this.localDeviceId,
      candidate
    );
  }

  /**
   * 由ConnectionManager 注册
   * @param {Function} callback
   */
  onSignalMessage(callback) {
    try {
      SocketService.on(SocketMessageType.RTC, (message) => {
        if (message.to === this.localDeviceId) {
          callback(message);
        }
      });
    } catch (error) {
      console.error("receive rtc meeeage error:", error);
    }
  }

  #sendWebRTCMessage(type, to, from, data) {
    try {
      SocketService.emit(SocketMessageType.RTC, {
        type: type,
        to: to,
        from: from,
        data: data,
      });
    } catch (error) {
      console.error("send rtc meeeage error:", error);
    }
  }
}
