/**
 * @file ZenMode.js
 * @description 沉浸专注模式
 */
export class ZenMode {
  /**
   * @param {Function} onSnapshot  - S 键截图回调
   * @param {Function} [onToggle]  - 每次状态切换后回调 (isActive: boolean) => void
   *                                 用于同步按钮文字/图标，无论是点击还是 Z 键触发都会执行
   */
  constructor(onSnapshot, onToggle) {
    this._active     = false;
    this._onSnapshot = onSnapshot;
    this._onToggle   = onToggle ?? null;
    this._hint       = document.getElementById('shortcut-hint');
    this._bindKeys();
  }

  toggle()       { this._active ? this.exit() : this.enter(); }
  get isActive() { return this._active; }

  enter() {
    if (this._active) return;
    this._active = true;
    document.body.classList.add('is-zen');
    this._hint?.classList.add('shortcut-hint--visible');
    this._onToggle?.(true);
  }

  exit() {
    if (!this._active) return;
    this._active = false;
    document.body.classList.remove('is-zen');
    this._hint?.classList.remove('shortcut-hint--visible');
    this._onToggle?.(false);
  }

  dispose() {
    document.removeEventListener('keydown', this._keyHandler);
  }

  _bindKeys() {
    this._keyHandler = (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'z' || e.key === 'Z') this.toggle();
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) this._onSnapshot?.();
    };
    document.addEventListener('keydown', this._keyHandler);
  }
}