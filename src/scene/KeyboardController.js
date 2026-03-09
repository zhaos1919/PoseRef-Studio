/**
 * @file KeyboardController.js
 * @module scene/KeyboardController
 * @description
 * Phase VIII — 键盘控制器
 *
 * 功能：
 *   方向键 / WASD  → 平移激活模型（XZ 平面）
 *   Q / E          → 旋转激活模型（Y 轴）
 *   Shift 加速      → 按住 Shift 移动速度 ×5
 *
 * 设计原则：
 *   - 在 requestAnimationFrame 渲染循环中以"按键状态集合"驱动，
 *     不在 keydown 事件里直接移动（避免系统按键重复延迟造成卡顿）
 *   - 当焦点在 INPUT / TEXTAREA 时自动屏蔽，不干扰数值输入
 *   - 与 OrbitControls / TransformControls 无冲突
 */

export class KeyboardController {
  /**
   * @param {ModelManager} modelManager  - 用于读取 activeRoot
   * @param {OrbitControls} orbitControls - 移动时短暂禁用，防止相机跟随漂移
   */
  constructor(modelManager, orbitControls) {
    this._modelMgr = modelManager;
    this._orbit    = orbitControls;

    /** 当前按下的键名集合 */
    this._keys = new Set();

    /** 平移步长（米/帧，60fps 基准） */
    this.moveSpeed   = 0.018;
    /** 旋转步长（弧度/帧） */
    this.rotateSpeed = 0.025;
    /** Shift 加速倍率 */
    this.shiftMult   = 4.0;

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp   = this._handleKeyUp.bind(this);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  /**
   * 每帧调用（放在 App._tick() 中，与渲染循环同步）
   */
  update() {
    if (this._keys.size === 0) return;

    const root = this._modelMgr?.activeRoot;
    if (!root) return;

    const shift = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    const move  = this.moveSpeed   * (shift ? this.shiftMult : 1);
    const rot   = this.rotateSpeed * (shift ? this.shiftMult : 1);

    let moved = false;

    // ── 平移（XZ 平面）──────────────────────────────────────────
    if (this._keys.has('ArrowUp')    || this._keys.has('KeyW')) { root.position.z -= move; moved = true; }
    if (this._keys.has('ArrowDown')  || this._keys.has('KeyS')) { root.position.z += move; moved = true; }
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) { root.position.x -= move; moved = true; }
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) { root.position.x += move; moved = true; }

    // ── Y 轴旋转 ─────────────────────────────────────────────────
    if (this._keys.has('KeyQ')) { root.rotation.y += rot; moved = true; }
    if (this._keys.has('KeyE')) { root.rotation.y -= rot; moved = true; }

    // 移动时保持 OrbitControls 可用（不禁用），TransformControls 冲突已在别处处理
    if (moved) {
      // 可选：移动时 OrbitControls target 微调跟随（注释掉可关闭）
      // this._orbit.target.lerp(root.position, 0.02);
    }
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
    this._keys.clear();
  }

  // ── 私有 ─────────────────────────────────────────────────────────

  _handleKeyDown(e) {
    // 焦点在输入框时屏蔽
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    // 屏蔽 WASD 在方向键以外的默认行为（如页面滚动）
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    this._keys.add(e.code);
  }

  _handleKeyUp(e) {
    this._keys.delete(e.code);
  }
}