/**
 * @file TransformSystem.js
 * @module scene/TransformSystem
 * @description
 * Phase VIII — 空间位移控制器（Raycaster 精选版重构）
 *
 * 核心修复 / 新增：
 *   1. [性能] 射线检测严格只在 click 事件触发（mousedown + mouseup 位移 < 4px 判定为点击），
 *      绝不放在 mousemove 或 requestAnimationFrame 中。
 *   2. [激活回调] 构造函数新增 onSelectEntry 参数，点击选中模型后立即触发，
 *      供 App 层执行 UI 双向同步（PosePanel / MaterialPanel）。
 *   3. [边界处理] 点击空白处时保持当前激活模型的 Gizmo，不取消选中（符合 DCC 工具惯例）。
 *      仅当用户按下 Escape 键时才取消选中。
 *   4. [防抖] 区分"点击"与"拖拽"：按下后若鼠标移动 >4px 则判定为旋转视角，不触发拾取。
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/** 判定为点击的最大位移阈值（像素） */
const CLICK_THRESHOLD_PX = 4;

export class TransformSystem {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera}        camera
   * @param {THREE.Scene}         scene
   * @param {OrbitControls}       orbitControls
   * @param {ModelManager}        modelManager
   * @param {Function}            [onSelectEntry]  - 选中新模型后的回调 (entry) => void
   *                                                 供 App 层执行 UI 同步
   */
  constructor(renderer, camera, scene, orbitControls, modelManager, onSelectEntry) {
    this._renderer      = renderer;
    this._camera        = camera;
    this._scene         = scene;
    this._orbit         = orbitControls;
    this._modelMgr      = modelManager;
    this._onSelectEntry = onSelectEntry ?? null;

    this._transformCtrl = null;
    this._raycaster     = new THREE.Raycaster();
    // 射线精度（对于 SkinnedMesh 调低阈值，提高选中灵敏度）
    this._raycaster.params.Line.threshold  = 0.05;
    this._raycaster.params.Points.threshold = 0.05;

    this._pointer     = new THREE.Vector2();
    this._enabled     = true;
    this._attached    = null; // 当前挂载的模型根

    // 用于区分"点击"与"拖拽旋转"的临时状态
    this._pointerDownPos = new THREE.Vector2();
    this._isDragging     = false;

    this._initTransformControls();
    this._initPointerPick();
    this._initEscapeKey();
  }

  // ── 公开 ─────────────────────────────────────────────────────────

  /** 启用 / 禁用整个系统 */
  setEnabled(v) {
    this._enabled = v;
    if (!v) this._detach();
  }

  /** 切换 translate / rotate 模式 */
  setMode(mode) {
    this._transformCtrl?.setMode(mode);
  }

  /** 外部强制附着到某个模型根（CharacterBar 点击标签时调用） */
  attachTo(root) {
    if (!root) { this._detach(); return; }
    this._transformCtrl.attach(root);
    this._attached = root;
  }

  dispose() {
    this._transformCtrl?.dispose();
    this._renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this._renderer.domElement.removeEventListener('pointerup',   this._onPointerUp);
    document.removeEventListener('keydown', this._onKeyDown);
    this._scene.remove(this._transformCtrl);
  }

  // ── 私有 ─────────────────────────────────────────────────────────

  _initTransformControls() {
    const tc = new TransformControls(this._camera, this._renderer.domElement);
    tc.setMode('translate');
    tc.showY = false;

    this._styleGizmo(tc);

    // 拖拽 Gizmo 时禁用 OrbitControls，防止事件冲突
    tc.addEventListener('dragging-changed', (e) => {
      this._orbit.enabled = !e.value;
    });

    // 拖拽开始时将被操控模型设为激活角色
    tc.addEventListener('mouseDown', () => {
      if (!this._attached) return;
      const entry = this._modelMgr.entries.find(e => e.root === this._attached);
      if (entry) {
        this._modelMgr.setActive(entry.id);
        // 注意：这里不触发 _onSelectEntry，因为 UI 通过 modelManager.onChange 已经处理
      }
    });

    this._scene.add(tc);
    this._transformCtrl = tc;
  }

  _styleGizmo(tc) {
    const applyStyle = () => {
      tc.traverse(obj => {
        if (!obj.isMesh && !obj.isLine) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (!m) return;
          if (m.opacity !== undefined) {
            m.transparent = true;
            if (m.opacity > 0.1) m.opacity = Math.min(m.opacity, 0.82);
          }
          if (obj.isLine && m.linewidth !== undefined) {
            m.linewidth = 1.5;
          }
        });
      });
    };
    requestAnimationFrame(applyStyle);
  }

  _initPointerPick() {
    // ── 方案：pointerdown 记录起点，pointerup 计算位移，判断是否为点击 ──
    // 好处：完全避免在 mousemove / rAF 中运行 Raycaster，性能最优。

    this._onPointerDown = (e) => {
      if (e.button !== 0) return;
      this._pointerDownPos.set(e.clientX, e.clientY);
      this._isDragging = false;
    };

    this._onPointerUp = (e) => {
      if (e.button !== 0) return;

      // 计算位移，过滤掉拖拽旋转操作
      const dx = e.clientX - this._pointerDownPos.x;
      const dy = e.clientY - this._pointerDownPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > CLICK_THRESHOLD_PX) return; // 是拖拽，不是点击
      if (!this._enabled) return;
      // 如果 TransformControls 正在被拖拽（Gizmo 操作），跳过
      if (this._transformCtrl.dragging) return;

      this._performRaycast(e);
    };

    this._renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    this._renderer.domElement.addEventListener('pointerup',   this._onPointerUp);
  }

  /**
   * 执行射线检测（仅在确认为"点击"后调用，不在热路径中运行）
   * @param {PointerEvent} e
   * @private
   */
  _performRaycast(e) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._pointer.set(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top) / rect.height) *  2 + 1,
    );

    this._raycaster.setFromCamera(this._pointer, this._camera);

    // 收集场景中所有模型的 Mesh
    const meshes = [];
    for (const entry of this._modelMgr.entries) {
      entry.root.traverse(n => { if (n.isMesh) meshes.push(n); });
    }

    const hits = this._raycaster.intersectObjects(meshes, false);

    if (hits.length === 0) {
      // ── 点击空白处：保持当前选中状态（不取消 Gizmo）──────────────
      // 这是 DCC 软件（Blender / Maya）的主流交互范式：
      // 点击空白 = 只是移动视角意图，不代表"想取消选中"。
      // 用户若想取消，可按 Escape 键。
      return;
    }

    // ── 找到命中 Mesh 所属的模型条目 ──────────────────────────────
    const hitMesh = hits[0].object;
    let targetEntry = null;

    for (const entry of this._modelMgr.entries) {
      let found = false;
      entry.root.traverse(n => { if (n === hitMesh) found = true; });
      if (found) { targetEntry = entry; break; }
    }

    if (!targetEntry) return;

    const isAlreadyActive = (this._modelMgr.activeEntry?.id === targetEntry.id);

    // 切换激活角色（ModelManager 内部会更新光环）
    this._modelMgr.setActive(targetEntry.id);

    // 附着 Gizmo
    this.attachTo(targetEntry.root);

    // ── [UI 同步] 通知 App 层刷新 PosePanel / MaterialPanel ────────
    // 仅在切换到不同模型时触发，避免无谓的 UI 重绘
    if (!isAlreadyActive && this._onSelectEntry) {
      this._onSelectEntry(targetEntry);
    }
  }

  /**
   * 监听 Escape 键 → 取消 Gizmo 附着
   * @private
   */
  _initEscapeKey() {
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this._detach();
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _detach() {
    this._transformCtrl?.detach();
    this._attached = null;
  }
}