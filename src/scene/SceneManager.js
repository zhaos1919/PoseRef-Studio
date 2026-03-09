import * as THREE from 'three';
import { ModelLoader }        from './ModelLoader.js';
import { EnvironmentManager } from './EnvironmentManager.js';
import { LightingSystem }     from './LightingSystem.js';

export class SceneManager {
  constructor(renderer) {
    this._renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0e14);
    this.scene.fog = new THREE.FogExp2(0x0e0e14, 0.008);

    this._modelLoader   = new ModelLoader();
    this._envManager    = new EnvironmentManager(this.scene, this._renderer);
    this._modelRoot     = null;
    this.bones          = [];
    this.animations     = [];
    this.lightingSystem = new LightingSystem(this.scene, this._renderer);
  }

  get native() { return this.scene; }

  /**
   * 实时切换场景背景色
   * @param {string|number} color - CSS hex string (#rrggbb) 或 0xRRGGBB
   */
  setBackgroundColor(color) {
    const c = new THREE.Color(color);
    this.scene.background = c;
    // 同步雾颜色，保持视觉一致
    if (this.scene.fog) this.scene.fog.color.copy(c);
  }

  async loadModel({ url, onProgress, onComplete, onError } = {}) {
    try {
      if (this._modelRoot) {
        this.scene.remove(this._modelRoot);
        this._modelRoot = null;
      }

      const result = await this._modelLoader.load({ url, onProgress });
      this._modelRoot = result.scene;
      this.bones      = result.bones;
      this.animations = result.animations;

      // 直接加入场景
      this.scene.add(this._modelRoot);

      // 打印确认
      const pos = this._modelRoot.position;
      const scl = this._modelRoot.scale;
      console.info(`[SceneManager] 模型已加入场景`);
      console.info(`  position: ${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}`);
      console.info(`  scale:    ${scl.x.toFixed(3)}, ${scl.y.toFixed(3)}, ${scl.z.toFixed(3)}`);

      // 统计 mesh 数量
      let meshCount = 0;
      this._modelRoot.traverse(n => { if (n.isMesh) meshCount++; });
      console.info(`  meshes:   ${meshCount}`);

      onComplete?.({ bones: this.bones, animations: this.animations });

    } catch (err) {
      console.error('[SceneManager] 加载异常:', err);
      onError?.(err);
    }
  }

  update(_elapsed) {}

  dispose() {
    this.lightingSystem.dispose();
    this.scene.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m?.dispose());
      }
    });
    this._modelLoader.dispose();
  }
}