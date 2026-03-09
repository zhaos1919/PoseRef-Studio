/**
 * @file PosePanel.js
 * @module ui/PosePanel
 * @description
 * 姿态控制面板（Phase III）
 *
 * 职责：
 *   1. 动态生成关节滑动条（Slider），无需手写 HTML
 *   2. Slider ↔ PoseManager 双向绑定
 *   3. 渲染预置姿态按钮，点击后触发带缓动的姿态过渡
 *   4. 所有样式通过 panel.css 中的 CSS 变量控制，符合 Apple 视觉规范
 */

import { POSE_PANEL_GROUPS, POSE_PRESETS } from '../pose/PoseManager.js';

// 轴向的中文标签
const AXIS_LABELS = { x: '俯仰', y: '偏航', z: '横滚' };
// 轴向对应颜色（细节感）
const AXIS_COLORS = { x: '#ff6b6b', y: '#51cf66', z: '#339af0' };

export class PosePanel {
  /**
   * @param {HTMLElement}  container  - 面板挂载的 DOM 节点
   * @param {PoseManager}  poseManager
   */
  constructor(container, poseManager) {
    this._container   = container;
    this._pose        = poseManager;
    /** @type {Map<string, HTMLInputElement>} "jointKey_axis" → input 元素 */
    this._sliders     = new Map();
    this._isBuilt     = false;
  }

  /**
   * 构建面板 DOM（在模型加载完成后调用）
   */
  build() {
    if (this._isBuilt) return;
    this._isBuilt = true;

    // 清空占位符
    this._container.innerHTML = '';

    // ── 分组渲染 Slider ───────────────────────────────────────────
    for (const group of POSE_PANEL_GROUPS) {
      // 检查该分组是否有已映射的骨骼
      const mappedJoints = group.joints.filter(
        j => this._pose.boneMap.has(j.key)
      );
      if (mappedJoints.length === 0) continue;

      const groupEl = this._createGroup(group.label);

      for (const joint of mappedJoints) {
        for (const axis of joint.axes) {
          const [min, max] = this._pose.getConstraint(joint.key, axis);
          const current    = this._pose.getJointRotation(joint.key, axis);
          const sliderEl   = this._createSlider({
            jointKey: joint.key,
            jointLabel: joint.label,
            axis,
            min,
            max,
            value: current,
          });
          groupEl.appendChild(sliderEl);
        }
      }

      this._container.appendChild(groupEl);
    }

    // ── 预置姿态按钮 ──────────────────────────────────────────────
    const presetsEl = this._createPresetsSection();
    this._container.appendChild(presetsEl);

    // ── 重置按钮 ──────────────────────────────────────────────────
    const resetEl = this._createResetSection();
    this._container.appendChild(resetEl);

    console.info('[PosePanel] 面板构建完成');
  }

  /**
   * 从外部同步所有 Slider 到当前姿态值（如切换预置后刷新 UI）
   */
  syncToModel() {
    for (const [key, input] of this._sliders) {
      const [jointKey, axis] = key.split('_');
      const val = this._pose.getJointRotation(jointKey, axis);
      input.value = val;
      this._updateSliderFill(input, val);
      // 更新数值显示
      const display = input.closest('.slider-row')?.querySelector('.slider-value');
      if (display) display.textContent = Math.round(val) + '°';
    }
  }

  // ── 私有构建方法 ─────────────────────────────────────────────────

  /**
   * 创建一个折叠分组容器
   * @private
   */
  _createGroup(label) {
    const wrap = document.createElement('div');
    wrap.className = 'pose-group';

    const header = document.createElement('button');
    header.className = 'pose-group__header';
    header.innerHTML = `
      <span class="pose-group__label">${label}</span>
      <svg class="pose-group__arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    const body = document.createElement('div');
    body.className = 'pose-group__body';

    // 折叠逻辑
    let collapsed = false;
    header.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.maxHeight  = collapsed ? '0'         : body.scrollHeight + 'px';
      body.style.opacity    = collapsed ? '0'         : '1';
      header.classList.toggle('pose-group__header--collapsed', collapsed);
    });

    wrap.appendChild(header);
    wrap.appendChild(body);
    return { el: wrap, body };
  }

  /**
   * @private
   */
  _createGroup(label) {
    const wrap = document.createElement('div');
    wrap.className = 'pose-group';

    const header = document.createElement('button');
    header.className = 'pose-group__header';
    header.innerHTML = `
      <span class="pose-group__label">${label}</span>
      <svg class="pose-group__arrow" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    const body = document.createElement('div');
    body.className = 'pose-group__body';

    // 点击头部折叠 / 展开
    header.addEventListener('click', () => {
      const isCollapsed = body.classList.toggle('pose-group__body--collapsed');
      header.classList.toggle('pose-group__header--collapsed', isCollapsed);
    });

    wrap.append(header, body);

    // 返回 body 节点（用于追加 Slider）
    wrap.appendChild = (child) => body.appendChild(child);
    return wrap;
  }

