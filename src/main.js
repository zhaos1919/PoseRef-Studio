/**
 * @file main.js
 * @description PoseRef — Phase VII 最终集成
 * 新增：MaterialPanel · ModelManager · TransformSystem · CharacterBar
 */

import { AreaLightSystem }      from './scene/AreaLightSystem.js';
import { AreaLightPanel }       from './ui/AreaLightPanel.js';
import { ProgressiveScheduler } from './core/ProgressiveScheduler.js';

import * as THREE             from 'three';
import { OrbitControls }      from 'three/examples/jsm/controls/OrbitControls.js';
import { Renderer }           from './core/Renderer.js';
import { Camera }             from './core/Camera.js';
import { PerformanceManager } from './core/PerformanceManager.js';
import { CameraRig, CAMERA_PRESETS } from './core/CameraRig.js';
import { SceneManager }       from './scene/SceneManager.js';
import { ValueCheckSystem }   from './scene/ValueCheckSystem.js';
import { ModelManager }       from './scene/ModelManager.js';
import { TransformSystem }    from './scene/TransformSystem.js';
import { UIController }       from './ui/UIController.js';
import { PosePanel }          from './ui/PosePanel.js';
import { LightingPanel }      from './ui/LightingPanel.js';
import { MaterialPanel }      from './ui/MaterialPanel.js';
import { CharacterBar }       from './ui/CharacterBar.js';
import { KeyboardController } from './scene/KeyboardController.js';
import { ZenMode }            from './ui/ZenMode.js';
import { PoseManager }        from './pose/PoseManager.js';
import { SnapshotManager }    from './utils/SnapshotManager.js';
import { PresetStore }        from './utils/PresetStore.js';
import { ViewportObserver }   from './utils/ViewportObserver.js';
import { eventBus }           from './utils/EventBus.js';

class App {
  constructor() {
    this._isRunning      = false;
    this._rafHandle      = null;
    this._clock          = null;
    this._controls       = null;
    this._poseManager    = null;
    this._posePanel      = null;
    this._lightingPanel  = null;
    this._materialPanel  = null;
    this._snapshot       = null;
    this._presetStore    = null;
    this._perfManager    = null;
    this._valueCheck     = null;
    this._camAnimator    = null;
    this._zenMode        = null;
    this._activePreset   = null;
    this._modelReady     = false;
    // Phase VII
    this._modelManager   = null;
    this._transformSys   = null;
    this._characterBar   = null;
    this._keyboardCtrl   = null;
  }

