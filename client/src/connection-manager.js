import { SocketMessageType } from "./constants";

export class ConnectionManager {
  constructor(eventListener, signalHandler, deviceManager) {
    this.eventListener = eventListener;
    this.signalHandler = signalHandler; // 依赖信令模块
    this.deviceManager = deviceManager; // 依赖设备管理模块
    this.connections = new Map(); // 存储连接：key=设备ID，value=RTCPeerConnection
    this.dataChannels = new Map(); // key=设备ID，value=RTCDataChannel

    this.configuration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }], // 局域网可选内网STUN/TURN
    };

    //作为接收方时,处理连接信息
    this.#handleSignalMessage();
  }

  // 获取或创建连接
  async connectRemoteDevice(targetDeviceId) {
    // 在创建新连接前先关闭旧连接
    await this.closeConnection("connectRemoteDevice",targetDeviceId); // 新增：确保清理旧连接

    const connection = await this.#createConnection(targetDeviceId);

    this.#createDataChannel(connection, targetDeviceId);

    //发起方，创建offer
    await this.#createOffer(connection, targetDeviceId);

    this.connections.set(targetDeviceId, connection);
  }

  async getDataChannel(targetDeviceId) {
    // 检查现有通道有效性
    if (this.dataChannels.has(targetDeviceId)) {
      const dataChannel = this.dataChannels.get(targetDeviceId);
      if (["open", "connecting"].includes(dataChannel.readyState)) {
        return dataChannel;
      } else {
        this.dataChannels.delete(targetDeviceId);
      }
    }

    // 重新创建连接
    const connection = await this.#createConnection(targetDeviceId);
    const dataChannel = this.#createDataChannel(connection, targetDeviceId);
    this.dataChannels.set(targetDeviceId, dataChannel);

    return dataChannel;
  }

  async closeConnection(m, targetDeviceId) {
    console.log(`被${m}调用`);
    const connection = this.connections.get(targetDeviceId);
    if (connection) {
      // 停止所有候选收集
      connection.onicecandidate = null;
      connection.onconnectionstatechange = null;
      connection.ondatachannel = null;
      connection.onicecandidateerror = null;

      // 关闭数据通道
      const dataChannel = this.dataChannels.get(targetDeviceId);
      if (dataChannel) {
        try {
          dataChannel.close();
        } catch (err) {
          console.warn("数据通道关闭失败:", err);
        }
        this.dataChannels.delete(targetDeviceId);
      }

      // 关闭连接
      try {
        connection.close();
      } catch (err) {
        console.warn("连接关闭失败:", err);
      }
      this.connections.delete(targetDeviceId);

      // 清空ICE候选队列
      if (connection.iceCandidateQueue) {
        connection.iceCandidateQueue = [];
      }
    }
  }
  /**
   * @private
   */
  #handleSignalMessage() {
    this.signalHandler.onSignalMessage(async (message) => {
      const { type, from, data } = message;
      const connection = await this.getConnection(from);
      switch (type) {
        case SocketMessageType.ICE:
          await this.#handleIceCandidate(connection, data);
          break;
        case SocketMessageType.OFFER:
          await this.#handleOffer(connection, data);
          await this.#createAnswer(connection, from);
          break;
        case SocketMessageType.ANSWER:
          await this.#handleAnswer(connection, data);
          break;
        default:
          break;
      }
    });
  }

  async getConnection(targetDeviceId) {
    // 创建新连接
    if (this.connections.has(targetDeviceId)) {
      const connection = this.connections.get(targetDeviceId);
      if (["closed", "failed", "disconnected"].includes(connection.connectionState)) {
        this.connections.delete(targetDeviceId);
        this.dataChannels.delete(targetDeviceId);
      } else {
        return connection;
      }
    }
    return await this.#createConnection(targetDeviceId);
  }

  /**
   * @private
   */
  async #handleIceCandidate(connection, candidate) {
    try {
      if (!connection.remoteDescription) {
        connection.iceCandidateQueue.push(candidate); // ✅ 缓存 ICE 候选
        return;
      }
      // 将接收到的 ICE 候选添加到连接中
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("Successfully added ICE candidate from remote peer");
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  }

  /**
   * 收到offer时
   * @private
   */
  async #handleOffer(connection, offer) {
    try {
      // 将接收到的 Offer 保存
      await connection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log("Successfully set offer from remote peer");
      this.#flushIceCandidateQueue(connection);
    } catch (error) {
      console.error("Failed to set offer:", error);
    }
  }

  /**
   * 收到answer时
   * @private
   */
  async #handleAnswer(connection, answer) {
    try {
      // 将接收到的 answer 保存
      await connection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("Successfully set answer from remote peer");
      this.#flushIceCandidateQueue(connection);
    } catch (error) {
      console.error("Failed to set answer:", error);
    }
  }

  /**
   * @private
   */
  async #createConnection(deviceId) {
    try {
      const connection = new RTCPeerConnection();

      connection.iceCandidateQueue = [];

      connection.onicecandidate = (e) => {
        if (e.candidate) {
          this.signalHandler.sendIceCandidate(deviceId, e.candidate);
        }
      };

      connection.onicecandidateerror = (e) => {
        console.error(`ICE 候选错误（设备 ${targetDeviceId}）:`, e);
        throw e;
      };

      // 监听连接状态变化
      connection.onconnectionstatechange = () => {
        console.log(`连接状态: ${connection.connectionState}`);
        this.eventListener.emit("connectionStateChange", {
          deviceId: deviceId,
          state: connection.connectionState,
        });

        // 连接关闭时清理
        if (["closed", "failed", "disconnected"].includes(connection.connectionState)) {
          // 关闭数据通道
          if (this.dataChannels.has(deviceId)) {
            const dataChannel = this.dataChannels.get(deviceId);
            if (dataChannel.readyState !== "closed") {
              dataChannel.close();
            }
            this.dataChannels.delete(deviceId);
          }
          // 移除连接
          this.connections.delete(deviceId);
        }
      };

      // 监控ICE收集状态
      connection.onicegatheringstatechange = () => {
        console.log("🧊 ICE收集状态:", connection.iceGatheringState);
      };

      // 为双方设置数据通道
      connection.ondatachannel = (event) => {
        console.log("收到数据通道事件，通道名称:", event.channel.label);
        // 接收方：从事件中获取数据通道
        const dataChannel = event.channel;
        this.#setupDataChannel(dataChannel); // 设置事件监听
        this.dataChannels.set(deviceId, dataChannel);
      };

      return connection;
    } catch (error) {
      throw error;
    }
  }

  /**
   * @private
   */
  async #createOffer(connection, targetDeviceId) {
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    // 发送offer到信令服务器
    this.signalHandler.sendOffer(targetDeviceId, offer);
  }

  /**
   * @private
   */
  async #createAnswer(connection, targetDeviceId) {
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    // 发送Answer到信令服务器
    this.signalHandler.sendAnswer(targetDeviceId, answer);
  }

  /**
   * @param {RTCPeerConnection} connection
   * @private
   */
  #createDataChannel(connection, targetDeviceId) {
    const dataChannel = connection.createDataChannel("file-transfer");
    this.#setupDataChannel(dataChannel, targetDeviceId);
    return dataChannel;
  }

  #flushIceCandidateQueue(connection) {
    while (connection.iceCandidateQueue.length > 0) {
      const candidate = connection.iceCandidateQueue.shift(); // 取出第一个候选
      this.#handleIceCandidate(connection, candidate).catch(console.error);
    }
  }

  /**
   * @private
   */
  #setupDataChannel(dataChannel, targetDeviceId) {
    dataChannel.onopen = () => {
      if (dataChannel.readyState === "open") {
        console.log("数据通道已打开:", dataChannel);
        this.eventListener.emit("dataChannelReady", targetDeviceId, dataChannel);
      }
    };

    // 接收数据（关键：触发上层文件接收逻辑）
    dataChannel.onmessage = (event) => {
      // console.log("onmessage", event);
      const rawData = event.data;
      // 支持 Blob 或 ArrayBuffer 格式（根据发送端适配）
      const data = rawData instanceof Blob ? rawData : new Uint8Array(rawData);

      this.eventListener.emit("dataChunkReceived", {
        deviceId: targetDeviceId,
        data: data,
        channelIsLast: dataChannel.bufferedAmount === 0, // 判断是否为最后一片
      });
    };

    dataChannel.onclose = () => {
      console.warn("❌ 数据通道已关闭");
      if (this.dataChannels.get(targetDeviceId) === dataChannel) {
        this.dataChannels.delete(targetDeviceId);
      }
      this.eventListener.emit("dataChannelClosed", {
        deviceId: targetDeviceId,
      });
    };

    dataChannel.onerror = (err) => {
      console.warn("❌ 数据通道错误:", err);
      this.dataChannels.delete(targetDeviceId);
      this.eventListener.emit("dataChannelError", {
        deviceId: targetDeviceId,
        error: err.message,
      });
    };
  }
}
