/**
 * @file MobileController.js
 * @description 移动端 Bottom Sheet + 触摸交互控制器
 *
 * 功能：
 *  1. 检测移动端，动态构建 Bottom Sheet DOM
 *  2. 将左侧面板的三个 Tab 内容克隆到 Sheet 内
 *  3. 处理展开/收起动画
 *  4. OrbitControls 与 Sheet 滑动冲突解决
 *  5. 双指缩放 / 三指平移 透传给 Three.js
 *
 * 使用：
 *  import { MobileController } from './ui/MobileController.js';
 *  // 在 OrbitControls 初始化后：
 *  const mobile = new MobileController(orbitControls);
 */

export class MobileController {
  /**
   * @param {import('three/examples/jsm/controls/OrbitControls').OrbitControls} orbitControls
   */
  constructor(orbitControls) {
    this._controls = orbitControls;
    this._isMobile = window.matchMedia('(max-width: 768px)').matches;
    this._sheet    = null;
    this._collapsed = false;

    // 响应式监听
    this._mq = window.matchMedia('(max-width: 768px)');
    this._mq.addEventListener('change', (e) => {
      if (e.matches) {
        this._setup();
      } else {
        this._teardown();
      }
    });

    if (this._isMobile) {
      // 延迟到 DOM 和面板全部渲染后再初始化
      requestAnimationFrame(() => this._setup());
    }
  }

  /* ─────────────────────────────────────────
     初始化：构建 Sheet DOM
  ───────────────────────────────────────── */
  _setup() {
    if (document.getElementById('mobile-bottom-sheet')) return;

    // 构建 Bottom Sheet 骨架
    const sheet = document.createElement('div');
    sheet.id = 'mobile-bottom-sheet';
    sheet.setAttribute('role', 'complementary');
    sheet.setAttribute('aria-label', '控制面板');

    sheet.innerHTML = `
      <!-- 拖拽手柄 -->
      <div id="sheet-handle-bar" role="button" aria-label="收起或展开面板" tabindex="0">
        <button id="sheet-toggle-btn" aria-label="切换面板" type="button">
          <svg class="sheet-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 8L6 4L10 8" stroke="rgba(0,0,0,0.45)" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- 标签页选择器 -->
      <div id="sheet-header">
        <div id="sheet-tabs" role="tablist">
          <button class="sheet-tab-btn sheet-tab-btn--active" data-sheet-tab="pose" role="tab" aria-selected="true">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="3" r="1.8" stroke="currentColor" stroke-width="1.2"/>
              <path d="M3 13v-4a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            姿态
          </button>
          <button class="sheet-tab-btn" data-sheet-tab="lighting" role="tab" aria-selected="false">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            光照
          </button>
          <button class="sheet-tab-btn" data-sheet-tab="material" role="tab" aria-selected="false">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="5.5" cy="5.5" r="1.2" fill="currentColor" opacity="0.5"/>
            </svg>
            材质
          </button>
          <button class="sheet-tab-btn" data-sheet-tab="camera" role="tab" aria-selected="false">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="7" cy="7.5" r="2" stroke="currentColor" stroke-width="1.1"/>
            </svg>
            视角
          </button>
        </div>
      </div>

      <!-- 内容区（滚动） -->
      <div id="sheet-content">
        <!-- 姿态 -->
        <div class="sheet-pane sheet-pane--active" id="sheet-pane-pose"></div>
        <!-- 光照 -->
        <div class="sheet-pane" id="sheet-pane-lighting"></div>
        <!-- 材质 -->
        <div class="sheet-pane" id="sheet-pane-material"></div>
        <!-- 视角 + 素描 -->
        <div class="sheet-pane" id="sheet-pane-camera"></div>
      </div>
    `;

    document.getElementById('app').appendChild(sheet);
    this._sheet = sheet;

    // 同步面板内容到 Sheet
    this._syncContent();

    // 绑定事件
    this._bindToggle();
    this._bindSheetTabs();
    this._bindTouchConflict();
    this._bindOrbitConflict();

    // 监听面板内容变化（JS 动态注入后同步）
    this._observePanelMutations();
  }

