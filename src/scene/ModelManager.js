/**
 * @file ModelManager.js
 * @module scene/ModelManager
 * @description
 * Phase VIII-fix — 双光圈 Bug 修复版
 *
 * 根本原因：_haloMesh 单引用追踪在 _notify() 触发二次 _setActive 时会失效，
 * 导致旧光圈子节点残留在前一个模型的 Object3D 树中。
 *
 * 修复策略：
 *   - 光环 Mesh 统一命名为 '__selectionHalo'
 *   - _destroyAllHalos() 遍历【所有模型子树】移除全部同名节点
 *   - 彻底根治任何情况下的残留，无需依赖单引用追踪
 */

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PoseManager } from '../pose/PoseManager.js';

let _nextId = 1;

const HALO_NAME     = '__selectionHalo';
const HALO_RADIUS   = 0.28;
const HALO_TUBE     = 0.012;
const HALO_COLOR    = 0x60aaff;
const HALO_Y_OFFSET = 0.008;

export class ModelManager {
  constructor(scene) {
    this._scene          = scene;
    this._entries        = [];
    this._active         = null;
    this._source         = null;
    this._haloAnimHandle = null;
    this._onChangeCbs    = [];
  }

  // ── 公开 API ──────────────────────────────────────────────────────

  get entries()           { return this._entries; }
  get activeEntry()       { return this._active; }
  get activeRoot()        { return this._active?.root ?? null; }
  get activePoseManager() { return this._active?.poseManager ?? null; }

  registerInitialModel(root, bones) {
    this._source = root;
    this._isolateMaterials(root);
    const entry = this._makeEntry(root, bones);
    this._entries.push(entry);
    this._setActive(entry);
    this._notify();
  }

  cloneModel() {
    if (!this._source) throw new Error('[ModelManager] 尚无原始模型可克隆');

    const cloned = SkeletonUtils.clone(this._source);
    const offset = (this._entries.length % 2 === 0 ? 1 : -1)
                 * (Math.ceil(this._entries.length / 2) * 0.9);
    cloned.position.set(
      this._source.position.x + offset,
      this._source.position.y,
      this._source.position.z
    );
    cloned.traverse(n => { if (n.isSkinnedMesh) n.frustumCulled = false; });
    this._isolateMaterials(cloned);
    this._scene.add(cloned);

    const bones = [];
    cloned.traverse(n => { if (n.isBone) bones.push(n); });

    const entry = this._makeEntry(cloned, bones);
    this._entries.push(entry);
    this._setActive(entry);
    this._notify();
    return entry;
  }

  setActive(id) {
    const entry = this._entries.find(e => e.id === id);
    if (!entry || entry === this._active) return;
    this._setActive(entry);
    this._notify();
  }

  removeEntry(id) {
    if (this._entries.length <= 1) return;
    const idx = this._entries.findIndex(e => e.id === id);
    if (idx === -1) return;
    const [removed] = this._entries.splice(idx, 1);

    // 先全量清圈，再移除模型，防止 dispose 时光圈还挂在树上
    this._destroyAllHalos();
    this._scene.remove(removed.root);
    removed.root.traverse(n => {
      if (n.isMesh) {
        n.geometry?.dispose();
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(m => m?.dispose());
      }
    });

    const nextActive = this._active?.id === id ? this._entries[0] : this._active;
    this._setActive(nextActive);
    this._notify();
  }

  onChange(cb) { this._onChangeCbs.push(cb); }

  // ── 私有 ─────────────────────────────────────────────────────────

  _isolateMaterials(root) {
    root.traverse(n => {
      if (!n.isMesh || n.name === HALO_NAME) return;
      if (Array.isArray(n.material)) {
        n.material = n.material.map(m => {
          if (!m) return m;
          const c = m.clone(); c.needsUpdate = true; return c;
        });
      } else if (n.material) {
        const c = n.material.clone(); c.needsUpdate = true; n.material = c;
      }
    });
  }

  _makeEntry(root, bones) {
    const id = `model_${_nextId++}`;
    return { id, root, bones, poseManager: new PoseManager(bones), label: `角色 ${_nextId - 1}` };
  }

  _setActive(entry) {
    this._active = entry;

    // ── 全量清除所有模型上的光圈（核心修复）────────────────────────
    // 不依赖单引用，直接按名字扫描子树，彻底防止残留
    this._destroyAllHalos();

    if (!entry) return;

    // ── 在激活模型脚下创建新光圈 ─────────────────────────────────
    const geo  = new THREE.TorusGeometry(HALO_RADIUS, HALO_TUBE, 8, 48);
    const mat  = new THREE.MeshBasicMaterial({
      color:       HALO_COLOR,
      transparent: true,
      opacity:     0.7,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const halo      = new THREE.Mesh(geo, mat);
    halo.name       = HALO_NAME;
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, HALO_Y_OFFSET, 0);
    entry.root.add(halo);

    this._startHaloAnim(halo);
  }

  /**
   * 扫描所有已注册模型的子树，移除并释放每一个名为 HALO_NAME 的节点。
   * 这是防止双光圈的核心保障，完全不依赖引用追踪。
   */
  _destroyAllHalos() {
    if (this._haloAnimHandle) {
      cancelAnimationFrame(this._haloAnimHandle);
      this._haloAnimHandle = null;
    }
    for (const entry of this._entries) {
      const toRemove = [];
      entry.root.traverse(n => { if (n.name === HALO_NAME) toRemove.push(n); });
      for (const n of toRemove) {
        n.parent?.remove(n);
        n.geometry?.dispose();
        n.material?.dispose();
      }
    }
  }

  _startHaloAnim(halo) {
    const t0 = performance.now();
    const tick = () => {
      if (!halo.parent) return; // 已被销毁，自动停止
      const t   = (performance.now() - t0) / 1000;
      const osc = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.4);
      halo.material.opacity = 0.38 + osc * 0.42;
      const s = 1.0 + osc * 0.06;
      halo.scale.set(s, 1, s);
      this._haloAnimHandle = requestAnimationFrame(tick);
    };
    this._haloAnimHandle = requestAnimationFrame(tick);
  }

  _notify() {
    this._onChangeCbs.forEach(cb => cb(this._entries, this._active));
  }
}