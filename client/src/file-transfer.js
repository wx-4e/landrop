import { nanoid } from "nanoid";

export class FileTransfer {
  constructor(eventListener, connectionManager) {
    this.eventListener = eventListener;
    this.connectionManager = connectionManager; // 依赖 ConnectionManager 实例
    this.chunkSize = 1024 * 16; // 默认分块大小 16kb
    this.activeTransfers = new Map(); // 存储进行中的传输：key=文件ID，value=传输状态对象
    this.receivingTransfers = new Map(); // 新增：接收中的传输状态
    this.localDeviceId = sessionStorage.getItem("deviceId");
  }

  /**
   * 发送文件到目标设备
   * @param {File} file 要发送的文件对象
   * @param {string} targetDeviceId 目标设备 ID
   * @returns {Promise<string>} 文件传输完成后的唯一 ID（用于跟踪）
   */
  async sendFile(targetDeviceId, file, dataChannel) {
    const fileId = nanoid(); // 生成全局唯一文件 ID
    const transferState = {
      fileId,
      file,
      targetDeviceId,
      totalChunks: Math.ceil(file.size / this.chunkSize),
      chunkSize: this.chunkSize,
      sentChunks: new Set(), // 记录已发送的块索引
      progress: 0, // 0-1 进度值
      status: "pending", // pending | sending | completed | failed
      resolve: null,
      reject: null,
    };

    // 初始化 Promise 用于外部等待
    transferState.promise = new Promise((resolve, reject) => {
      transferState.resolve = resolve;
      transferState.reject = reject;
    });

    this.activeTransfers.set(fileId, transferState);

    try {
      // 发送文件元数据（触发接收方准备）
      this.#sendFileMetadata(targetDeviceId, dataChannel, transferState);

      // 开始分块发送
      this.#sendChunks(dataChannel, transferState);
    } catch (error) {
      this.#handleTransferError(transferState, error);
    }

    return fileId;
  }

  /**
   * 发送文件元数据（触发接收方准备）
   * @private
   */
  #sendFileMetadata(targetDeviceId, dataChannel, transferState) {
    const metadata = {
      type: "file-metadata",
      fileId: transferState.fileId,
      fileName: transferState.file.name,
      fileSize: transferState.file.size,
      fileType: transferState.file.type,
      totalChunks: transferState.totalChunks,
      chunkSize: this.chunkSize,
    };

