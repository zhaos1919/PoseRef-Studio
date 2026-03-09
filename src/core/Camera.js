/**
 * @file Camera.js
 * @module core/Camera
 * @description
 * 封装透视相机（PerspectiveCamera）的创建与窗口自适应。
 * 设计为可扩展：后续可在此基础上叠加 OrbitControls、
 * 相机动画轨迹、多视角切换等功能。
 */

import * as THREE from 'three';

export class Camera {
  /**
   * @param {Object} options
   * @param {number} [options.fov=50]       - 垂直视野角度（度）
   * @param {number} [options.near=0.1]     - 近裁剪面
   * @param {number} [options.far=1000]     - 远裁剪面
   * @param {Object} [options.position]     - 初始位置 {x, y, z}
   */
  constructor({
    fov      = 50,
    near     = 0.1,
    far      = 1000,
    position = { x: 0, y: 1.5, z: 5 },
  } = {}) {

    // 使用当前视口的宽高比（此时 DOM 应已布局完成）
    const aspect = window.innerWidth / window.innerHeight;

    this.instance = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // 设置初始位置
    this.instance.position.set(position.x, position.y, position.z);

    // 默认朝向原点（场景中心）
    this.instance.lookAt(0, 0, 0);

    console.info(`[Camera] 初始化完成 | FOV: ${fov}° | 宽高比: ${aspect.toFixed(3)}`);
  }

  /**
   * 处理窗口大小变化，更新相机宽高比
   * @param {number} width  - 新的视口宽度
   * @param {number} height - 新的视口高度
   */
  resize(width, height) {
    this.instance.aspect = width / height;
    // 更新投影矩阵（必须在修改 aspect 后调用）
    this.instance.updateProjectionMatrix();
  }

  /**
   * 返回底层 Three.js Camera 实例
   * （便于直接传递给 renderer.render / controls 等）
   * @returns {THREE.PerspectiveCamera}
   */
  get native() {
    return this.instance;
  }
}