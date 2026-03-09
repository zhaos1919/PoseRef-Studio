import * as THREE     from 'three';
import { GLTFLoader }  from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const DEFAULT_MODEL_URL = '/Xbot.glb';
const TARGET_HEIGHT     = 1.75;

export class ModelLoader {
  constructor() {
    this._dracoLoader = new DRACOLoader();
    this._dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this._dracoLoader.setDecoderConfig({ type: 'js' });
    this._gltfLoader = new GLTFLoader();
    this._gltfLoader.setDRACOLoader(this._dracoLoader);
  }

  load({ url = DEFAULT_MODEL_URL, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      this._gltfLoader.load(url,
        (gltf) => {
          const root = gltf.scene;

          // ── 1. 材质：MeshStandardMaterial 中灰蓝色，双面渲染 ──────
          root.traverse(n => {
            if (!n.isMesh) return;
            n.frustumCulled = false;  // ★ 关键：SkinnedMesh 必须禁用视锥裁剪
            n.visible = true;
            const olds = Array.isArray(n.material) ? n.material : [n.material];
            const news = olds.map(m => {
              // 如果原材质已经有合理颜色（亮度足够），保留并升级
              let color = new THREE.Color(0x8899cc); // 默认蓝灰色
              if (m.color) {
                const c = m.color;
                const lum = 0.2126*c.r + 0.7152*c.g + 0.0722*c.b;
                if (lum > 0.05) color = c.clone(); // 原色够亮则保留
              }
              const mat = new THREE.MeshStandardMaterial({
                color,
                roughness:   0.6,
                metalness:   0.05,
                side:        THREE.DoubleSide, // 双面，任何角度都可见
              });
              m.dispose();
              return mat;
            });
            n.material = Array.isArray(n.material) ? news : news[0];
            n.castShadow    = true;
            n.receiveShadow = true;
          });

          // ── 2. 用临时场景计算真实包围盒 ──────────────────────────
          const tempScene = new THREE.Scene();
          tempScene.add(root);
          root.updateMatrixWorld(true);

          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          box.getSize(size);

          if (size.y > 0.01) {
            const s = TARGET_HEIGHT / size.y;
            root.scale.setScalar(s);
            root.updateMatrixWorld(true);
            const box2   = new THREE.Box3().setFromObject(root);
            const center = new THREE.Vector3();
            box2.getCenter(center);
            root.position.set(-center.x, -box2.min.y, -center.z);
            console.info(`[ModelLoader] ✓ H=${size.y.toFixed(2)} scale=${s.toFixed(3)}`);
          } else {
            root.scale.setScalar(0.01);
            root.position.set(0, 0, 0);
          }

          tempScene.remove(root);

          // ── 3. 提取骨骼 ──────────────────────────────────────────
          const bones = [];
          root.traverse(n => { if (n.isBone) bones.push(n); });

          resolve({ scene: root, bones, animations: gltf.animations ?? [] });
        },
        e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded/e.total*100)); else onProgress?.(-1); },
        e => reject(new Error(`加载失败: ${e.message ?? e}`))
      );
    });
  }

  dispose() { this._dracoLoader.dispose(); }
}