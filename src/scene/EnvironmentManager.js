/**
 * @file EnvironmentManager.js
 * @module scene/EnvironmentManager
 * @description
 * 环境管理器：负责 HDR 环境映射和无限地面的管理。
 *
 * Phase II 包含：
 *   - 无限接影地面（ShadowMaterial + 视觉无限延伸效果）
 *   - HDR 环境映射入口（预留，当前使用程序化天空色）
 *
 * 【Phase III 如何接入真实 HDR】
 *   1. 从 Poly Haven（https://polyhaven.com/hdris）下载 .hdr 文件
 *      推荐：studio_small_08_1k.hdr（室内摄影棚风格）
 *   2. 将文件放入 /public/textures/
 *   3. 取消注释下方 _loadHDR() 方法，并传入路径
 *   4. 调用 envManager.loadHDR('/textures/studio_small_08_1k.hdr')
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
// ⬇️ Phase III 取消此注释：
// import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export class EnvironmentManager {
  /**
   * @param {THREE.Scene}          scene
   * @param {THREE.WebGLRenderer}  renderer
   */
  constructor(scene, renderer) {
    this._scene    = scene;
    this._renderer = renderer;

    this._setupGround();
    this._setupFallbackEnv();
  }

  /**
   * 【预留接口】加载真实 HDR 环境贴图
   * Phase II 当前不调用此方法，但结构完整，Phase III 直接启用即可。
   *
   * @param {string} hdrPath - HDR 文件路径，如 '/textures/env.hdr'
   * @returns {Promise<void>}
   */
  async loadHDR(hdrPath) {
    // ── Phase III：取消以下注释 ──────────────────────────────────────
    /*
    const pmremGenerator = new PMREMGenerator(this._renderer);
    pmremGenerator.compileEquirectangularShader();

    const rgbeLoader = new RGBELoader();
    const texture = await rgbeLoader.loadAsync(hdrPath);

    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    pmremGenerator.dispose();
    texture.dispose();

    // 应用到场景：所有 MeshStandardMaterial 自动响应
    this._scene.environment = envMap;

    // 可选：将 HDR 也作为背景显示（开启后会遮盖纯色背景）
    // this._scene.background = envMap;

    console.info(`[EnvironmentManager] HDR 环境贴图加载完成: ${hdrPath}`);
    */

    console.warn('[EnvironmentManager] loadHDR() 当前为预留接口，Phase III 启用。');
  }

  /**
   * 设置无限地面（接收投影）
   * @private
   */
  _setupGround() {
    // ── 主阴影接收平面 ────────────────────────────────────────────────
    // 使用大尺寸平面模拟"无限地面"（对于人体模型，100x100 已足够）
    const groundGeo = new THREE.PlaneGeometry(100, 100);

    // ShadowMaterial：只显示阴影，自身完全透明
    // 这样地面不会遮挡背景色，但模型的投影清晰可见
    const shadowMat = new THREE.ShadowMaterial({
      opacity:     0.35,   // 阴影深度，0=无阴影，1=全黑
      transparent: true,
    });

    this._groundMesh = new THREE.Mesh(groundGeo, shadowMat);
    this._groundMesh.rotation.x    = -Math.PI / 2;
    this._groundMesh.position.y    = 0;
    this._groundMesh.receiveShadow = true;
    this._groundMesh.name          = 'InfiniteGround';

    // 注意：renderOrder 设为 -1，确保在透明物体之前渲染
    this._groundMesh.renderOrder = -1;

    this._scene.add(this._groundMesh);

    // ── 视觉辅助：极细网格线（开发阶段使用） ─────────────────────────
    // 使用两层网格：粗网格（1m）+ 细网格（0.1m）形成层次感
    const gridCoarse = new THREE.GridHelper(20, 20, 0x2a2a3a, 0x252530);
    gridCoarse.name = 'GridCoarse';
    gridCoarse.position.y = 0.001;  // 微微抬起，避免 Z-fighting
    this._scene.add(gridCoarse);

    const gridFine = new THREE.GridHelper(20, 200, 0x1e1e28, 0x1e1e28);
    gridFine.name = 'GridFine';
    gridFine.position.y = 0.0005;
    this._scene.add(gridFine);

    // 保存引用（方便后续 UI 切换显隐）
    this._gridCoarse = gridCoarse;
    this._gridFine   = gridFine;

    console.info('[EnvironmentManager] 无限地面初始化完成');
  }

  /**
   * 设置程序化环境色（HDR 加载前的 Fallback）
   * 使用渐变色模拟摄影棚顶部打光的环境散射
   * @private
   */
  _setupFallbackEnv() {
    // PMREMGenerator 将场景转换为预过滤的环境贴图
    // RoomEnvironment 是 Three.js 内置的中性摄影棚场景（需从 jsm 单独导入）
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    pmrem.compileEquirectangularShader();

    const roomEnv = new RoomEnvironment();
    const envTexture = pmrem.fromScene(roomEnv).texture;

    // 应用到场景：所有 MeshStandardMaterial 自动响应环境反射
    this._scene.environment = envTexture;

    roomEnv.dispose();
    pmrem.dispose();

    console.info('[EnvironmentManager] Fallback RoomEnvironment 已应用');
  }

  /**
   * 切换网格线显隐
   * @param {boolean} visible
   */
  setGridVisible(visible) {
    if (this._gridCoarse) this._gridCoarse.visible = visible;
    if (this._gridFine)   this._gridFine.visible   = visible;
  }

  /**
   * 切换地面阴影显隐
   * @param {boolean} visible
   */
  setGroundVisible(visible) {
    if (this._groundMesh) this._groundMesh.visible = visible;
  }
}