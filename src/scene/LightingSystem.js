/**
 * @file LightingSystem.js
 * @module scene/LightingSystem
 * @description
 * Phase IV — 动态光影系统
 *
 * 功能：
 *   1. 三点布光预设（Key / Fill / Back）
 *   2. HDR 环境贴图（RGBELoader，来自 Poly Haven CDN）
 *   3. PCFSoftShadowMap 柔和阴影
 *   4. 光源极坐标控制（经纬度 → 三维位置）
 *   5. 渐进式阴影采样（用户停止操作后自动提升质量）
 *   6. 模型 PBR 材质参数实时调节（metalness / roughness）
 *
 * 用法：
 *   const ls = new LightingSystem(scene, renderer);
 *   await ls.loadHDR();          // 可选
 *   ls.setKeyLightPolar(45, 60); // 经纬度调节
 *   ls.setMaterialProps(model, { metalness: 0.3, roughness: 0.6 });
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// ─────────────────────────────────────────────────────────────────
// 默认光源参数
// ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  // 主光（Key Light）：暖白，从右上前方打来
  key: {
    color:     0xfff5e8,
    intensity: 2.2,
    azimuth:   45,      // 水平角（°），0=正前方，顺时针
    elevation: 65,      // 仰角（°），0=水平，90=正上方
    distance:  6,       // 光源到原点的距离
    castShadow: true,
  },
  // 补光（Fill Light）：冷蓝，从左侧低角度补充阴影区
  fill: {
    color:     0xc8d8ff,
    intensity: 0.8,
    azimuth:   -110,
    elevation: 25,
    distance:  5,
    castShadow: false,
  },
  // 背光（Back / Rim Light）：蓝紫，从后方勾勒轮廓
  back: {
    color:     0x8899ff,
    intensity: 1.0,
    azimuth:   170,
    elevation: 40,
    distance:  5,
    castShadow: false,
  },
  // 环境光：大幅提亮，确保无 HDR 时也能看到模型
  ambient: {
    color:     0xffffff,
    intensity: 1.8,
  },
};

// 渐进式阴影配置
const SHADOW_LOW  = { mapSize: 512,  radius: 3 };   // 交互中（低质量）
const SHADOW_HIGH = { mapSize: 2048, radius: 6 };   // 停止操作后（高质量）
const IDLE_DELAY  = 800; // 停止操作多少毫秒后升级阴影

// 免费 HDR 资源（来自 Poly Haven，支持跨域）
// studio_small_08：中性摄影棚，适合人体参考
const HDR_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr';

export class LightingSystem {
  /**
   * @param {THREE.Scene}        scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this._scene    = scene;
    this._renderer = renderer;

    /** @type {{ key: THREE.DirectionalLight, fill: THREE.DirectionalLight, back: THREE.DirectionalLight }} */
    this._lights = {};

    /** @type {{ azimuth: number, elevation: number, distance: number }} */
    this._lightState = {
      key:  { ...DEFAULTS.key },
      fill: { ...DEFAULTS.fill },
      back: { ...DEFAULTS.back },
    };

    this._ambientLight = null;
    this._envMap       = null;
    this._hdrLoaded    = false;

    // 渐进式阴影：记录上次操作时间
    this._lastInteraction = 0;
    this._shadowQuality   = 'low';   // 'low' | 'high'
    this._idleTimer       = null;

    this._setupLights();
    console.info('[LightingSystem] 初始化完成');
  }

  // ── 公共 API ────────────────────────────────────────────────────

  /**
   * 加载 HDR 环境贴图
   * @param {string} [url] - 自定义 HDR 路径（默认使用 Poly Haven）
   * @returns {Promise<void>}
   */
  async loadHDR(url = HDR_URL) {
    try {
      console.info('[LightingSystem] 加载 HDR 环境贴图...');
      const loader = new RGBELoader();
      const texture = await loader.loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;

      // 生成预过滤环境贴图（PMREMGenerator）
      const pmrem = new THREE.PMREMGenerator(this._renderer);
      pmrem.compileEquirectangularShader();
      this._envMap = pmrem.fromEquirectangular(texture).texture;
      pmrem.dispose();
      texture.dispose();

      // 应用为场景环境反射（不作背景，保持纯色背景）
      this._scene.environment = this._envMap;
      this._hdrLoaded = true;

      console.info('[LightingSystem] ✓ HDR 环境贴图加载完成');
    } catch (err) {
      console.warn('[LightingSystem] HDR 加载失败，使用程序化 Fallback:', err.message);
      this._setupFallbackEnv();
    }
  }

  /**
   * 设置指定光源的极坐标位置
   * @param {'key'|'fill'|'back'} lightKey
   * @param {number} azimuth   - 水平角（°）
   * @param {number} elevation - 仰角（°）
   */
  setLightPolar(lightKey, azimuth, elevation) {
    const state = this._lightState[lightKey];
    if (!state) return;
    state.azimuth   = azimuth;
    state.elevation = elevation;
    this._applyLightPosition(lightKey);
    this._markInteraction();
  }

  /**
   * 设置光源强度
   * @param {'key'|'fill'|'back'|'ambient'} lightKey
   * @param {number} intensity
   */
  setLightIntensity(lightKey, intensity) {
    if (lightKey === 'ambient') {
      if (this._ambientLight) this._ambientLight.intensity = intensity;
      return;
    }
    const light = this._lights[lightKey];
    if (light) light.intensity = intensity;
    this._markInteraction();
  }

  /**
   * 设置光源颜色（十六进制数值或 CSS 字符串）
   * @param {'key'|'fill'|'back'|'ambient'} lightKey
   * @param {number|string} color
   */
  setLightColor(lightKey, color) {
    const target = lightKey === 'ambient' ? this._ambientLight : this._lights[lightKey];
    if (target) target.color.set(color);
    this._markInteraction();
  }

  /**
   * 批量设置模型 PBR 材质参数
   * @param {THREE.Object3D} modelRoot
   * @param {{ metalness?: number, roughness?: number, envMapIntensity?: number }} props
   */
  setMaterialProps(modelRoot, props) {
    if (!modelRoot) return;
    // Track for PresetStore serialization
    this._modelRootRef    = modelRoot;
    this._lastMaterialProps = { ...(this._lastMaterialProps ?? {}), ...props };
    modelRoot.traverse(node => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach(mat => {
        if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
        if (props.metalness        !== undefined) mat.metalness        = props.metalness;
        if (props.roughness        !== undefined) mat.roughness        = props.roughness;
        if (props.envMapIntensity  !== undefined) mat.envMapIntensity  = props.envMapIntensity;
        mat.needsUpdate = true;
      });
    });
  }

  /**
   * 获取当前光源状态快照（供 UI 初始化）
   * @returns {Object}
   */
  getState() {
    return {
      key:     { ...this._lightState.key,  intensity: this._lights.key?.intensity  ?? DEFAULTS.key.intensity },
      fill:    { ...this._lightState.fill, intensity: this._lights.fill?.intensity ?? DEFAULTS.fill.intensity },
      back:    { ...this._lightState.back, intensity: this._lights.back?.intensity ?? DEFAULTS.back.intensity },
      ambient: { intensity: this._ambientLight?.intensity ?? DEFAULTS.ambient.intensity },
    };
  }

  /**
   * 标记用户正在交互（降低阴影质量，操作结束后自动升级）
   */
  _markInteraction() {
    this._lastInteraction = performance.now();
    if (this._shadowQuality !== 'low') {
      this._setShadowQuality('low');
    }
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this._setShadowQuality('high');
    }, IDLE_DELAY);
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  _setupLights() {
    // 环境光
    this._ambientLight = new THREE.AmbientLight(
      DEFAULTS.ambient.color,
      DEFAULTS.ambient.intensity
    );
    this._ambientLight.name = 'AmbientLight';
    this._scene.add(this._ambientLight);

    // 三点光源
    for (const key of ['key', 'fill', 'back']) {
      const def   = DEFAULTS[key];
      const light = new THREE.DirectionalLight(def.color, def.intensity);
      light.name  = `${key}Light`;

      if (def.castShadow) {
        light.castShadow                    = true;
        light.shadow.camera.near            = 0.5;
        light.shadow.camera.far             = 20;
        light.shadow.camera.left            = -3;
        light.shadow.camera.right           =  3;
        light.shadow.camera.top             =  4;
        light.shadow.camera.bottom          = -1;
        light.shadow.bias                   = -0.0003;
        light.shadow.normalBias             =  0.02;
        // 初始低质量（交互时不卡顿）
        light.shadow.mapSize.set(SHADOW_LOW.mapSize, SHADOW_LOW.mapSize);
        light.shadow.radius                 = SHADOW_LOW.radius;
      }

      // 加入目标点（固定在原点）
      light.target.position.set(0, 0.9, 0);
      this._scene.add(light.target);
      this._scene.add(light);
      this._lights[key] = light;

      // 设置初始极坐标位置
      this._applyLightPosition(key);
    }

    // 初始升级为高质量阴影
    setTimeout(() => this._setShadowQuality('high'), 1200);
  }

  /**
   * 极坐标 → 笛卡尔坐标，更新光源位置
   * @private
   */
  _applyLightPosition(key) {
    const light = this._lights[key];
    const state = this._lightState[key];
    if (!light || !state) return;

    const azRad = THREE.MathUtils.degToRad(state.azimuth);
    const elRad = THREE.MathUtils.degToRad(state.elevation);
    const d     = state.distance;

    // 球面坐标公式（Y 轴朝上）
    light.position.set(
      d * Math.cos(elRad) * Math.sin(azRad),
      d * Math.sin(elRad),
      d * Math.cos(elRad) * Math.cos(azRad)
    );
    // 始终注视人体重心
    light.target.position.set(0, 0.9, 0);
    light.target.updateMatrixWorld();
  }

  /**
   * 切换阴影贴图质量（低/高）
   * @param {'low'|'high'} quality
   * @private
   */
  _setShadowQuality(quality) {
    if (this._shadowQuality === quality) return;
    this._shadowQuality = quality;
    const cfg = quality === 'high' ? SHADOW_HIGH : SHADOW_LOW;

    for (const light of Object.values(this._lights)) {
      if (!light.castShadow) continue;
      light.shadow.mapSize.set(cfg.mapSize, cfg.mapSize);
      light.shadow.radius = cfg.radius;
      // 必须销毁旧 shadowMap 才能触发重新生成
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    console.info(`[LightingSystem] 阴影质量: ${quality} (${cfg.mapSize}px, r=${cfg.radius})`);
  }

  /**
   * HDR 加载失败时的程序化 Fallback
   * @private
   */
  _setupFallbackEnv() {
    const { RoomEnvironment } = { RoomEnvironment: null };
    try {
      const pmrem = new THREE.PMREMGenerator(this._renderer);
      pmrem.compileEquirectangularShader();
      // 使用简单的半球渐变作为环境
      const rt = pmrem.fromScene({ isScene: true, background: new THREE.Color(0x2a2a3a) });
      if (rt) {
        this._scene.environment = rt.texture;
        pmrem.dispose();
      }
    } catch (e) {
      console.warn('[LightingSystem] Fallback 环境也失败，跳过');
    }
  }

  dispose() {
    clearTimeout(this._idleTimer);
    this._envMap?.dispose();
    for (const light of Object.values(this._lights)) {
      light.shadow?.map?.dispose();
      this._scene.remove(light);
      this._scene.remove(light.target);
    }
    if (this._ambientLight) this._scene.remove(this._ambientLight);
    console.info('[LightingSystem] 已释放');
  }
}