    const metadataBuffer = new TextEncoder().encode(JSON.stringify(metadata));
    dataChannel.send(metadataBuffer);
  }

  /**
   * 分块发送文件内容
   * @private
   */
  async #sendChunks(dataChannel, transferState) {
    const { file, fileId, chunkSize, totalChunks } = transferState;
    const reader = new FileReader();

    let offset = 0;
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // 读取当前块数据
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);

      // 等待读取完成
      await new Promise((resolve) => {
        reader.onload = () => {
          const chunkData = reader.result;

          // 1. 构造元数据对象
          const metadata = {
            type: "file-chunk",
            fileId: transferState.fileId,
            chunkIndex: chunkIndex,
            isLast: chunkIndex === totalChunks - 1,
          };

          // 2. 序列化元数据为 JSON 字符串，并编码为 Uint8Array（UTF-8）
          const metaJsonStr = JSON.stringify(metadata);
          const metaBytes = new TextEncoder().encode(metaJsonStr);
          const metaLength = metaBytes.byteLength; // 元数据的字节数

          // 3. 计算总缓冲区大小：2（长度字段） + 元数据长度 + 文件块长度
          const chunkUint8 = new Uint8Array(chunkData);
          const totalLength = 2 + metaLength + chunkUint8.length;
          const payload = new Uint8Array(totalLength);

          // 4. 写入元数据长度（前 2 字节）
          const dataView = new DataView(payload.buffer);
          dataView.setUint16(0, metaLength); // 仅写入元数据的字节数

          // 5. 写入元数据（紧跟长度字段之后）
          payload.set(metaBytes, 2); // 从第 2 字节开始写入元数据

          // 6. 写入文件块数据（元数据之后）
          payload.set(chunkUint8, 2 + metaLength); // 从元数据结束位置开始写入块数据

          // 发送数据块
          dataChannel.send(payload.buffer);

          transferState.sentChunks.add(chunkIndex);
          transferState.progress = transferState.sentChunks.size / totalChunks;

          // 触发进度更新事件
          this.eventListener.emit("transferProgress", {
            fileId,
            progress: transferState.progress,
            deviceId: transferState.targetDeviceId,
          });

          resolve();
        };
        reader.onerror = (error) => {
          this.#handleTransferError(transferState, reader.error);
          resolve();
        };
      });

      offset += chunkSize;
    }

    transferState.status = "completed";
    transferState.resolve(transferState.fileId);
  }

  /**
   * 处理接收到的数据块（由外部事件监听器调用）
   * @param {string} deviceId 发送方设备ID
   * @param {ArrayBuffer} data 接收到的二进制数据
   * @param {boolean} channelIsLast 是否是通道的最后一块数据
   */
  async receiveFile(deviceId, data, channelIsLast) {
    let receiveState;
    try {
      if (this.#isMetadataPacket(data)) {
        // 处理元数据包
        receiveState = this.#handleMetadata(deviceId, data);
        console.log("isMetadataPacket");
      } else {
        // 处理数据块包
        receiveState = this.#handleDataChunk(data);
      }
      // 检查是否完成
      if (
        receiveState &&
        (receiveState.receivedChunks.size === receiveState.totalChunks ||
          (channelIsLast && receiveState?.lastChunkProcessed))
      ) {
        this.#assembleFile(deviceId, receiveState);
      }
    } catch (error) {
      console.log(error);
      if (receiveState && receiveState.fileId) {
        this.#handleTransferError(receiveState, error);
      }
    }
  }

  /**
   * 判断是否为元数据包
   * @private
   */
  #isMetadataPacket(data) {
    // 尝试解析JSON，如果有有效元数据字段则是元数据包
    try {
      const str = new TextDecoder().decode(data);
      const metadata = JSON.parse(str.replaceAll("\u0000S", ""));
      return metadata?.type === "file-metadata";
    } catch {
      return false;
    }
  }

  /**
   * 处理文件元数据
   * @private
   */
  #handleMetadata(deviceId, data) {
    const decoder = new TextDecoder();
    const str = decoder.decode(data);
    const jsonStr = str.replaceAll("\u0000S", "");
    const metadata = JSON.parse(jsonStr);

    // 创建接收状态
    const receiveState = {
      deviceId,
      fileId: metadata.fileId,
      totalChunks: metadata.totalChunks,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.fileType,
      receivedChunks: new Map(),
      progress: 0,
      status: "receiving",
      lastChunkProcessed: false,
    };

    // 保存状态
    this.receivingTransfers.set(metadata.fileId, receiveState);
    return receiveState;
  }

  /**
   * 处理文件数据块
   * @private
   */
  #handleDataChunk(data) {
    const dataView = new DataView(data.buffer);
    const metaLength = dataView.getUint16(0);
    const metaBytes = new Uint8Array(data.slice(2, 2 + metaLength));
    const chunkData = new Uint8Array(data.slice(2 + metaLength));

    // 解析元数据
    const decoder = new TextDecoder();
    const metaJsonStr = decoder.decode(metaBytes).replaceAll("\u0000S", "");
    const metadata = JSON.parse(metaJsonStr);

    // 获取接收状态
    const fileId = metadata.fileId;
    const receiveState = this.receivingTransfers.get(fileId);
    if (!receiveState) return null;

    // 处理数据块
    const chunkIndex = metadata.chunkIndex;
    if (!receiveState.receivedChunks.has(chunkIndex)) {
      receiveState.receivedChunks.set(chunkIndex, chunkData);
      receiveState.progress = receiveState.receivedChunks.size / receiveState.totalChunks;

      // 标记是否为最后一块
      if (metadata.isLast) {
        receiveState.lastChunkProcessed = true;
      }
    }

    return receiveState;
  }

  /**
   * 组装接收的文件块
   * @private
   */
  #assembleFile(deviceId, receiveState) {
    const { fileId, receivedChunks, fileName, fileType, totalChunks } = receiveState;

    // 验证完整性
    if (receivedChunks.size !== totalChunks) {
      throw new Error(`文件不完整，已接收 ${receivedChunks.size}/${totalChunks} 块`);
    }

    // 按顺序合并块
    const chunks = Array.from({ length: totalChunks }, (_, i) => receivedChunks.get(i));
    const mergedArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));

    let offset = 0;
    chunks.forEach((chunk) => {
      mergedArray.set(chunk, offset);
      offset += chunk.length;
    });

    // 生成文件并下载
    const file = new File([mergedArray], fileName, { type: fileType });
    this.#downloadFile(file);

    // 清理状态
    this.receivingTransfers.delete(fileId);

    // 触发事件
    this.eventListener.emit("fileReceived", {
      deviceId,
      fileId,
      fileName,
      fileSize: file.size,
      fileType,
    });
  }

  /**
   * 下载文件到用户设备
   * @private
   */
  #downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // /**
  //  * 接收文件（需配合发送方的元数据触发）
  //  * @param {string} localDeviceId 监听的目标设备 ID（通常是自己的设备 ID）
  //  * @returns {Promise<File>} 接收到的文件对象
  //  */
  // async receiveFile(localDeviceId) {
  //   return new Promise((resolve, reject) => {
  //     const receiveState = {
  //       deviceId: "",
  //       receivedChunks: new Map(),
  //       fileId: null,
  //       progress: 0,
  //       status: "pending",
  //       fileSize: 0,
  //       resolve,
  //       reject,
  //     };
  //     // 监听数据块接收事件（仅注册一次）
  //     const onDataChunk = ({ deviceId, data, channelIsLast }) => {
  //       // 初始化接收状态
  //       const decoder = new TextDecoder();

  //       let isLast = false;
  //       // console.log("onDataChunk", msgDeviceId, localDeviceId);
  //       // 首次接收：解析元数据
  //       if (!receiveState.fileId) {
  //         try {
  //           const str = decoder.decode(data);
  //           const jsonStr = str.replaceAll("\u0000S", "");
  //           const metadata = JSON.parse(jsonStr);
  //           console.log("onDataChunk-metadata", metadata);

  //           receiveState.fileId = metadata.fileId;
  //           receiveState.totalChunks = metadata.totalChunks;
  //           receiveState.progress = 0;
  //           receiveState.fileName = metadata.fileName;
  //           receiveState.fileSize = metadata.fileSize;

  //           this.activeTransfers.set(receiveState.fileId, receiveState); // 注册全局跟踪
  //         } catch (error) {
  //           this.#handleTransferError(receiveState, error);
  //         }
  //         return;
  //       }
  //       // 后续接收：解析二进制数据包（元数据 + 块内容）
  //       try {
  //         const dataView = new DataView(data.buffer);
  //         const metaLength = dataView.getUint16(0); // 前 2 字节是元数据长度
  //         const metaBytes = data.subarray(2, 2 + metaLength);
  //         const chunkData = data.subarray(2 + metaLength);
  //         const str = decoder.decode(metaBytes);
  //         const jsonStr = str.replaceAll("\u0000S", "");

  //         const metadata = JSON.parse(jsonStr);
  //         const chunkIndex = metadata.chunkIndex;
  //         isLast = metadata.isLast;
  //         console.log("onDataChunk-chunkdata", metadata);

  //         // 避免重复接收同一块
  //         if (!receiveState.receivedChunks.has(chunkIndex)) {
  //           receiveState.receivedChunks.set(chunkIndex, chunkData);
  //           receiveState.progress = receiveState.receivedChunks.size / receiveState.totalChunks;

  //           // 检查是否接收完成
  //           if ((channelIsLast && isLast) || receiveState.receivedChunks.size === receiveState.totalChunks) {
  //             this.#assembleFile(receiveState); // 组装文件
  //           }
  //         }
  //       } catch (error) {
  //         this.#handleTransferError(receiveState, error);
  //       }
  //     };

  //     this.eventListener.on("dataChunkReceived", onDataChunk);
  //   });
  // }

  // /**
  //  * 组装接收的文件块
  //  * @private
  //  */
  // async #assembleFile(receiveState) {
  //   const { fileId, receivedChunks, fileName, fileType, totalChunks } = receiveState;

  //   // 检查是否所有块都已接收
  //   if (receivedChunks.size !== totalChunks) {
  //     this.#handleTransferError(receiveState, new Error(`缺少块（总 ${totalChunks}，已接收 ${receivedChunks.size}）`));
  //     return;
  //   }

  //   // 按顺序合并块
  //   const chunks = Array.from({ length: totalChunks }, (_, i) => receivedChunks.get(i));
  //   const mergedArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0));
  //   let offset = 0;
  //   for (const chunk of chunks) {
  //     mergedArray.set(chunk, offset);
  //     offset += chunk.byteLength;
  //   }

  //   // 生成文件对象
  //   const file = new File([mergedArray], fileName, { type: fileType });
  //   receiveState.status = "completed";
  //   receiveState.resolve(file);
  // }

  /**
   * 处理传输错误
   * @private
   */
  #handleTransferError(transferState, error) {
    transferState.status = "failed";
    transferState.reject(error);
    this.eventListener.emit("transferError", {
      fileId: transferState.fileId,
      deviceId: transferState.targetDeviceId,
      error: error.message,
    });
  }
}
