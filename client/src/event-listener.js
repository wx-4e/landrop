export class EventListener {
  constructor() {
    this.events = new Map(); // 存储事件：key=事件名，value=回调数组
  }

  /**
   * 注册事件监听
   * @param {string} eventName 事件名（如 'devicesReady'）
   * @param {Function} callback 回调函数
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(callback);
  }

  /**
   * 触发事件（通知所有监听该事件的回调）
   * @param {string} eventName 事件名
   * @param {...any} args 传递给回调的参数
   */
  emit(eventName, ...args) {
    const callbacks = this.events.get(eventName);
    if (callbacks) {
      // 复制数组避免遍历时修改原数组（如回调中移除自身）
      [...callbacks].forEach((callback) => callback(...args));
    }
  }

  /**
   * 移除事件监听（可选：支持移除特定回调或全部）
   * @param {string} eventName 事件名
   * @param {Function} [callback] 要移除的回调（不传则移除所有）
   */
  off(eventName, callback) {
    if (!this.events.has(eventName)) return;
    if (!callback) {
      this.events.delete(eventName); // 移除整个事件的所有监听
    } else {
      const callbacks = this.events.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }
}
