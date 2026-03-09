/**
 * @file ProgressiveScheduler.js
 * @module core/ProgressiveScheduler
 * @description
 * Phase VIII — 渐进式性能调度器（Progressive Performance Scheduler）
 *
 * 核心策略：
 *   「交互时」—— 立即降低渲染压力（低 DPR + BasicShadowMap + 禁用昂贵 postprocess）
 *   「静止后」—— 300ms 无输入，分步恢复高画质（防止闪烁的渐进提升曲线）
 *
 * 监控的交互源：
 *   - OrbitControls 相机旋转 / 缩放
 *   - PosePanel 骨骼姿态滑条拖动
 *   - TransformSystem 模型位置拖动
 *   - 任意 eventBus 触发的 'interaction:start' / 'interaction:end'
 *
 * 切换无闪烁方案：
 *   DPR 降级时先设置低值（立即生效无抖动）；
 *   恢复时分 3 步渐进提升，每步之间插入 1 帧等待，
 *   让渲染器以旧 DPR 完成当前帧再切换，避免单帧空白。
 *
 * 阴影切换无闪烁方案：
 *   阴影降级（BasicShadowMap）在同帧生效（交互中用户注意力在运动上，不感知）；
 *   阴影恢复（PCFSoftShadowMap）在最后步骤完成后执行，并通过 shadowMap.needsUpdate 平滑过渡。
 *
 * 用法：
 *   const scheduler = new ProgressiveScheduler(renderer, lightingSystem);
 *   scheduler.bindOrbitControls(controls);
 *   scheduler.bindEventBus(eventBus);
 *   // 在 PosePanel / TransformSystem 的 slider input 事件中调用：
 *   scheduler.notifyInteraction();
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
// 调度器配置
// ─────────────────────────────────────────────────────────────────
const CONFIG = {
  // 停止交互后多少毫秒开始恢复画质
  IDLE_THRESHOLD_MS: 300,

  // 「交互中」低画质参数
  ACTIVE: {
    dprScale:       0.6,          // 设备像素比缩放系数（乘以 window.devicePixelRatio）
    dprMin:         1.0,          // DPR 最小值
    shadowMapType:  THREE.BasicShadowMap,
    shadowMapSize:  512,
    shadowRadius:   1,
  },

  // 「静止后」高画质参数
  IDLE: {
    dprScale:       1.0,
    dprMax:         2.0,          // DPR 上限（防止 4K 屏爆显存）
    shadowMapType:  THREE.PCFSoftShadowMap,
    shadowMapSize:  2048,
    shadowRadius:   6,
  },

  // 渐进恢复的分步延迟（ms）—— 分3步，避免单帧突变
  RESTORE_STEPS: [
    { delay: 0,   dprScale: 0.75, shadowMapSize: 512  },   // 立即：轻微提升 DPR
    { delay: 100, dprScale: 0.88, shadowMapSize: 1024 },   // 100ms：中间态
    { delay: 220, dprScale: 1.0,  shadowMapSize: 2048, restoreShadowType: true }, // 最终态
  ],
};

// ─────────────────────────────────────────────────────────────────

export class ProgressiveScheduler {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../scene/LightingSystem').LightingSystem} lightingSystem
   */
  constructor(renderer, lightingSystem) {
    this._renderer       = renderer;
    this._ls             = lightingSystem;

    this._state          = 'idle';       // 'active' | 'idle' | 'restoring'
    this._idleTimer      = null;
    this._restoreTimers  = [];
    this._lastInteractAt = 0;
    this._activeCount    = 0;            // 并发交互源计数（支持多源同时触发）

    // 性能调度开关（可从外部禁用）
    this._enabled = true;

    // 缓存初始高画质 DPR
    this._nativeDPR = Math.min(window.devicePixelRatio, CONFIG.IDLE.dprMax);

    // 初始时应用高画质
    this._applyIdleQuality(true);

    console.info('[ProgressiveScheduler] 初始化完成，nativeDPR =', this._nativeDPR);
  }

  // ── 公共 API ────────────────────────────────────────────────────

  /**
   * 绑定 OrbitControls（相机旋转/缩放信号）
   * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} controls
   */
  bindOrbitControls(controls) {
    controls.addEventListener('start', () => this.notifyInteraction());
    controls.addEventListener('end',   () => this.notifyInteractionEnd());
  }

  /**
   * 绑定 EventBus（全局交互信号）
   * @param {{ on: Function }} bus
   */
  bindEventBus(bus) {
    bus.on('interaction:start', () => this.notifyInteraction());
    bus.on('interaction:end',   () => this.notifyInteractionEnd());
    // PosePanel 骨骼 slider 专用信号
    bus.on('pose:dragging',     () => this.notifyInteraction());
    bus.on('pose:idle',         () => this.notifyInteractionEnd());
    // TransformSystem gizmo 移动信号
    bus.on('transform:start',   () => this.notifyInteraction());
    bus.on('transform:end',     () => this.notifyInteractionEnd());
  }

  /**
   * 通知：用户开始交互
   * 可由任何 UI 模块直接调用
   */
  notifyInteraction() {
    if (!this._enabled) return;
    this._activeCount = Math.max(1, this._activeCount + 1);
    this._lastInteractAt = performance.now();

    // 取消所有恢复计划
    this._cancelRestoreTimers();
    clearTimeout(this._idleTimer);

    if (this._state !== 'active') {
      this._state = 'active';
      this._applyActiveQuality();
    }
  }

  /**
   * 通知：一个交互源结束
   * 所有源都结束后才开始倒计时恢复
   */
  notifyInteractionEnd() {
    if (!this._enabled) return;
    this._activeCount = Math.max(0, this._activeCount - 1);

    if (this._activeCount > 0) return; // 还有其他交互源

    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this._state = 'restoring';
      this._runProgressiveRestore();
    }, CONFIG.IDLE_THRESHOLD_MS);
  }

  /**
   * 直接触发恢复（不等计时器）
   * 用于截图前强制高画质
   */
  forceHighQuality() {
    this._cancelRestoreTimers();
    clearTimeout(this._idleTimer);
    this._activeCount = 0;
    this._state = 'idle';
    this._applyIdleQuality(true);
    console.info('[ProgressiveScheduler] 强制高画质模式');
  }

  /**
   * 开启/关闭调度器
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) this.forceHighQuality();
    console.info(`[ProgressiveScheduler] ${enabled ? '已启用' : '已禁用（固定高画质）'}`);
  }

  /** 当前状态 */
  get state() { return this._state; }

  dispose() {
    this._cancelRestoreTimers();
    clearTimeout(this._idleTimer);
    console.info('[ProgressiveScheduler] 已释放');
  }

  // ── 私有：画质切换 ───────────────────────────────────────────────

  /**
   * 应用「交互中」低画质
   * @private
   */
  _applyActiveQuality() {
    const cfg = CONFIG.ACTIVE;

    // ① 降低设备像素比（立即生效，无闪烁）
    const targetDPR = Math.max(
      cfg.dprMin,
      Math.floor(this._nativeDPR * cfg.dprScale * 10) / 10
    );
    this._renderer.setPixelRatio(targetDPR);

    // ② 切换为 BasicShadowMap（性能最优，无多次采样）
    //    注意：shadowMap.type 变更需要在下帧生效，THREE.js 内部有 dirty 标记
    if (this._renderer.shadowMap.type !== cfg.shadowMapType) {
      this._renderer.shadowMap.type = cfg.shadowMapType;
      this._renderer.shadowMap.needsUpdate = true;
    }

    // ③ 降低阴影贴图分辨率
    this._setShadowMapSize(cfg.shadowMapSize, cfg.shadowRadius);

    console.debug(`[ProgressiveScheduler] ▼ 交互降级 DPR:${targetDPR} Shadow:${cfg.shadowMapSize}px BasicShadowMap`);
  }

  /**
   * 应用「静止」高画质（一步或渐进）
   * @param {boolean} [immediate=false] - 是否跳过渐进，直接最高画质
   * @private
   */
  _applyIdleQuality(immediate = false) {
    const cfg = CONFIG.IDLE;
    const targetDPR = Math.min(this._nativeDPR, cfg.dprMax);

    if (immediate) {
      this._renderer.setPixelRatio(targetDPR);
      this._renderer.shadowMap.type = cfg.shadowMapType;
      this._renderer.shadowMap.needsUpdate = true;
      this._setShadowMapSize(cfg.shadowMapSize, cfg.shadowRadius);
      this._state = 'idle';
      return;
    }

    // 非 immediate：仅最终步恢复阴影类型
    this._renderer.setPixelRatio(targetDPR);
    this._setShadowMapSize(cfg.shadowMapSize, cfg.shadowRadius);

    // PCFSoftShadowMap 延迟到下一帧设置，避免当帧渲染空缺
    requestAnimationFrame(() => {
      if (this._state !== 'active') {
        this._renderer.shadowMap.type = cfg.shadowMapType;
        this._renderer.shadowMap.needsUpdate = true;
        this._state = 'idle';
        console.debug(`[ProgressiveScheduler] ▲ 完全恢复 DPR:${targetDPR} PCFSoftShadowMap`);
      }
    });
  }

  /**
   * 渐进恢复：按 RESTORE_STEPS 分步提升画质
   * 关键点：每步只改变 DPR 和 shadowMapSize，
   * 最后一步在 requestAnimationFrame 后才切换 shadowMap.type，
   * 以确保渲染器有整帧时间完成旧状态的最后一次绘制。
   * @private
   */
  _runProgressiveRestore() {
    const steps = CONFIG.RESTORE_STEPS;

    steps.forEach((step, i) => {
      const t = setTimeout(() => {
        // 如果用户又开始操作了，中止恢复
        if (this._state === 'active') return;

        const dpr = Math.max(
          Math.min(this._nativeDPR * step.dprScale, CONFIG.IDLE.dprMax),
          CONFIG.ACTIVE.dprMin
        );
        this._renderer.setPixelRatio(dpr);
        this._setShadowMapSize(step.shadowMapSize, i === steps.length - 1 ? CONFIG.IDLE.shadowRadius : CONFIG.ACTIVE.shadowRadius);

        console.debug(`[ProgressiveScheduler] 恢复步骤 ${i+1}/${steps.length}: DPR:${dpr.toFixed(2)} Shadow:${step.shadowMapSize}px`);

        // 最后一步：恢复 PCFSoftShadowMap（延 1 帧避免闪烁）
        if (step.restoreShadowType) {
          requestAnimationFrame(() => {
            if (this._state !== 'active') {
              this._renderer.shadowMap.type = CONFIG.IDLE.shadowMapType;
              this._renderer.shadowMap.needsUpdate = true;
              this._state = 'idle';
              console.info('[ProgressiveScheduler] ✓ 画质完全恢复（PCFSoftShadowMap）');
            }
          });
        }
      }, step.delay);

      this._restoreTimers.push(t);
    });
  }

  /**
   * 取消所有渐进恢复计时器
   * @private
   */
  _cancelRestoreTimers() {
    this._restoreTimers.forEach(t => clearTimeout(t));
    this._restoreTimers = [];
  }

  /**
   * 统一设置所有投影光源的阴影贴图大小
   * @param {number} size     - 贴图边长（像素）
   * @param {number} radius   - PCF 采样半径
   * @private
   */
  _setShadowMapSize(size, radius) {
    if (!this._ls) return;
    const lights = Object.values(this._ls._lights ?? {});
    for (const light of lights) {
      if (!light.castShadow) continue;
      if (light.shadow.mapSize.x === size) continue; // 未变化则跳过
      light.shadow.mapSize.set(size, size);
      light.shadow.radius = radius;
      // 必须销毁旧贴图才能触发重建
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }
  }
}