  /**
   * 创建单个 Slider 行
   * @private
   */
  _createSlider({ jointKey, jointLabel, axis, min, max, value }) {
    const row = document.createElement('div');
    row.className = 'slider-row';

    // 标签：关节名 + 轴向
    const labelEl = document.createElement('div');
    labelEl.className = 'slider-label';
    labelEl.innerHTML = `
      <span class="slider-label__joint">${jointLabel}</span>
      <span class="slider-label__axis" style="color:${AXIS_COLORS[axis]}">${AXIS_LABELS[axis]}</span>`;

    // Slider 容器（轨道 + 填充 + input）
    const track = document.createElement('div');
    track.className = 'slider-track';

    const fill = document.createElement('div');
    fill.className = 'slider-fill';

    const input = document.createElement('input');
    input.type      = 'range';
    input.className = 'slider-input';
    input.min       = min;
    input.max       = max;
    input.step      = 0.5;
    input.value     = value;

    // 数值显示
    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = Math.round(value) + '°';

    // 初始化填充比例
    this._updateSliderFill(input, value, fill, min, max);

    // 事件：input 事件实时驱动骨骼
    input.addEventListener('input', () => {
      const deg = parseFloat(input.value);
      this._pose.setJointRotation(jointKey, axis, deg);
      this._updateSliderFill(input, deg, fill, min, max);
      valueEl.textContent = Math.round(deg) + '°';
    });

    track.append(fill, input);

    const controls = document.createElement('div');
    controls.className = 'slider-controls';
    controls.append(track, valueEl);

    row.append(labelEl, controls);

    // 注册到映射
    this._sliders.set(`${jointKey}_${axis}`, input);
    // 保存 fill 引用
    input._fill = fill;
    input._min  = min;
    input._max  = max;

    return row;
  }

  /**
   * 创建预置姿态按钮区域
   * @private
   */
  _createPresetsSection() {
    const section = document.createElement('div');
    section.className = 'pose-presets';

    const title = document.createElement('div');
    title.className = 'pose-presets__title';
    title.textContent = '快速预置';
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'pose-presets__grid';

    for (const [key, preset] of Object.entries(POSE_PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.innerHTML = `
        <span class="preset-btn__icon">${preset.icon}</span>
        <span class="preset-btn__label">${preset.label}</span>`;

      btn.addEventListener('click', () => {
        // 按钮激活态
        grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
        btn.classList.add('preset-btn--active');

        this._pose.applyPreset(key, 550, () => {
          // 过渡完成后同步所有 Slider
          this.syncToModel();
        });
      });

      grid.appendChild(btn);
    }

    section.appendChild(grid);
    return section;
  }

  /**
   * 创建重置按钮
   * @private
   */
  _createResetSection() {
    const wrap = document.createElement('div');
    wrap.className = 'pose-reset-wrap';

    const btn = document.createElement('button');
    btn.className   = 'pose-reset-btn';
    btn.textContent = '重置所有关节';

    btn.addEventListener('click', () => {
      btn.classList.add('pose-reset-btn--loading');
      // resetToInitial 接受 onDone 回调，动画结束后精准同步 UI
      this._pose.resetToInitial(400, () => {
        this.syncToModel();
        btn.classList.remove('pose-reset-btn--loading');
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
      });
    });

    wrap.appendChild(btn);
    return wrap;
  }

  /**
   * 更新 Slider 填充条宽度
   * @private
   */
  _updateSliderFill(input, value, fillEl, min, max) {
    const f   = fillEl   ?? input._fill;
    const mn  = min      ?? input._min  ?? parseFloat(input.min);
    const mx  = max      ?? input._max  ?? parseFloat(input.max);
    if (!f) return;
    const pct = ((value - mn) / (mx - mn)) * 100;
    f.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}