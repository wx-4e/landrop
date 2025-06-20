export class DeviceUITemplate {
  /**
   * <li></li>
   * @param {string} deviceName
   * @param {string} ip
   * @param {string} status 在线状态：status-success 传输中：status-info
   * @param {string} animation 在线动画：animate-ping 传输动画：animate-bounce
   * @param {string} os
   * @return {HTMLLIElement} li
   */
  li(deviceId, deviceName, ip, os, status, animation) {
    const icon = this.#icon(os);
    const transferButton = this.#transferButton(deviceId);
    return this.#template(
      deviceName,
      ip,
      transferButton,
      status,
      animation,
      icon
    );
  }

  #template(deviceName, ip, transferButton, status, animation, icon) {
    const li = document.createElement("li");
    li.className = "list-row";
    li.innerHTML = `<div>
                  <img class="size-10" src="${icon}" />
                </div>
                <div>
                  <div class="text-sm">${deviceName}</div>
                  <div class="text-xs font-semibold opacity-60">
                    IP: ${ip}
                  </div>
                </div>
                ${transferButton}
                <button class="btn btn-square btn-ghost" disabled="disabled">
                  <div class="inline-grid *:[grid-area:1/1]">
                    <div class="status ${status} ${animation}"></div>
                    <div class="status ${status}"></div>
                  </div>
                </button>`;
    return li;
  }

  #transferButton(deviceId) {
    const verifyDeviceId = sessionStorage.getItem("deviceId");
    if (verifyDeviceId === deviceId) {
      return "";
    }
    return `<button class="sendbtn btn btn-square btn-ghost">
                  <svg
                    t="1748271505174"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="1898"
                    width="24"
                    height="24"
                  >
                    <path
                      d="M839.7 238.8H483.9c-7.7-41-46.1-76.8-92.2-76.8H186.9c-46.1 0-81.9 35.8-81.9 76.8v547.8c0 41 35.8 76.8 81.9 76.8h650.2c46.1 0 81.9-35.8 81.9-76.8v-471c0.1-41-33.2-76.8-79.3-76.8z m30.7 550.4c0 17.9-17.9 30.7-35.8 30.7H189.5c-20.5 0-35.8-17.9-35.8-35.8V238.8c0-7.7 2.6-20.5 10.2-25.6 7.7-5.1 12.8-7.7 25.6-10.2h204.8c17.9 0 38.4 17.9 41 35.8l7.7 46.1h394.2c20.5-2.6 35.8 12.8 35.8 30.7-2.6 0-2.6 473.6-2.6 473.6z"
                      fill="#333333"
                      p-id="1899"
                    ></path>
                    <path
                      d="M673.3 581.8l5.1-5.1c5.1-7.7 7.7-12.8 7.7-17.9 0-5.1-5.1-15.4-7.7-17.9L522.3 402.6c-7.7-12.8-25.6-12.8-38.4 0-12.8 7.7-12.8 23 0 33.3l107.5 94.7H366.1c-12.8 0-25.6 12.8-25.6 25.6s7.7 25.6 25.6 25.6h220.2l-105 94.7c-12.8 7.7-12.8 23 0 33.3 7.7 12.8 25.6 12.8 38.4 0l153.6-128z"
                      fill="#333333"
                      p-id="1900"
                    ></path>
                  </svg>
    </button>`;
  }

  #icon(os) {
    if (os === "ios") {
      return "./ios.png";
    }
    if (os === "android") {
      return "./android.png";
    }

    if (os === "ipadOS") {
        return "./ipad.png";
      }

    return "./pc2.png";
  }
}