  /* ─────────────────────────────────────────
     销毁（桌面端切回时）
  ───────────────────────────────────────── */
  _teardown() {
    const sheet = document.getElementById('mobile-bottom-sheet');
    if (sheet) sheet.remove();
    this._sheet = null;
    // 恢复桌面端面板可见
    const panelLeft = document.querySelector('.panel--left');
    if (panelLeft) {
      panelLeft.style.transform = '';
      panelLeft.style.opacity   = '';
      panelLeft.style.pointerEvents = '';
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  /* ─────────────────────────────────────────
     将桌面面板内容同步/镜像到 Sheet
     使用 MutationObserver 保证 JS 动态注入后也能同步
  ───────────────────────────────────────── */
  _syncContent() {
    const mapping = {
      'pose':     ['#tab-pose',      '#sheet-pane-pose'],
      'lighting': ['#tab-lighting',  '#sheet-pane-lighting'],
      'material': ['#tab-material',  '#sheet-pane-material'],
    };

    for (const [, [srcSel, dstSel]] of Object.entries(mapping)) {
      const src = document.querySelector(srcSel);
      const dst = document.querySelector(dstSel);
      if (src && dst) {
        // 使用 innerHTML 镜像（深拷贝但不复制事件）
        // 改用直接移动子节点的引用，保留事件监听
        dst.innerHTML = '';
        dst.appendChild(src.cloneNode(true));
        // 注：cloneNode 不复制事件，需要 JS 用事件委托方式绑定
        // 实际上姿态 slider 的 input 事件在 PosePanel 里是直接监听 input 元素的
        // 所以我们改用「共享同一个 DOM 节点」策略 —— 见下方 _mirrorNode
      }
    }

    // 视角预设 + 素描 → camera pane
    const cameraPaneEl = document.getElementById('sheet-pane-camera');
    if (cameraPaneEl) {
      cameraPaneEl.innerHTML = '';

      // 克隆视角按钮
      const camGrid = document.getElementById('camera-preset-bar');
      if (camGrid) cameraPaneEl.appendChild(camGrid.cloneNode(true));

      // 克隆素描明度开关
      const valueCheckRow = document.getElementById('value-check-row');
      if (valueCheckRow) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 4px 16px 8px;';
        wrapper.appendChild(valueCheckRow.cloneNode(true));
        cameraPaneEl.appendChild(wrapper);
      }
    }
  }

  /**
   * 「真正镜像」：把原始面板容器的 DOM 节点直接挂到 Sheet 里
   * 这样事件监听完全保留，JS 注入的内容也会实时反映
   * 代价：桌面端 #tab-pose 的节点被移走（但已被 CSS 隐藏，无影响）
   *
   * 调用时机：模型加载完成，PosePanel/LightingPanel 已注入 DOM 后
   */
  mirrorLivePanels() {
    if (!this._isMobile && !this._sheet) return;

    const mapping = [
      ['#pose-controls-container',      '#sheet-pane-pose'],
      ['#lighting-controls-container',  '#sheet-pane-lighting'],
      ['#material-controls-container',  '#sheet-pane-material'],
    ];

    for (const [srcSel, dstSel] of mapping) {
      const src = document.querySelector(srcSel);
      const dst = document.querySelector(dstSel);
      if (src && dst) {
        dst.innerHTML = '';
        // 直接 move（保留所有事件监听器）
        dst.appendChild(src);
      }
    }

    // 相机预设也迁移
    const camGrid    = document.getElementById('camera-preset-bar');
    const cameraDst  = document.getElementById('sheet-pane-camera');
    if (camGrid && cameraDst) {
      cameraDst.innerHTML = '';
      cameraDst.appendChild(camGrid);

      const valueRow = document.getElementById('value-check-row');
      if (valueRow) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding: 4px 16px 12px;';
        wrap.appendChild(valueRow);
        cameraDst.appendChild(wrap);
      }
    }
  }

