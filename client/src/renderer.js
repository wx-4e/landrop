import { DeviceUITemplate } from "./device-ui-template";

export class Renderer {
  /**
   * 渲染器
   * @param {Object} eventListener 事件监听器
   */
  constructor(eventListener) {
    this.eventListener = eventListener;
    this.deviceTemplate = new DeviceUITemplate();
    this.ul = document.getElementById("device-list");
  }

  render(devices = []) {
    this.#renderDevices(devices);
  }

  #renderDevices(devices) {
    //先清空旧列表
    this.#clearList();

    //构建标题
    const title = this.#title();

    //构建设备列表
    const list = this.#list(devices);

    //渲染UI
    this.#render(title, list);
  }

  #clearList() {
    this.ul.innerHTML = "";
  }

  #title() {
    const li = document.createElement("li");
    li.className = "p-4 pb-2 text-xs opacity-60 tracking-wide";
    li.innerText = "设备列表";
    return li;
  }

  #list(devices) {
    const children = [];
    for (const device of devices) {
      const li = this.deviceTemplate.li(device.id, device.name, device.ip, device.os, "status-success", "animate-ping");
      //为每个li绑定事件
      this.#bindClickEvents(li, device.id);

      children.push(li);
    }

    return children;
  }

  #render(title, list) {
    this.ul.appendChild(title);
    this.ul.append(...list);
  }

  /**
   * 点击事件绑定
   * @param {HTMLElement} li
   * @param {string} socketId
   */
  #bindClickEvents(li, deviceId) {
    li.addEventListener("click", (e) => {
      const isTargetButton = e.target.closest("button.sendbtn.btn.btn-square.btn-ghost");
      if (isTargetButton) {
        const fileInputEl = document.getElementById("file-input");
        // 定义文件选择后的处理逻辑
        const handleFileSelect = async (e) => {
          console.log("handleFileSelect被点击");
          const files = e.target.files;

          if (files.length === 0) {
            console.log("用户取消了文件选择");
            fileInputEl.removeEventListener("change", handleFileSelect);
            return;
          }

          const selectedFile = files[0];
          console.log(`用户选择了文件：${selectedFile.name}（大小：${selectedFile.size}字节）`);

          try {
            // 通过eventListener触发自定义事件
            this.eventListener.emit("sendFileEvent", deviceId, selectedFile);
          } catch (error) {
            console.error(`创建连接 ${selectedFile?.name || "未知文件"} 失败：`, error);
          } finally {
            fileInputEl.removeEventListener("change", handleFileSelect);
            fileInputEl.value = "";
          }
        };

        // 绑定文件选择监听器
        fileInputEl.addEventListener("change", handleFileSelect);
        // 直接触发点击
        fileInputEl.click();
      }
    });
  }
}
