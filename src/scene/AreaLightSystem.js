/**
 * @file AreaLightSystem.js
 * @module scene/AreaLightSystem
 * @description
 * Phase VIII — 物理级面积光（RectAreaLight）系统
 *
 * 功能：
 *   1. 管理多个 RectAreaLight（柔光箱）实例
 *   2. 每个面积光支持独立的位置、朝向、宽度、高度、颜色、强度
 *   3. 自动加载 RectAreaLightUniformsLib（PBR 材质所需的特殊 LTC 查找表）
 *   4. 可选渲染可视化辅助对象（RectAreaLightHelper）
 *   5. 完整 dispose() 内存释放
 *
 * 使用方法：
 *   const areaLightSys = new AreaLightSystem(scene, renderer);
 *   const light = areaLightSys.addAreaLight({ width: 2, height: 1.2, intensity: 8 });
 *   areaLightSys.updateAreaLight(light.id, { color: '#ffe4b3', intensity: 12 });
 *   areaLightSys.removeAreaLight(light.id);
 */

import * as THREE from 'three';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

// ─────────────────────────────────────────────────────────────────
// 面积光默认参数
// ─────────────────────────────────────────────────────────────────
const AREA_LIGHT_DEFAULTS = {
  color:     '#ffe8d0',   // 暖白（影棚柔光箱色温约 5500K）
  intensity: 8,
  width:     2.0,         // 宽（m）
  height:    1.2,         // 高（m）
  // 在模型右前方，模拟主光源柔光箱位置
  position:  { x: 1.5, y: 2.2, z: 1.8 },
  // 让面板朝向人体重心
  target:    { x: 0,   y: 0.9, z: 0 },
  showHelper: true,
};

let _idCounter = 0;

export class AreaLightSystem {
  /**
   * @param {THREE.Scene}        scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this._scene    = scene;
    this._renderer = renderer;

    /** @type {Map<string, { light: THREE.RectAreaLight, helper: RectAreaLightHelper|null, cfg: Object }>} */
    this._lights = new Map();

    this._libLoaded = false;

    // RectAreaLight 需要在 renderer 初始化后立即注入 LTC 查找表
    this._initLib();

    console.info('[AreaLightSystem] 初始化完成（RectAreaLightUniformsLib 已注入）');
  }

  // ── 公共 API ────────────────────────────────────────────────────

  /**
   * 新增一个面积光（柔光箱）
   * @param {Object} opts - 覆盖默认参数
   * @returns {{ id: string, light: THREE.RectAreaLight }}
   */
  addAreaLight(opts = {}) {
    const cfg = { ...AREA_LIGHT_DEFAULTS, ...opts };
    const id  = `areaLight_${++_idCounter}`;

    // 创建 RectAreaLight
    const light = new THREE.RectAreaLight(
      new THREE.Color(cfg.color),
      cfg.intensity,
      cfg.width,
      cfg.height
    );
    light.name = id;

    // 位置
    light.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

    // 让发光面朝向目标点
    light.lookAt(cfg.target.x, cfg.target.y, cfg.target.z);

    this._scene.add(light);

    // 可选：可视化辅助框（帮助调试，答辩演示时可以展示）
    let helper = null;
    if (cfg.showHelper) {
      helper = new RectAreaLightHelper(light);
      this._scene.add(helper);
    }

    this._lights.set(id, { light, helper, cfg: { ...cfg } });

    console.info(`[AreaLightSystem] 添加面积光: ${id}`, cfg);
    return { id, light };
  }

  /**
   * 更新面积光参数
   * @param {string} id
   * @param {Object} props - 支持: color, intensity, width, height, position, target
   */
  updateAreaLight(id, props) {
    const entry = this._lights.get(id);
    if (!entry) return;
    const { light, helper, cfg } = entry;

    if (props.color     !== undefined) light.color.set(props.color);
    if (props.intensity !== undefined) light.intensity = props.intensity;

    // 宽高需要同步更新 helper
    if (props.width  !== undefined) {
      light.width  = props.width;
      cfg.width = props.width;
    }
    if (props.height !== undefined) {
      light.height = props.height;
      cfg.height = props.height;
    }

    // 重建 helper（RectAreaLightHelper 不支持动态尺寸更新）
    if ((props.width !== undefined || props.height !== undefined) && helper) {
      this._scene.remove(helper);
      helper.dispose();
      const newHelper = new RectAreaLightHelper(light);
      this._scene.add(newHelper);
      entry.helper = newHelper;
    }

    if (props.position !== undefined) {
      const p = props.position;
      light.position.set(p.x ?? cfg.position.x, p.y ?? cfg.position.y, p.z ?? cfg.position.z);
    }
    if (props.target !== undefined) {
      const t = props.target;
      light.lookAt(t.x ?? cfg.target.x, t.y ?? cfg.target.y, t.z ?? cfg.target.z);
    }

    Object.assign(cfg, props);
  }

  /**
   * 切换辅助框可见性
   * @param {string} id
   * @param {boolean} visible
   */
  setHelperVisible(id, visible) {
    const entry = this._lights.get(id);
    if (!entry) return;
    if (entry.helper) {
      entry.helper.visible = visible;
    } else if (visible) {
      // 懒创建
      const helper = new RectAreaLightHelper(entry.light);
      this._scene.add(helper);
      entry.helper = helper;
    }
  }

  /**
   * 移除并释放单个面积光
   * @param {string} id
   */
  removeAreaLight(id) {
    const entry = this._lights.get(id);
    if (!entry) return;
    const { light, helper } = entry;

    if (helper) {
      this._scene.remove(helper);
      helper.dispose?.();
    }
    this._scene.remove(light);
    light.dispose?.();

    this._lights.delete(id);
    console.info(`[AreaLightSystem] 移除面积光: ${id}`);
  }

  /**
   * 获取所有面积光的 ID 列表
   * @returns {string[]}
   */
  getIds() {
    return [...this._lights.keys()];
  }

  /**
   * 获取指定面积光的当前配置
   * @param {string} id
   * @returns {Object|null}
   */
  getConfig(id) {
    return this._lights.get(id)?.cfg ?? null;
  }

  /**
   * 释放所有面积光资源
   */
  dispose() {
    for (const id of [...this._lights.keys()]) {
      this.removeAreaLight(id);
    }
    console.info('[AreaLightSystem] 全部面积光已释放');
  }

  // ── 私有 ──────────────────────────────────────────────────────────

  /**
   * 初始化 LTC（线性变换余弦）查找表
   * RectAreaLight 的物理 PBR 高光计算依赖此数据注入
   * @private
   */
  _initLib() {
    if (this._libLoaded) return;
    try {
      RectAreaLightUniformsLib.init();
      this._libLoaded = true;
      console.info('[AreaLightSystem] ✓ RectAreaLightUniformsLib 注入完成');
    } catch (e) {
      console.error('[AreaLightSystem] RectAreaLightUniformsLib 注入失败:', e);
    }
  }
}