  /* ─────────────────────────────────────────
     收起 / 展开 逻辑
  ───────────────────────────────────────── */
  _bindToggle() {
    const handleBar  = document.getElementById('sheet-handle-bar');
    const toggleBtn  = document.getElementById('sheet-toggle-btn');
    if (!handleBar || !toggleBtn) return;

    const toggle = () => {
      this._collapsed = !this._collapsed;
      this._sheet.classList.toggle('sheet--collapsed', this._collapsed);
      toggleBtn.setAttribute('aria-label', this._collapsed ? '展开面板' : '收起面板');
    };

    handleBar.addEventListener('click', toggle);
    handleBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  /* ─────────────────────────────────────────
     Sheet 内 Tab 切换
  ───────────────────────────────────────── */
  _bindSheetTabs() {
    const tabsContainer = document.getElementById('sheet-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.sheet-tab-btn');
      if (!btn) return;

      const tabName = btn.dataset.sheetTab;

      // 激活 tab 按钮
      tabsContainer.querySelectorAll('.sheet-tab-btn').forEach(b => {
        b.classList.toggle('sheet-tab-btn--active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      // 激活对应 pane
      document.querySelectorAll('.sheet-pane').forEach(p => {
        p.classList.toggle('sheet-pane--active', p.id === `sheet-pane-${tabName}`);
      });

      // 如果 sheet 处于收起状态，展开
      if (this._collapsed) {
        this._collapsed = false;
        this._sheet.classList.remove('sheet--collapsed');
      }
    });
  }

  /* ─────────────────────────────────────────
     阻止 Sheet 内滑动穿透到 Canvas / OrbitControls
  ───────────────────────────────────────── */
  _bindTouchConflict() {
    const sheet = this._sheet;
    if (!sheet) return;

    // Sheet 内的 touch 事件不传递到 canvas
    sheet.addEventListener('touchstart', (e) => {
      // 手柄区域：允许 touchstart 继续（用于拖拽手势判断）
      if (e.target.closest('#sheet-handle-bar')) return;
      e.stopImmediatePropagation();
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (e.target.closest('#sheet-handle-bar')) return;
      e.stopImmediatePropagation();
    }, { passive: true });

    // Slider 的横向滑动：只允许 pan-x，阻止触发 sheet 的纵向滚动
    sheet.querySelectorAll('.slider-input').forEach(input => {
      input.style.touchAction = 'pan-x';
    });
  }

  /* ─────────────────────────────────────────
     OrbitControls：移动端手势配置
     - 单指：旋转
     - 双指：缩放（pinch）
     - 三指：平移
  ───────────────────────────────────────── */
  _bindOrbitConflict() {
    const ctrl = this._controls;
    if (!ctrl) return;

    // Three.js OrbitControls 触摸映射：
    // ONE   = 旋转, TWO = 缩放+平移
    // 单独设置 touches 属性（OrbitControls r128+ API）
    if (ctrl.touches) {
      ctrl.touches = {
        ONE:   THREE_TOUCH_ROTATE,   // 1 指旋转
        TWO:   THREE_TOUCH_DOLLY_PAN // 2 指缩放+平移
      };
    }

    // 防止 Canvas 上的 touchmove 触发页面滚动
    const canvas = document.querySelector('#canvas-container canvas');
    if (canvas) {
      canvas.addEventListener('touchmove', (e) => {
        // 在 sheet 之外区域才传递给 OrbitControls
        e.preventDefault();
      }, { passive: false });
    }
  }

  /* ─────────────────────────────────────────
     MutationObserver：监听面板 DOM 变化，自动同步
  ───────────────────────────────────────── */
  _observePanelMutations() {
    const targets = [
      document.getElementById('pose-controls-container'),
      document.getElementById('lighting-controls-container'),
      document.getElementById('material-controls-container'),
    ].filter(Boolean);

    if (!targets.length) return;

    this._observer = new MutationObserver(() => {
      // 面板内容变化后，重新镜像
      this.mirrorLivePanels();
    });

    targets.forEach(el => {
      this._observer.observe(el, { childList: true, subtree: false });
    });
  }

  /* ─────────────────────────────────────────
     公开 API：模型加载完毕后由 main.js 调用
  ───────────────────────────────────────── */
  onModelLoaded() {
    if (this._isMobile) {
      // 给 PosePanel/LightingPanel 一帧时间完成 DOM 注入
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.mirrorLivePanels());
      });
    }
  }

  get isMobile() {
    return this._isMobile;
  }
}

// OrbitControls 触摸常量（Three.js 内部值）
const THREE_TOUCH_ROTATE    = 0;
const THREE_TOUCH_DOLLY_PAN = 2;