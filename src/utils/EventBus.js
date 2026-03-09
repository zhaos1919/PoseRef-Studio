/**
 * @file EventBus.js
 * @module utils/EventBus
 * @description
 * 轻量级事件总线（发布-订阅模式）。
 * 用于模块间解耦通信，避免深层 prop drilling 或直接引用依赖。
 *
 * 用法示例：
 *   import { eventBus } from './utils/EventBus.js';
 *   eventBus.on('resize', ({ width, height }) => { ... });
 *   eventBus.emit('resize', { width: 1920, height: 1080 });
 *   eventBus.off('resize', handler);
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string}   eventName
   * @param {Function} handler
   * @returns {() => void} 取消订阅的函数（便于清理）
   */
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);

    // 返回取消订阅函数
    return () => this.off(eventName, handler);
  }

  /**
   * 订阅事件（仅触发一次后自动移除）
   * @param {string}   eventName
   * @param {Function} handler
   */
  once(eventName, handler) {
    const wrapper = (data) => {
      handler(data);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }

  /**
   * 取消订阅
   * @param {string}   eventName
   * @param {Function} handler
   */
  off(eventName, handler) {
    this._listeners.get(eventName)?.delete(handler);
  }

  /**
   * 发布事件
   * @param {string} eventName
   * @param {*}      data
   */
  emit(eventName, data) {
    this._listeners.get(eventName)?.forEach(handler => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] 事件 "${eventName}" 的处理函数抛出错误:`, err);
      }
    });
  }

  /**
   * 移除某事件的所有监听器
   * @param {string} eventName
   */
  clear(eventName) {
    this._listeners.delete(eventName);
  }

  /**
   * 移除所有事件监听
   */
  clearAll() {
    this._listeners.clear();
  }
}

// 导出单例，整个应用共享同一个事件总线
export const eventBus = new EventBus();