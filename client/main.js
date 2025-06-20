import { Device } from "./src/device";
import { EventListener } from "./src/event-listener";
import { SignalHandler } from "./src/signal-handler";
import { DeviceManager } from "./src/device-manager";
import { Renderer } from "./src/renderer";
import { ConnectionManager } from "./src/connection-manager";
import { FileTransfer } from "./src/file-transfer";

class Main {
  constructor() {
    //初始化设备实体
    this.device = new Device();

    //1. 初始化事件监听器
    this.eventListener = new EventListener();

    //2. 初始化设备管理器，注入事件监听器，监听设备更新
    this.deviceManager = new DeviceManager(this.eventListener);

    //3. 建立socket连接，连接信令服务,处理连接信号,注册设备更新回调
    this.signalHandler = new SignalHandler(this.eventListener);

    //4. 初始化UI渲染器，注入事件监听器，监听点击事件
    this.renderer = new Renderer(this.eventListener);

    //5. 初始化webrtc连接管理器，监听文件发送事件
    this.connectionManager = new ConnectionManager(this.eventListener, this.signalHandler, this.deviceManager);

    //6. 初始化文件发送器，用于实际发送文件
    this.fileTransfer = new FileTransfer(this.eventListener, this.connectionManager);

    this.fileInputEl = document.getElementById("file-input");
  }
  run() {
    //1. 注册基础事件
    this.#registerEvent();

    //2. 注册设备
    this.#registerDevice();
  }

  #registerEvent() {
    //1. 监听设备更新事件
    this.eventListener.on("devicesUpdated", async (devices) => {
      await this.deviceManager.updateDevices(devices); // 更新自身设备列表
    });
    //2. 监听设备就绪事件,就绪后更新UI
    this.eventListener.on("devicesReady", (devices) => {
      this.renderer.render(devices); // 渲染最新设备列表
    });

    //按钮点击事件注册
    this.eventListener.on("sendFileEvent", async (targetDeviceId, file) => {
      console.log(`用户点击了设备：${targetDeviceId}，开始传输文件`);

      try {
        // 创建连接
        await this.connectionManager.connectRemoteDevice(targetDeviceId);
        const channel = await this.connectionManager.getDataChannel(targetDeviceId);
        console.log("连接器获取:", channel);

        if (channel.readyState === "open") {
          // 如果已经打开，直接发送文件
          const fileId = await this.fileTransfer.sendFile(targetDeviceId, file, channel);
          console.log(`文件发送成功：${fileId}`);
          return;
        }

        const onChannelReady = async (deviceId, dataChnnel) => {
          this.eventListener.off("dataChannelReady", onChannelReady);

          if (deviceId !== targetDeviceId) {
            return; // 不是当前设备的事件，忽略
          }

          console.log("onChannelReady1 " + deviceId, channel);
          console.log("onChannelReady2 " + deviceId, dataChnnel);

          // 再次确认通道状态（虽然事件触发时应该是open，但以防万一）
          if (dataChnnel.readyState === "open") {
            const fileId = this.fileTransfer.sendFile(deviceId, file, dataChnnel);
            console.log(`文件发送成功：${fileId}`);
          } else {
            console.error("数据通道在事件触发时状态不是open:", channel.readyState, dataChnnel);
          }
        };
        this.eventListener.on("dataChannelReady", onChannelReady);

        // 可选：通知UI显示传输结果（如提示用户）
        // this.renderer.showTransferSuccess(targetDeviceId, selectedFile.name);
      } catch (error) {
        console.error(error);
        await this.connectionManager.closeConnection("sendFileEvent", targetDeviceId);
      }

      //
    });

    this.eventListener.on("dataChunkReceived", async ({ deviceId, data, channelIsLast }) => {
      await this.fileTransfer.receiveFile(deviceId, data, channelIsLast);
    });

    this.eventListener.on("fileReceived", async ({ deviceId, fileId, fileName, fileSize, fileType }) => {
      await this.connectionManager.closeConnection("fileReceived", deviceId);
      //TODO:UI渲染
      console.log("文件接收完毕，清空链接");
    });

    //监听文件传输异常
    this.eventListener.on("transferError", async (e) => {
      console.log("文件传输发生错误：", e);
    });
  }

  #registerDevice() {
    this.signalHandler.deviceJoined(this.device);
  }
}

(function main() {
  const main = new Main();
  main.run();
})();
