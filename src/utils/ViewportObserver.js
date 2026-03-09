/**
 * @file ViewportObserver.js
 * @module utils/ViewportObserver
 * @description
 * 监听视口尺寸变化，节流后通过 EventBus 广播 'resize' 事件。
 * 相比直接监听 window.resize，此工具：
 *   1. 使用 ResizeObserver 精准监听容器（而非窗口）
 *   2. 内置节流（requestAnimationFrame），避免每帧多次触发
 *   3. 提供简洁的销毁接口防止内存泄漏
 */

import { eventBus } from './EventBus.js';

export class ViewportObserver {
  /**
   * @param {HTMLElement} target - 被观察的容器元素（通常为 canvas-container）
   */
  constructor(target) {
    this.target = target;
    this._rafId = null;
    this._observer = null;

    this._init();
  }

  /** @private */
  _init() {
    // 优先使用 ResizeObserver（更精准，监听元素而非窗口）
    if (typeof ResizeObserver !== 'undefined') {
      this._observer = new ResizeObserver((entries) => {
        // 节流：每帧最多触发一次
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
          this._rafId = null;
          const entry = entries[0];
          const { width, height } = entry.contentRect;
          this._broadcast(width, height);
        });
      });
      this._observer.observe(this.target);
      console.info('[ViewportObserver] 使用 ResizeObserver');

    } else {
      // 降级方案：监听 window.resize
      this._windowHandler = () => {
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
          this._rafId = null;
          this._broadcast(window.innerWidth, window.innerHeight);
        });
      };
      window.addEventListener('resize', this._windowHandler);
      console.info('[ViewportObserver] 降级为 window.resize');
    }
  }

  /**
   * 广播尺寸变化事件
   * @private
   */
  _broadcast(width, height) {
    if (width === 0 || height === 0) return;
    eventBus.emit('resize', { width, height });
  }

  /**
   * 停止监听并释放资源
   */
  dispose() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._windowHandler) {
      window.removeEventListener('resize', this._windowHandler);
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    console.info('[ViewportObserver] 已销毁');
  }
}