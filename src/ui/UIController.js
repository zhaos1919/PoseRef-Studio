/**
 * @file UIController.js
 * @description UI 状态控制器（Phase VI 精修版）
 */

export class UIController {
  constructor() {
    this._loadingOverlay  = document.getElementById('loading-overlay');
    this._loadingText     = document.querySelector('.loading-text');
    this._loadingSubtext  = document.querySelector('.loading-subtext');
    this._progressBar     = document.getElementById('progress-bar-fill');
    this._progressPercent = document.getElementById('progress-percent');
    this._fpsDisplay      = document.getElementById('fps-display');
    this._coordValue      = document.getElementById('coord-value');
    this._renderStatus    = document.getElementById('render-status');
    this._statusDot       = document.getElementById('status-dot');
    this._panelLeft       = document.getElementById('panel-left');
    this._rendererInfo    = document.getElementById('renderer-info');
    this._boneCount       = document.getElementById('bone-count');
    this._modelName       = document.getElementById('model-name');
    this._qualityBadge    = document.getElementById('quality-badge');

    this._fpsFrameCount   = 0;
    this._fpsLastTime     = performance.now();

    // Toast 容器
    this._toastContainer  = this._makeToastContainer();

    // 绑定工具栏按钮（直接从 HTML 取）
    this._bindToolbarButtons();
  }

  // ── 加载 ─────────────────────────────────────────────────────────

  updateLoadProgress(pct) {
    if (!this._progressBar) return;
    if (pct < 0) {
      this._progressBar.style.width = '55%';
      this._progressBar.style.transition = 'none';
      if (this._progressPercent) this._progressPercent.textContent = '加载中…';
    } else {
      this._progressBar.style.transition = 'width 0.2s ease';
      this._progressBar.style.width = `${pct}%`;
      if (this._progressPercent) this._progressPercent.textContent = `${pct}%`;
    }
  }

  setLoadingText(text, sub = '') {
    if (this._loadingText)    this._loadingText.textContent    = text;
    if (this._loadingSubtext) this._loadingSubtext.textContent = sub;
  }

  hideLoadingOverlay(delay = 300) {
    setTimeout(() => this._loadingOverlay?.classList.add('is-hidden'), delay);
  }

  onModelLoaded({ bones = [], animations = [] } = {}) {
    if (this._boneCount) this._boneCount.textContent = bones.length > 0 ? `${bones.length} 个` : '—';
    if (this._modelName) this._modelName.textContent = animations.length > 0 ? `${animations.length} 段` : '无';
  }

  // ── 帧更新 ───────────────────────────────────────────────────────

  updateFPS() {
    this._fpsFrameCount++;
    const now = performance.now();
    const dt  = now - this._fpsLastTime;
    if (dt < 500) return -1;
    const fps = Math.round((this._fpsFrameCount / dt) * 1000);
    this._fpsFrameCount = 0;
    this._fpsLastTime   = now;
    if (this._fpsDisplay) this._fpsDisplay.textContent = fps;
    return fps;
  }

  updateCoords(x, y, z) {
    if (this._coordValue)
      this._coordValue.textContent =
        `X: ${x.toFixed(2)}  Y: ${y.toFixed(2)}  Z: ${z.toFixed(2)}`;
  }

  setRendererInfo(info) {
    if (this._rendererInfo) this._rendererInfo.textContent = info;
  }

  setRenderStatus(status) {
    if (this._renderStatus) this._renderStatus.textContent = status === 'error' ? '错误' : '渲染中';
    if (this._statusDot) {
      this._statusDot.className = `model-stat__dot status-dot ${status === 'error' ? 'error' : 'active'}`;
    }
  }

  setQualityBadge(quality) {
    if (!this._qualityBadge) return;
    const labels = { high: '高', medium: '中', low: '低' };
    this._qualityBadge.textContent = labels[quality] ?? quality;
    this._qualityBadge.className   = `quality-pill ${quality}`;
  }

  // ── Toast ────────────────────────────────────────────────────────

  toast(message, type = 'info', duration = 2800) {
    const ICONS = { success: '✓', error: '✕', info: '·', warning: '⚠' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span class="toast__icon">${ICONS[type]}</span><span>${message}</span>`;
    this._toastContainer.appendChild(el);
    if (duration > 0) {
      setTimeout(() => {
        el.classList.add('is-hiding');
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, duration);
    }
  }

  // ── 兼容旧接口（addToolbarButtons 已废弃，按钮直接在 HTML 中） ─────
  addToolbarButtons() {}

  // ── 私有 ─────────────────────────────────────────────────────────

  _makeToastContainer() {
    const el = document.createElement('div');
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  }

  // 工具栏按钮由 main.js 的 _initToolbar() 直接绑定，这里只做注册映射
  _bindToolbarButtons() {}
}