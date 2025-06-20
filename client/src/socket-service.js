import { io } from "socket.io-client";

const SOCKET_CONFIG = {
  url: "http://192.168.0.2:9000",
  options: {
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  },
};

class SocketService {
  constructor() {
    if (!SocketService.instance) {
      this.socket = io(SOCKET_CONFIG.url, SOCKET_CONFIG.options); // 唯一socket实例
      this.listeners = new Map(); // 事件监听器仓库
      this.connect();
    }
    return SocketService.instance;
  }

  connect() {
    const handleConnect = () => {
      this.socket.off("connect", handleConnect); // 移除一次性监听
      console.log("信令服务器已连接");
    };

    const handleError = (err) => {
      console.error("连接失败:", err);
      this.socket.off("connect#error", handleError);
    };

    const handleDisconnect = (reason) => {
      console.log("断开连接:", reason);
      this.socket.off("disconnect", handleDisconnect);
    };

    this.socket.once("connect", handleConnect.bind(this));
    this.socket.once("connect#error", handleError.bind(this));
    this.socket.once("disconnect", handleDisconnect.bind(this));
  }

  // 统一事件监听方法
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.socket.on(event, callback);
      this.listeners.set(event, callback);
    }
  }

  // 统一事件移除方法
  off(event) {
    if (this.listeners.has(event)) {
      this.socket.off(event, this.listeners.get(event));
      this.listeners.delete(event);
    }
  }

  // 封装发送方法
  emit(event, data) {
    this.socket.emit(event, data);
  }
}

// 实现单例模式
SocketService.instance = null;
export default new SocketService();