  async init() {
    console.group('[App] Phase VII 初始化');
    try {
      const container = document.getElementById('canvas-container');
      if (!container) throw new Error('找不到 #canvas-container');

      // ── UI ──────────────────────────────────────────────────────
      this._ui = new UIController();
      this._ui.setLoadingText('正在初始化渲染引擎', 'PoseRef · Phase VII');

      // ── 渲染器 ──────────────────────────────────────────────────
      this._renderer = new Renderer({ container, antialias: true });
      const isWebGL2 = this._renderer.instance.capabilities.isWebGL2;
      this._ui.setRendererInfo(isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0');

      // ── 相机 ────────────────────────────────────────────────────
      this._camera = new Camera({ fov: 50, position: { x: 0, y: 1.0, z: 4.2 } });

      // ── OrbitControls ───────────────────────────────────────────
      this._controls = new OrbitControls(this._camera.native, this._renderer.domElement);
      this._controls.target.set(0, 0.9, 0);
      this._controls.enableDamping  = true;
      this._controls.dampingFactor  = 0.06;
      this._controls.minDistance    = 0.8;
      this._controls.maxDistance    = 10;
      this._controls.maxPolarAngle  = Math.PI * 0.48;
      this._controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      this._controls.update();

      // ── 场景 ────────────────────────────────────────────────────
      this._sceneManager = new SceneManager(this._renderer.instance);
      this._clock = new THREE.Clock();

      // ── ModelManager（Phase VII）────────────────────────────────
      this._modelManager = new ModelManager(this._sceneManager.scene);

      // ── 性能管理 ────────────────────────────────────────────────
      this._perfManager = new PerformanceManager(
        this._renderer.instance,
        this._sceneManager.scene
      );
      const tier = this._perfManager.detectGPUTier();
      this._perfManager.applyQuality(tier);
      this._ui.setQualityBadge(tier);

      this._perfManager.onQualityChange((q) => {
        this._ui.setQualityBadge(q);
        const lights = Object.values(this._sceneManager.lightingSystem._lights);
        this._perfManager.applyShadowSettings(lights);
        this._ui.toast(`画质 → ${q === 'high' ? '高' : q === 'medium' ? '中' : '低'}`, 'info');
      });

      // ── 视口自适应 ───────────────────────────────────────────────
      this._viewportObserver = new ViewportObserver(container);
      eventBus.on('resize', this._onResize.bind(this));

      // ── OrbitControls 交互 → 渐进渲染信号 ───────────────────────
      this._controls.addEventListener('start', () => {
        this._perfManager.onInteractionStart();
        this._sceneManager.lightingSystem._markInteraction();
      });
      this._controls.addEventListener('end', () => {
        this._perfManager.onInteractionEnd((step, cfg) => {
          if (cfg.dpr) this._renderer.instance.setPixelRatio(cfg.dpr);
          if (cfg.shadowMapSize) {
            const lights = Object.values(this._sceneManager.lightingSystem._lights);
            for (const l of lights) {
              if (!l.castShadow) continue;
              l.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
              l.shadow.map?.dispose(); l.shadow.map = null;
            }
          }
        });
      });

      // ── 标签页 ───────────────────────────────────────────────────
      this._initTabs();

      // ── 工具栏 ───────────────────────────────────────────────────
      this._initToolbar();

      // ── 渲染循环启动 ─────────────────────────────────────────────
      this._isRunning = true;
      this._tick();

      // ── HDR 加载（异步，不阻塞模型）─────────────────────────────
      this._sceneManager.lightingSystem.loadHDR()
        .then(() => this._ui.toast('HDR 环境贴图就绪', 'success', 1800))
        .catch(() => this._ui.toast('HDR 加载失败，使用默认光照', 'warning', 2200));

      // ── 模型加载 ─────────────────────────────────────────────────
      this._ui.setLoadingText('正在加载人体模型', '首次加载约需 5~15 秒');
      await this._sceneManager.loadModel({
        onProgress: (pct) => {
          this._ui.updateLoadProgress(pct);
          if (pct > 0) this._ui.setLoadingText('正在加载模型…', `${pct}%`);
        },
        onComplete: ({ bones, animations }) => {
          this._ui.onModelLoaded({ bones, animations });

          this._camera.native.position.set(0, 1.0, 4.2);
          this._controls.target.set(0, 0.9, 0);
          this._controls.update();

          // ── 注册首个模型到 ModelManager ──────────────────────────
          this._modelManager.registerInitialModel(
            this._sceneManager._modelRoot,
            this._sceneManager.bones
          );

          // ── TransformSystem（Phase VII）──────────────────────────
          this._transformSys = new TransformSystem(
            this._renderer.instance,
            this._camera.native,
            this._sceneManager.scene,
            this._controls,
            this._modelManager
          );

          // ── ValueCheckSystem ──────────────────────────────────────
          this._valueCheck = new ValueCheckSystem(
            this._renderer.instance,
            this._sceneManager.scene,
            this._camera.native
          );
          this._initValueCheckToggle();

          // ── CameraRig ────────────────────────────────────────────
          this._camAnimator = new CameraRig(this._camera.native, this._controls);
          this._initCameraPresets();

          // ── Pose + Lighting + Material 面板 ──────────────────────
          this._initPoseSystem(bones);
          this._initLightingPanel();
          this._initMaterialPanel();

          // ── CharacterBar（Phase VII）─────────────────────────────
          this._characterBar = new CharacterBar(
            document.getElementById('character-bar'),
            this._modelManager,
            this._transformSys,
            (entry) => this._onActiveCharacterChange(entry)
          );

          // ModelManager 状态变更 → 同步 PosePanel / MaterialPanel
          this._modelManager.onChange((entries, active) => {
            if (active) this._onActiveCharacterChange(active);
          });

          // ── KeyboardController ───────────────────────────────────
          this._keyboardCtrl = new KeyboardController(this._modelManager, this._controls);

          // ── Snapshot + PresetStore ───────────────────────────────
          this._snapshot = new SnapshotManager(
            this._renderer.instance,
            this._sceneManager.scene,
            this._camera.native
          );
          this._presetStore = new PresetStore(
            this._poseManager,
            this._sceneManager.lightingSystem,
            this._modelManager   // Phase VIII：多角色支持
          );

          // ── ZenMode ──────────────────────────────────────────────
          this._zenMode = new ZenMode(
            () => this._doSnapshot(true),
            // onToggle：无论点击还是Z键，都同步按钮状态
            (isActive) => this._syncZenButton(isActive)
          );
          this._initZenButton();

          this._ui.setLoadingText('加载完成', '');
          this._ui.hideLoadingOverlay(600);
          this._ui.setRenderStatus('active');
          this._ui.toast(`GPU: ${tier === 'high' ? '高' : tier === 'medium' ? '中' : '低'}性能模式`, 'info', 2000);

          this._modelReady = true;

          setTimeout(() => {
            try {
              const raw = localStorage.getItem('poseref_last_preset');
              if (!raw) return;
              if (raw.includes('"x":null') || raw.includes('NaN') || raw.includes('Infinity')) {
                localStorage.removeItem('poseref_last_preset');
                return;
              }
              const data = JSON.parse(raw);
              if (!data?.version) { localStorage.removeItem('poseref_last_preset'); return; }
              const restored = this._presetStore.restoreFromStorage({
                posePanel: this._posePanel,
                lightingPanel: this._lightingPanel,
              });
              if (restored) this._ui.toast('已恢复上次配置', 'success', 2200);
            } catch(e) {
              console.warn('[App] 存档恢复失败，已清除:', e.message);
              localStorage.removeItem('poseref_last_preset');
            }
          }, 500);
        },
        onError: (err) => {
          console.error('[App]', err);
          this._ui.setLoadingText('模型加载失败', err.message);
          this._ui.setRenderStatus('error');
          this._ui.hideLoadingOverlay(2000);
          this._ui.toast('模型加载失败：' + err.message, 'error', 5000);
        },
      });

      console.info('[App] ✓ Phase VII 初始化完成');
      console.groupEnd();
    } catch (error) {
      console.groupEnd();
      this._handleFatalError(error);
    }
  }

  // ── 激活角色切换回调 ────────────────────────────────────────────
  _onActiveCharacterChange(entry) {
    if (!entry) return;
    // 更新 PosePanel 绑定的 PoseManager
    if (this._posePanel) {
      this._posePanel._pose = entry.poseManager;
      this._posePanel.syncToModel();
    }
    // 同步 MaterialPanel 显示
    if (this._materialPanel) {
      this._materialPanel.syncFromModel();
    }
  }

  // ── 素描明度模式 Toggle ─────────────────────────────────────────
  _initValueCheckToggle() {
    const checkbox = document.getElementById('value-check-toggle');
    if (!checkbox || !this._valueCheck) return;
    checkbox.addEventListener('change', () => {
      const on = checkbox.checked;
      this._valueCheck.setEnabled(on);
      this._ui.toast(on ? '素描明度模式已开启' : '素描明度模式已关闭', 'info', 1600);
    });
    document.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'v' || e.key === 'V') {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  }

  // ── 相机视角预设栏 ─────────────────────────────────────────────
  _initCameraPresets() {
    const bar = document.getElementById('camera-preset-bar');
    if (!bar || !this._camAnimator) return;
    for (const [key, preset] of Object.entries(CAMERA_PRESETS)) {
      const btn = document.createElement('button');
      btn.className   = 'cam-btn';
      btn.dataset.key = key;
      btn.title       = preset.label;
      btn.innerHTML   = `
        <div class="cam-btn__icon">${preset.icon}</div>
        <span class="cam-btn__label">${preset.label}</span>`;
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('cam-btn--active'));
        btn.classList.add('cam-btn--active');
        this._activePreset = key;

        this._camAnimator.flyTo(key, 680, () => {},this._modelManager?.activeRoot ?? null);
      });
      bar.appendChild(btn);
    }
    this._controls.addEventListener('start', () => {
      if (this._camAnimator?._active) return;
      bar.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('cam-btn--active'));
      this._activePreset = null;
    });
  }

  // ── 专注模式按钮 ──────────────────────────────────────────────────
  _initZenButton() {
    const btn = document.getElementById('zen-mode-btn');
    if (!btn || !this._zenMode) return;
    btn.addEventListener('click', () => this._zenMode.toggle());
    // click 后 ZenMode 内部会调用 onToggle → _syncZenButton，无需在这里重复处理
  }

  /** 统一的按钮状态同步（点击 或 Z 键 都走这里） */
  _syncZenButton(isActive) {
    const btn   = document.getElementById('zen-mode-btn');
    const label = document.getElementById('zen-btn-label');
    if (btn)   btn.classList.toggle('is-active', isActive);
    if (label) label.textContent = isActive ? '退出' : '专注';
    this._ui.toast(
      isActive ? '已进入专注模式 — Z 键退出' : '已退出专注模式',
      'info', 2000
    );
  }

  // ── 姿态系统 ──────────────────────────────────────────────────────
  _initPoseSystem(bones) {
    this._poseManager = new PoseManager(bones);
    if (this._poseManager.boneMap.size === 0) {
      document.getElementById('pose-controls-container').innerHTML =
        '<div style="padding:12px 16px"><p class="placeholder-text" style="color:var(--color-warning)">未识别到骨骼，请替换模型。</p></div>';
      return;
    }
    const container = document.getElementById('pose-controls-container');
    this._posePanel = new PosePanel(container, this._poseManager);
    this._posePanel.build();
  }

  // ── 光照面板 ──────────────────────────────────────────────────────
  _initLightingPanel() {
    const container = document.getElementById('lighting-controls-container');
    this._lightingPanel = new LightingPanel(
      container,
      this._sceneManager.lightingSystem,
      this._sceneManager._modelRoot,
      this._sceneManager
    );
    this._lightingPanel.build();
  }

  // ── 材质面板（Phase VII）─────────────────────────────────────────
  _initMaterialPanel() {
    const container = document.getElementById('material-controls-container');
    if (!container) return;
    this._materialPanel = new MaterialPanel(
      container,
      () => this._modelManager?.activeRoot ?? this._sceneManager._modelRoot
    );
    this._materialPanel.build();
  }

  // ── 工具栏 ────────────────────────────────────────────────────────
  _initToolbar() {
    document.getElementById('btn-snapshot')?.addEventListener('click', () => this._doSnapshot(false));
    document.getElementById('btn-export')?.addEventListener('click',   () => this._doExport());
    document.getElementById('btn-import')?.addEventListener('click',   () => this._doImport());
    document.getElementById('quality-badge')?.addEventListener('click', () => {
      const order = ['high', 'medium', 'low'];
      const cur   = order.indexOf(this._perfManager._currentQuality ?? 'high');
      const next  = order[(cur + 1) % order.length];
      this._perfManager.applyQuality(next);
      this._perfManager.applyShadowSettings(Object.values(this._sceneManager.lightingSystem._lights));
      this._ui.setQualityBadge(next);
    });
  }

  // ── 标签页 ────────────────────────────────────────────────────────
  _initTabs() {
    const tabBar = document.getElementById('panel-tab-bar');
    if (!tabBar) return;
    tabBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const tabName = btn.dataset.tab;
      tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
      btn.classList.add('tab-btn--active');
      document.querySelectorAll('.tab-pane').forEach(el => {
        el.classList.toggle('tab-pane--active', el.id === `tab-${tabName}`);
      });
    });
  }

  _doSnapshot(transparent = false) {
    if (!this._snapshot) { this._ui.toast('模型尚未加载', 'warning'); return; }
    this._ui.toast('截图中…', 'info', 1000);
    try {
      this._snapshot.capture({ transparent, scale: 2, onDone: () => this._ui.toast('截图已下载 ✓', 'success') });
    } catch (e) { this._ui.toast('截图失败：' + e.message, 'error'); }
  }

  _doExport() {
    if (!this._presetStore) { this._ui.toast('模型尚未加载', 'warning'); return; }
    try { this._presetStore.exportJSON(); this._ui.toast('配置已导出 ✓', 'success'); }
    catch (e) { this._ui.toast('导出失败：' + e.message, 'error'); }
  }

  async _doImport() {
    if (!this._presetStore) { this._ui.toast('模型尚未加载', 'warning'); return; }
    this._ui.toast('请选择配置文件…', 'info', 2000);
    const ok = await this._presetStore.importFromFile({
      posePanel:      this._posePanel,
      lightingPanel:  this._lightingPanel,
      onActiveChange: (entry) => this._onActiveCharacterChange(entry),
    });
    this._ui.toast(ok ? '配置已恢复 ✓' : '导入失败，请检查文件格式', ok ? 'success' : 'error');
  }

  // ── 渲染循环 ──────────────────────────────────────────────────────
  _tick() {
    if (!this._isRunning) return;
    this._rafHandle = requestAnimationFrame(this._tick.bind(this));
    const elapsed = this._clock.getElapsedTime();

    this._controls?.update();
    this._camAnimator?.update();
    this._keyboardCtrl?.update();
    this._sceneManager.update(elapsed);

    this._renderer.instance.render(this._sceneManager.native, this._camera.native);

    const fps = this._ui.updateFPS();
    if (fps > 0) this._perfManager?.tick();
    const pos = this._camera.native.position;
    this._ui.updateCoords(pos.x, pos.y, pos.z);
  }

  _onResize({ width, height }) {
    this._renderer.resize();
    this._camera.resize(width, height);
    this._valueCheck?.resize(width, height);
  }

  _handleFatalError(error) {
    console.error('[App] 致命错误:', error);
    try { this._ui?.setRenderStatus('error'); } catch(_) {}
    this._ui?.setLoadingText('初始化失败', error.message);
    this._ui?.toast('初始化失败：' + error.message, 'error', 0);
    this._isRunning = false;
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
  }

  destroy() {
    this._isRunning = false;
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
    this._controls?.dispose();
    this._viewportObserver?.dispose();
    this._valueCheck?.dispose();
    this._camAnimator?.dispose();
    this._zenMode?.dispose();
    this._keyboardCtrl?.dispose();
    this._transformSys?.dispose();
    this._sceneManager?.dispose();
    this._renderer?.dispose();
    this._perfManager?.dispose();
    eventBus.clearAll();
  }
}

const boot = () => {
  const app = new App();
  app.init();
  window.addEventListener('beforeunload', () => app.destroy());
  if (import.meta?.env?.MODE !== 'production') window.__poseRefApp = app;
};

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot)
  : boot();