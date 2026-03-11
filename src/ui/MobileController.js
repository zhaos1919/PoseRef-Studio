/**
 * @file MobileController.js
 * @description 全平台统一左侧抽屉面板控制器
 *
 * 支持：
 *  - 工具栏汉堡按钮 (#panel-toggle-btn) 点击开关
 *  - 面板内 ← 收起按钮 点击关闭
 *  - 点击半透明遮罩 关闭
 *  - Esc 键 关闭
 *  - P 键 切换（由 main.js 调用 toggle()）
 *  - 移动端：面板内左滑关闭；左边缘右滑打开
 */
export class MobileController {
  constructor(orbitControls) {
    this._controls = orbitControls;
    this._open     = false;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._setup());
    } else {
      // 稍微延迟一帧，确保 panel DOM 已渲染
      requestAnimationFrame(() => this._setup());
    }
  }

  // ── 初始化 ──────────────────────────────────────────────────────
  _setup() {
    this._createOverlay();
    this._injectCloseButton();
    this._bindToggleButton();
    this._bindKeyboard();
    this._bindTouchSwipe();
    this._bindCanvasTouchGuard();
  }

  // ── 遮罩层 ──────────────────────────────────────────────────────
  _createOverlay() {
    if (document.getElementById('drawer-overlay')) return;
    const el = document.createElement('div');
    el.id = 'drawer-overlay';
    el.setAttribute('aria-hidden', 'true');
    document.getElementById('app')?.appendChild(el);
    el.addEventListener('click', () => this.close());
  }

  // ── 面板 Header 内注入「← 收起」按钮 ───────────────────────────
  _injectCloseButton() {
    if (document.getElementById('drawer-close-btn')) return;
    const header = document.querySelector('.panel--left .panel__header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id        = 'drawer-close-btn';
    btn.className = 'panel__drawer-close';
    btn.type      = 'button';
    btn.setAttribute('aria-label', '收起面板');
    btn.setAttribute('title', '收起面板');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M9 2L4 7L9 12"
              stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    btn.addEventListener('click', () => this.close());
    header.appendChild(btn);
  }

  // ── 工具栏汉堡按钮 ───────────────────────────────────────────────
  _bindToggleButton() {
    const btn = document.getElementById('panel-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', () => this.toggle());
  }

  // ── Esc 键关闭 ───────────────────────────────────────────────────
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) this.close();
    });
  }

  // ── 触摸手势（移动端增强）──────────────────────────────────────
  _bindTouchSwipe() {
    const panel = document.querySelector('.panel--left');
    if (!panel) return;

    let startX = 0, startY = 0, done = false;

    panel.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      done   = false;
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
      if (done) return;
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx < -40 && dy < Math.abs(dx) * 0.75) {
        done = true;
        this.close();
      }
    }, { passive: true });

    // 左边缘右划 → 打开
    const app = document.getElementById('app');
    if (!app) return;
    let edgeX = 0;
    app.addEventListener('touchstart', (e) => {
      edgeX = e.touches[0].clientX;
    }, { passive: true });
    app.addEventListener('touchmove', (e) => {
      if (this._open) return;
      const dx = e.touches[0].clientX - edgeX;
      if (edgeX < 24 && dx > 52) {
        this.open();
        edgeX = 9999;
      }
    }, { passive: true });
  }

  // ── 面板打开时阻止画布穿透 ───────────────────────────────────────
  _bindCanvasTouchGuard() {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return;
    canvas.addEventListener('touchmove', (e) => {
      if (!this._open) e.preventDefault();
    }, { passive: false });
  }

  // ── 公开 API ─────────────────────────────────────────────────────
  open() {
    const panel   = document.querySelector('.panel--left');
    const overlay = document.getElementById('drawer-overlay');
    const toggle  = document.getElementById('panel-toggle-btn');
    if (!panel || this._open) return;

    this._open = true;
    panel.classList.add('drawer--open');
    overlay?.classList.add('is-visible');
    if (toggle) {
      toggle.classList.add('is-active');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', '收起控制面板');
    }
    if (this._controls) this._controls.enabled = false;

    setTimeout(() => {
      document.getElementById('drawer-close-btn')?.focus({ preventScroll: true });
    }, 380);
  }

  close() {
    const panel   = document.querySelector('.panel--left');
    const overlay = document.getElementById('drawer-overlay');
    const toggle  = document.getElementById('panel-toggle-btn');
    if (!panel || !this._open) return;

    this._open = false;
    panel.classList.remove('drawer--open');
    overlay?.classList.remove('is-visible');
    if (toggle) {
      toggle.classList.remove('is-active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '打开控制面板');
    }
    if (this._controls) this._controls.enabled = true;
  }

  toggle() { this._open ? this.close() : this.open(); }

  // 向后兼容 main.js 可能的调用
  onModelLoaded()    {}
  mirrorLivePanels() {}

  get isOpen()   { return this._open; }
  get isMobile() { return window.matchMedia('(max-width: 768px)').matches; }
}