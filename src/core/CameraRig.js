/**
 * @file CameraRig.js
 * @module core/CameraRig
 * @description
 * Phase VIII — 专业摄影相机预设系统（动态聚焦重构版）
 *
 * 核心修复：
 *   flyTo(presetKey) 不再使用写死的世界原点作为 target，
 *   而是接受可选的 modelRoot 参数，基于激活模型的世界坐标动态计算
 *   相机目标（target）和位置偏移，实现"选中谁、飞向谁"的效果。
 *
 * 新增：
 *   flyTo(presetKey, duration, onDone, modelRoot?)
 *   flyToPosition(position, target, fov, duration, onDone)  — 不变
 */

import * as THREE from 'three';

// ── 缓动函数 ─────────────────────────────────────────────────────
const ease = {
  inOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
  inOutQuart: t => t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2, 4)/2,
  outExpo:    t => t === 1 ? 1 : 1 - Math.pow(2, -10*t),
};

/**
 * 相机预设配置。
 *
 * 设计变更（Phase VIII）：
 *   position 和 target 不再存储绝对世界坐标，而是存储相对于模型世界坐标的偏移量。
 *   flyTo() 在计算最终目标时，会将偏移叠加到激活模型的 worldPosition 上。
 *
 *   offset:       THREE.Vector3  相机相对于模型的位置偏移
 *   targetOffset: THREE.Vector3  OrbitControls.target 相对于模型的偏移（通常是躯干高度）
 *   fov:          number         视角（度）
 *
 * 兼容性：保留 label / icon 字段不变，对外 API 完全向后兼容。
 */
const CAMERA_PRESETS = {
  front: {
    label: '正视图',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1" opacity=".4"/>
    </svg>`,
    offset:       new THREE.Vector3(0, 0.1, 4.2),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 50,
  },
  back: {
    label: '背视图',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5" opacity=".4"/>
    </svg>`,
    offset:       new THREE.Vector3(0, 0.1, -4.2),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 50,
  },
  left: {
    label: '左视图',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1" opacity=".4"/>
      <polyline points="5,4 2,7 5,10" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    offset:       new THREE.Vector3(-4.2, 0.1, 0),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 50,
  },
  right: {
    label: '右视图',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1" opacity=".4"/>
      <polyline points="9,4 12,7 9,10" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    offset:       new THREE.Vector3(4.2, 0.1, 0),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 50,
  },
  quarter: {
    label: '45°视角',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 12 L7 2 L12 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="4.5" y1="8" x2="9.5" y2="8" stroke="currentColor" stroke-width="1" opacity=".5"/>
    </svg>`,
    offset:       new THREE.Vector3(3.0, 0.9, 3.0),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 50,
  },
  top: {
    label: '顶视图',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="7" cy="7" r="1.5" stroke="currentColor" stroke-width="1" opacity=".5"/>
    </svg>`,
    offset:       new THREE.Vector3(0, 7.0, 0.001),
    targetOffset: new THREE.Vector3(0, 0.9, 0),
    fov: 40,
  },
  portrait: {
    label: '人像',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4.5" r="2" stroke="currentColor" stroke-width="1.3"/>
      <path d="M3.5 12C3.5 9.5 10.5 9.5 10.5 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`,
    offset:       new THREE.Vector3(0, 0.75, 1.4),
    targetOffset: new THREE.Vector3(0, 1.6, 0),
    fov: 35,
  },
  wide: {
    label: '全身',
    icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="1.5" y1="5" x2="12.5" y2="5" stroke="currentColor" stroke-width="0.8" opacity=".4"/>
      <line x1="1.5" y1="9" x2="12.5" y2="9" stroke="currentColor" stroke-width="0.8" opacity=".4"/>
    </svg>`,
    offset:       new THREE.Vector3(0, -0.05, 5.5),
    targetOffset: new THREE.Vector3(0, 0.85, 0),
    fov: 55,
  },
};

export { CAMERA_PRESETS };

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {OrbitControls}           controls
   */
  constructor(camera, controls) {
    this._camera   = camera;
    this._controls = controls;
    this._anim     = null;
    this._duration = 900;
    this._easing   = ease.inOutCubic;
  }

  /**
   * 飞到指定预设，动态基于激活模型世界坐标计算目标。
   *
   * @param {string}             presetKey  - CAMERA_PRESETS 的键
   * @param {number}             [duration] - 动画时长（ms），默认 900ms
   * @param {Function}           [onDone]   - 动画完成回调
   * @param {THREE.Object3D|null} [modelRoot] - 当前激活模型根节点（用于动态定位）
   *                                           若不传，退化为以原点为基准（向后兼容）
   */
  flyTo(presetKey, duration, onDone, modelRoot = null) {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) { console.warn('[CameraRig] 未知预设:', presetKey); return; }

    // ── 计算模型世界坐标，作为相机目标的基点 ──────────────────────
    const modelWorldPos = new THREE.Vector3();
    if (modelRoot) {
      modelRoot.getWorldPosition(modelWorldPos);
    }
    // 若无 modelRoot，modelWorldPos 为原点，行为与旧版完全一致

    // ── 由偏移量计算最终绝对坐标 ──────────────────────────────────
    const finalPosition = preset.offset.clone().add(modelWorldPos);
    const finalTarget   = preset.targetOffset.clone().add(modelWorldPos);

    this._flyToConfig(
      { position: finalPosition, target: finalTarget, fov: preset.fov ?? 50 },
      duration ?? this._duration,
      onDone,
    );
  }

  /**
   * 飞到任意绝对位置（不依赖模型，直接传坐标）
   */
  flyToPosition(position, target, fov = 50, duration, onDone) {
    this._flyToConfig({ position, target, fov }, duration ?? this._duration, onDone);
  }

  /** 每帧更新（在 tick 里调用） */
  update() {
    if (!this._anim) return;
    const { startPos, startTarget, startFov,
            endPos,   endTarget,   endFov,
            startTime, duration, onDone } = this._anim;

    const elapsed = performance.now() - startTime;
    const t       = Math.min(elapsed / duration, 1.0);
    const et      = this._easing(t);

    this._camera.position.lerpVectors(startPos, endPos, et);
    this._controls.target.lerpVectors(startTarget, endTarget, et);

    this._camera.fov = startFov + (endFov - startFov) * et;
    this._camera.updateProjectionMatrix();
    this._controls.update();

    if (t >= 1.0) {
      this._anim = null;
      this._controls.enabled = true;
      onDone?.();
    }
  }

  get isAnimating() { return this._anim !== null; }

  dispose() {
    this._anim = null;
  }

  // ── 私有 ─────────────────────────────────────────────────────────

  _flyToConfig(preset, duration, onDone) {
    if (this._anim) {
      this._controls.enabled = true;
      this._anim = null;
    }
    this._controls.enabled = false;

    this._anim = {
      startPos:    this._camera.position.clone(),
      startTarget: this._controls.target.clone(),
      startFov:    this._camera.fov,
      endPos:      preset.position.clone(),
      endTarget:   preset.target.clone(),
      endFov:      preset.fov ?? 50,
      startTime:   performance.now(),
      duration,
      onDone,
    };
  }
}