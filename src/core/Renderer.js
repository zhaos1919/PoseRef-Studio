/**
 * @file Renderer.js
 * @module core/Renderer
 * @description
 * WebGLRenderer 封装（Phase V）
 *   - 支持截图所需的 preserveDrawingBuffer（可选）
 *   - GPU 性能信息暴露接口
 */

import * as THREE from 'three';

export class Renderer {
  constructor({ container, antialias = true, pixelRatio, preserveDrawingBuffer = false } = {}) {
    if (!container) throw new Error('[Renderer] 必须提供 container');
    this.container = container;

    this.instance = new THREE.WebGLRenderer({
      antialias,
      alpha:                 false,
      powerPreference:       'high-performance',
      stencil:               false,
      preserveDrawingBuffer, // Phase V：截图时无需此选项，改用强制渲染帧方案
    });

    const dpr = pixelRatio ?? Math.min(window.devicePixelRatio, 2);
    this.instance.setPixelRatio(dpr);
    this.instance.outputColorSpace   = THREE.SRGBColorSpace;
    this.instance.toneMapping        = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.0;
    this.instance.shadowMap.enabled  = true;
    this.instance.shadowMap.type     = THREE.PCFSoftShadowMap;

    // 清除容器内残留的旧 canvas，防止刷新后多个 canvas 叠加
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.container.appendChild(this.instance.domElement);
    this._updateSize();

    console.info(`[Renderer] 初始化 | DPR:${dpr} | AA:${antialias} | WebGL${this.instance.capabilities.isWebGL2 ? '2' : '1'}`);
  }

  resize()          { this._updateSize(); }
  render(s, c)      { this.instance.render(s, c); }
  get domElement()  { return this.instance.domElement; }
  get size()        { return { width: this.container.clientWidth, height: this.container.clientHeight }; }

  /** GPU 信息（供 PerformanceManager 使用） */
  getGLContext()    { return this.instance.getContext(); }

  dispose() {
    this.instance.dispose();
    this.instance.domElement.parentNode?.removeChild(this.instance.domElement);
    console.info('[Renderer] 已销毁');
  }

  _updateSize() {
    const { width, height } = this.size;
    this.instance.setSize(width, height, false);
  }
}