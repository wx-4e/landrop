import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const devices = new Map();
const sockeIdToDeviceIdMap = new Map();

io.on("connection", (socket) => {
  const ip = socket.handshake.address;
  console.log("一个设备已连接", socket.id, "ip:", ip);
  // 注册新设备
  socket.on("device-joined", (device) => {
    if (!device || !device.id) {
      return;
    }
    sockeIdToDeviceIdMap.set(socket.id, device.id);
    devices.set(device.id, {
      ...device,
      ip: ip,
      socketId: socket.id,
      timestamp: Date.now(),
    });
    io.emit("device-list", Array.from(devices.values()));
  });

  socket.on("rtc-signal", (message) => {
    const device = devices.get(message.to);
    if (device) {
      if (message.type === "ice-candidate") {
        console.log("ice-candidate:", message.from);
      }
      io.to(device.socketId).emit("rtc-signal", message);
    }
  });

  // 设备断开时清理
  socket.on("disconnect", () => {
    const deviceId = sockeIdToDeviceIdMap.get(socket.id);
    devices.delete(deviceId);
    sockeIdToDeviceIdMap.delete(socket.id);
    io.emit("device-list", Array.from(devices.values()));
  });
});

httpServer.listen(9000, "0.0.0.0", () => {
  console.log("信令服务器启动成功 -> port: 9000");
});
