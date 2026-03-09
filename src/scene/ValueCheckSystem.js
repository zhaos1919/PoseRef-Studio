/**
 * @file ValueCheckSystem.js
 * @description 素描明度模式（Value Check）
 *
 * 实现方案：纯 CSS filter grayscale()
 * 完全不碰 Three.js 渲染管线，零风险，零黑屏。
 * 通过 CSS transition 实现平滑过渡。
 */

export class ValueCheckSystem {
  constructor(renderer, scene, camera) {
    this._canvas  = renderer.domElement;
    this._enabled = false;
    // CSS transition 已在 advanced.css 里定义
    this._canvas.style.transition = 'filter 0.4s ease';
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    // grayscale(1) = 完全灰度，contrast(1.1) 增强明暗对比
    this._canvas.style.filter = enabled
      ? 'grayscale(1) contrast(1.12)'
      : '';
  }

  get isEnabled()     { return this._enabled; }
  // 永远不需要 Composer
  get needsComposer() { return false; }

  render()            {}   // 不使用，main.js 里 needsComposer=false 时直接走原始渲染
  resize()            {}
  dispose()           { this._canvas.style.filter = ''; this._canvas.style.transition = ''; }
}