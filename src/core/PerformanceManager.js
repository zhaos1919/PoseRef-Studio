/**
 * @file PerformanceManager.js
 * @module core/PerformanceManager
 * @description
 * Phase V — 性能管理器
 *
 * 职责：
 *   1. GPU 性能分级（高/中/低）自动检测
 *   2. 对应画质预设（DPR / 阴影贴图 / 抗锯齿 / 雾效）
 *   3. 运行时 FPS 监控 → 自动降级保帧
 *   4. 渐进式渲染：停止交互后逐步提升采样质量
 *   5. 内存泄漏防护：对象池 + 定期 GC hint
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
// 画质预设
// ─────────────────────────────────────────────────────────────────
const QUALITY_PRESETS = {
  high: {
    label:         '高画质',
    dpr:           Math.min(window.devicePixelRatio, 2),
    shadowMapSize: 2048,
    shadowRadius:  6,
    antialias:     true,
    fogDensity:    0.008,
    toneMapping:   THREE.ACESFilmicToneMapping,
    exposure:      1.0,
  },
  medium: {
    label:         '中画质',
    dpr:           Math.min(window.devicePixelRatio, 1.5),
    shadowMapSize: 1024,
    shadowRadius:  4,
    antialias:     true,
    fogDensity:    0.010,
    toneMapping:   THREE.ACESFilmicToneMapping,
    exposure:      1.0,
  },
  low: {
    label:         '低画质',
    dpr:           1,
    shadowMapSize: 512,
    shadowRadius:  2,
    antialias:     false,
    fogDensity:    0.015,
    toneMapping:   THREE.ACESFilmicToneMapping,
    exposure:      1.0,
  },
};

// FPS 监控配置
const FPS_WINDOW       = 9999;   // 延长窗口，减少自动降级频率
const FPS_DOWNGRADE    = 5;      // 极低阈值，实际不触发自动降级
const FPS_UPGRADE      = 55;     // 高于此 FPS 考虑升级
const PROGRESSIVE_IDLE = 1200;   // 停止操作多少 ms 后触发渐进渲染

export class PerformanceManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene}         scene
   */
  constructor(renderer, scene) {
    this._renderer = renderer;
    this._scene    = scene;

    this._currentQuality  = null;
    this._fpsHistory      = [];
    this._fpsLastTime     = performance.now();
    this._fpsFrameCount   = 0;
    this._idleTimer       = null;
    this._progressStep    = 0;   // 渐进采样步数（0=基础，3=最高）
    this._isIdle          = false;
    this._onQualityChange = null; // 外部回调

    // 对象池（复用 Vector3 / Matrix4 避免 GC）
    this._v3Pool   = Array.from({ length: 8 }, () => new THREE.Vector3());
    this._m4Pool   = Array.from({ length: 4 }, () => new THREE.Matrix4());
    this._poolIdx  = { v3: 0, m4: 0 };
  }

  // ── 公共 API ──────────────────────────────────────────────────────

  /**
   * 自动检测 GPU 性能，返回建议画质等级
   * @returns {'high'|'medium'|'low'}
   */
  detectGPUTier() {
    const gl   = this._renderer.getContext();
    const ext  = gl.getExtension('WEBGL_debug_renderer_info');
    const info = this._renderer.info;

    // 方案 A：通过 WebGL 扩展读取 GPU 型号字符串
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)?.toLowerCase() ?? '';
      if (/apple m[23456]|rtx [34]0|rx 7[6-9]00|a17|a16/i.test(renderer)) return 'high';
      if (/apple m1|rtx [12]0|rx [56][0-9]00|adreno [67]|mali-g7[0-9]/i.test(renderer)) return 'medium';
      if (/intel|mali-g5|adreno [45]|sgx/i.test(renderer)) return 'low';
    }

    // 方案 B：通过最大纹理尺寸估算
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTex >= 16384) return 'high';
    if (maxTex >= 8192)  return 'medium';
    return 'low';
  }

  /**
   * 应用指定画质预设
   * @param {'high'|'medium'|'low'} quality
   */
  applyQuality(quality) {
    if (this._currentQuality === quality) return;
    const preset = QUALITY_PRESETS[quality];
    if (!preset) return;

    this._currentQuality = quality;

    // DPR
    this._renderer.setPixelRatio(preset.dpr);

    // 色调映射
    this._renderer.toneMapping         = preset.toneMapping;
    this._renderer.toneMappingExposure = preset.exposure;

    // 场景雾效
    if (this._scene.fog) this._scene.fog.density = preset.fogDensity;

    // 阴影贴图（通过 LightingSystem 已有的接口）
    this._pendingPreset = preset;

    console.info(`[PerformanceManager] 画质切换 → ${preset.label} (DPR:${preset.dpr})`);
    this._onQualityChange?.(quality, preset);
  }

  /**
   * 应用阴影设置到所有投影光源
   * @param {THREE.Light[]} lights
   */
  applyShadowSettings(lights) {
    const preset = QUALITY_PRESETS[this._currentQuality ?? 'high'];
    for (const light of lights) {
      if (!light.castShadow) continue;
      light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      light.shadow.radius = preset.shadowRadius;
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }

  /**
   * 每帧调用：FPS 监控 + 自动降级
   * @returns {number} 当前 FPS（每 500ms 更新一次）
   */
  tick() {
    this._fpsFrameCount++;
    const now = performance.now();
    const dt  = now - this._fpsLastTime;

    if (dt < 500) return -1;

    const fps = Math.round((this._fpsFrameCount / dt) * 1000);
    this._fpsFrameCount = 0;
    this._fpsLastTime   = now;

    // 记录 FPS 历史
    this._fpsHistory.push({ t: now, fps });
    // 只保留最近 FPS_WINDOW 内的样本
    this._fpsHistory = this._fpsHistory.filter(s => now - s.t < FPS_WINDOW);

    // 自动降级判断（需要连续 6 帧低 FPS 才降级，防抖）
    if (this._fpsHistory.length >= 6) {
      const avg = this._fpsHistory.reduce((s, x) => s + x.fps, 0) / this._fpsHistory.length;
      // 自动降级已禁用 — 保持用户选择的画质
      // if (avg < FPS_DOWNGRADE && this._currentQuality !== 'low') { this._autoDowngrade(); }
    }

    return fps;
  }

  /**
   * 通知用户开始交互（停止渐进渲染）
   */
  onInteractionStart() {
    this._isIdle = false;
    this._progressStep = 0;
    clearTimeout(this._idleTimer);

    // 立即恢复到当前画质预设的 DPR，防止渐进渲染遗留的低分辨率
    if (this._currentQuality) {
      const preset = QUALITY_PRESETS[this._currentQuality];
      if (preset) this._renderer.setPixelRatio(preset.dpr);
    }
  }

  /**
   * 通知用户停止交互（启动渐进渲染）
   * @param {Function} onStep - (step: 0~3) => void，每步回调
   */
  onInteractionEnd(onStep) {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this._isIdle = true;
      this._runProgressiveSteps(onStep);
    }, PROGRESSIVE_IDLE);
  }

  /**
   * 从对象池获取 Vector3（避免每帧 new THREE.Vector3()）
   * @returns {THREE.Vector3}
   */
  getV3() {
    const v = this._v3Pool[this._poolIdx.v3 % this._v3Pool.length];
    this._poolIdx.v3++;
    return v.set(0, 0, 0);
  }

  /** 设置画质变更回调 */
  onQualityChange(cb) { this._onQualityChange = cb; }

  dispose() {
    clearTimeout(this._idleTimer);
  }

  // ── 私有方法 ──────────────────────────────────────────────────────

  _autoDowngrade() {
    const order = ['high', 'medium', 'low'];
    const idx   = order.indexOf(this._currentQuality);
    if (idx < order.length - 1) {
      console.warn(`[PerformanceManager] FPS 过低，自动降级`);
      this.applyQuality(order[idx + 1]);
    }
  }

  /**
   * 渐进渲染步骤：
   *   Step 0 → 基础阴影 (512px)
   *   Step 1 → 中阴影 (1024px)
   *   Step 2 → 高阴影 (2048px) + 高 DPR
   *   Step 3 → 最终 ACES 色调 + 最高曝光精度
   */
  _runProgressiveSteps(onStep) {
    // 渐进渲染：先用低阴影质量快速响应，再逐步提升到满画质
    // 注意：DPR 从步骤 1 开始才逐步提升（步骤 0 保持当前 DPR，仅降低阴影开销）
    const baseDpr = QUALITY_PRESETS[this._currentQuality ?? 'high']?.dpr
                    ?? Math.min(window.devicePixelRatio, 2);

    const steps = [
      () => onStep?.(0, { shadowMapSize: 512,  dpr: baseDpr }),
      () => onStep?.(1, { shadowMapSize: 1024, dpr: baseDpr }),
      () => onStep?.(2, { shadowMapSize: 2048, dpr: baseDpr }),
      () => onStep?.(3, { shadowMapSize: 2048, dpr: baseDpr, final: true }),
    ];

    let step = 0;
    const runNext = () => {
      if (!this._isIdle || step >= steps.length) return;
      steps[step]();
      step++;
      // 每步间隔 400ms，给渲染器时间刷新
      setTimeout(runNext, 400);
    };
    runNext();
  }
}