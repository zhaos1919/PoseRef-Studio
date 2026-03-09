/**
 * @file SnapshotManager.js
 * @module utils/SnapshotManager
 * @description
 * Phase V — 截图导出管理器
 *
 * 解决方案：
 *   - 不使用 preserveDrawingBuffer（会降低性能），
 *     而是在截图帧强制调用一次额外 render() 后立即读取像素
 *   - 支持透明背景（临时切换场景背景为 null）
 *   - 支持超分辨率（最高 4x DPR）
 *   - 自动触发浏览器下载
 */

export class SnapshotManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene}         scene
   * @param {THREE.Camera}        camera
   */
  constructor(renderer, scene, camera) {
    this._renderer = renderer;
    this._scene    = scene;
    this._camera   = camera;
  }

  /**
   * 截取当前视口并下载为 PNG
   *
   * @param {Object}  opts
   * @param {boolean} [opts.transparent=false]  - 是否透明背景
   * @param {number}  [opts.scale=2]            - 超分辨率倍数（1~4）
   * @param {string}  [opts.filename]           - 下载文件名
   * @param {Function} [opts.onStart]           - 开始截图回调
   * @param {Function} [opts.onDone]            - 完成回调（传入 dataURL）
   */
  capture({
    transparent = false,
    scale       = 2,
    filename    = `PoseRef_${this._timestamp()}.png`,
    onStart,
    onDone,
  } = {}) {
    onStart?.();

    // ── 1. 记录并临时切换渲染器状态 ────────────────────────────────
    const origBackground = this._scene.background;
    const origFog        = this._scene.fog;
    const origDPR        = this._renderer.getPixelRatio();
    const origSize       = {
      w: this._renderer.domElement.width,
      h: this._renderer.domElement.height,
    };

    const capScale = Math.max(1, Math.min(4, scale));

    if (transparent) {
      this._scene.background = null;
      this._scene.fog        = null;
    }

    // 临时提升 DPR 以获得超分辨率截图
    this._renderer.setPixelRatio(capScale);
    this._renderer.setSize(
      this._renderer.domElement.clientWidth,
      this._renderer.domElement.clientHeight,
      false
    );

    // ── 2. 关键：强制渲染一帧（不依赖 preserveDrawingBuffer）────────
    // WebGL 默认 double-buffer，read 前必须在同一帧内渲染
    this._renderer.render(this._scene, this._camera);

    // ── 3. 立即读取 canvas 数据（必须在 render() 之后同步调用）─────
    const dataURL = this._renderer.domElement.toDataURL('image/png');

    // ── 4. 恢复渲染器状态 ───────────────────────────────────────────
    this._scene.background = origBackground;
    this._scene.fog        = origFog;
    this._renderer.setPixelRatio(origDPR);
    this._renderer.setSize(
      origSize.w / origDPR,
      origSize.h / origDPR,
      false
    );

    // ── 5. 触发下载 ─────────────────────────────────────────────────
    this._download(dataURL, filename);
    onDone?.(dataURL);

    console.info(`[SnapshotManager] 截图完成 | 文件: ${filename} | 分辨率 ${capScale}x`);
    return dataURL;
  }

  // ── 私有方法 ─────────────────────────────────────────────────────

  _download(dataURL, filename) {
    const link    = document.createElement('a');
    link.href     = dataURL;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // 下一帧移除，防止内存泄漏
    requestAnimationFrame(() => document.body.removeChild(link));
  }

  _timestamp() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
      '_',
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
      String(d.getSeconds()).padStart(2, '0'),
    ].join('');
  }
}