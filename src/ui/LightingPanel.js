import * as THREE from 'three';
/**
 * @file LightingPanel.js
 * @module ui/LightingPanel
 * @description
 * Phase V — Apple 风格光照控制面板（增加色彩控制）
 *
 * 组件：
 *   1. 光源方向旋转器（极坐标圆形拖拽 UI）
 *   2. 光强 Slider（与 PosePanel 样式统一）
 *   3. 色温 Slider（冷↔暖，带渐变轨道）
 *   4. PBR 材质参数：金属度 / 粗糙度 / 环境反射强度
 *   5. 快速布光预设按钮
 *   6. 画布背景颜色切换（预设色块 + 自定义拾色器）[NEW]
 *   7. 三点光源独立颜色调节（极简圆形色块 + 自定义拾色器）[NEW]
 */

import { LightingSystem } from '../scene/LightingSystem.js';

// ── 背景颜色预设 ─────────────────────────────────────────────────
const BG_PRESETS = [
  { hex: '#ffffff', title: '纯白' },
  { hex: '#e8e8ea', title: '浅灰' },
  { hex: '#888890', title: '中灰' },
  { hex: '#3a3a3c', title: '深灰' },
  { hex: '#000000', title: '纯黑' },
  { hex: '#0e0e14', title: '深夜（默认）' },
  { hex: '#2a1f14', title: '暖棕环境' },
  { hex: '#0a0a1e', title: '赛博蓝黑' },
];

// ── 光源颜色预设 ─────────────────────────────────────────────────
const LIGHT_COLOR_PRESETS = {
  key:  [
    { hex: '#fff5e8', title: '暖白（默认）' },
    { hex: '#ffffff', title: '纯白' },
    { hex: '#ffe4b3', title: '钨灯黄' },
    { hex: '#ffd700', title: '金光' },
    { hex: '#ff6040', title: '火红' },
    { hex: '#40c8ff', title: '冷蓝' },
  ],
  fill: [
    { hex: '#c8d8ff', title: '冷蓝（默认）' },
    { hex: '#ffffff', title: '纯白' },
    { hex: '#d0f0ff', title: '天蓝' },
    { hex: '#b0ffd0', title: '薄荷绿' },
    { hex: '#ffd0e8', title: '玫瑰粉' },
    { hex: '#e8c8ff', title: '薰衣草' },
  ],
  back: [
    { hex: '#8899ff', title: '蓝紫（默认）' },
    { hex: '#ffffff', title: '纯白' },
    { hex: '#ff88ff', title: '霓虹紫' },
    { hex: '#00ffcc', title: '赛博青' },
    { hex: '#ff4488', title: '洋红' },
    { hex: '#ffaa00', title: '琥珀' },
  ],
};

// ── 色温映射（Kelvin → RGB 近似）─────────────────────────────────
// 简化表：2700K(暖白) → 5500K(日光) → 9000K(冷蓝)
const TEMP_PRESETS = [
  { k: 2700, color: 0xffb347 },  // 烛光
  { k: 3200, color: 0xffd280 },  // 钨灯
  { k: 4200, color: 0xffe8b8 },  // 暖白
  { k: 5500, color: 0xfff8f0 },  // 日光（默认）
  { k: 6500, color: 0xf0f4ff },  // 阴天
  { k: 8000, color: 0xd0e0ff },  // 晴天蓝天
  { k: 9000, color: 0xb8ccff },  // 冷蓝
];

// 布光方案预设
const LIGHTING_PRESETS = {
  studio: {
    label: '摄影棚',
    icon: '🎬',
    key:  { azimuth: 45,  elevation: 65, intensity: 2.2 },
    fill: { azimuth: -110, elevation: 25, intensity: 0.8 },
    back: { azimuth: 170,  elevation: 40, intensity: 1.0 },
  },
  dramatic: {
    label: '戏剧',
    icon: '🎭',
    key:  { azimuth: 20,  elevation: 75, intensity: 3.0 },
    fill: { azimuth: -90,  elevation: 10, intensity: 0.2 },
    back: { azimuth: 160,  elevation: 30, intensity: 1.4 },
  },
  soft: {
    label: '柔光',
    icon: '☁️',
    key:  { azimuth: 30,  elevation: 50, intensity: 1.5 },
    fill: { azimuth: -60,  elevation: 40, intensity: 1.2 },
    back: { azimuth: 150,  elevation: 50, intensity: 0.8 },
  },
  backlit: {
    label: '逆光',
    icon: '🌅',
    key:  { azimuth: 180, elevation: 30, intensity: 2.8 },
    fill: { azimuth: 0,   elevation: 20, intensity: 0.4 },
    back: { azimuth: 90,  elevation: 60, intensity: 0.6 },
  },
};

export class LightingPanel {
  /**
   * @param {HTMLElement}    container     - 面板挂载节点
   * @param {LightingSystem} lightingSystem
   * @param {THREE.Object3D} [modelRoot]   - 用于 PBR 材质调节
   * @param {Object}         [sceneManager] - 用于背景色控制
   */
  constructor(container, lightingSystem, modelRoot = null, sceneManager = null) {
    this._container    = container;
    this._ls           = lightingSystem;
    this._model        = modelRoot;
    this._sceneManager = sceneManager;
    this._built        = false;

    // 当前 PBR 参数
    this._pbr = { metalness: 0.1, roughness: 0.55, envMapIntensity: 1.0 };

    // 当前背景色（hex string）
    this._bgColor = '#0e0e14';

    // 每个光源当前颜色缓存（hex string）
    this._lightColors = {
      key:  '#fff5e8',
      fill: '#c8d8ff',
      back: '#8899ff',
    };
  }

  setModel(modelRoot) {
    this._model = modelRoot;
    this._ls.setMaterialProps(this._model, this._pbr);
  }

  setSceneManager(sceneManager) {
    this._sceneManager = sceneManager;
  }

  build() {
    if (this._built) return;
    this._built = true;
    this._container.innerHTML = '';

    // 0. 场景背景色
    this._container.appendChild(this._buildBgColorSection());

    // 1. 布光预设
    this._container.appendChild(this._buildPresets());

    // 2. 三点光源控制
    for (const key of ['key', 'fill', 'back']) {
      this._container.appendChild(this._buildLightControl(key));
    }

    console.info('[LightingPanel] 面板构建完成（含色彩控制模块）');
  }

  // ════════════════════════════════════════════════════════════════
  // 背景颜色区块
  // ════════════════════════════════════════════════════════════════

  _buildBgColorSection() {
    const section = document.createElement('div');
    section.className = 'lighting-section color-section';

    const title = document.createElement('div');
    title.className = 'lighting-section__title';
    title.textContent = '场景背景';
    section.appendChild(title);

    const row = document.createElement('div');
    row.className = 'color-picker-row';

    // 预设色块
    const swatches = document.createElement('div');
    swatches.className = 'color-swatches';

    BG_PRESETS.forEach(preset => {
      const dot = this._makeColorSwatch(preset.hex, preset.title, (hex) => {
        this._bgColor = hex;
        this._applyBgColor(hex);
        swatches.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('color-swatch--active', s.dataset.hex === hex)
        );
        // 同步自定义拾色器预览
        const pickerPreview = row.querySelector('.custom-picker__preview');
        if (pickerPreview) pickerPreview.style.background = hex;
      });
      dot.dataset.hex = preset.hex;
      if (preset.hex === this._bgColor) dot.classList.add('color-swatch--active');
      swatches.appendChild(dot);
    });

    row.appendChild(swatches);

    // 自定义拾色器
    const customPicker = this._makeCustomPicker(this._bgColor, (hex) => {
      this._bgColor = hex;
      this._applyBgColor(hex);
      swatches.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.remove('color-swatch--active')
      );
    });
    row.appendChild(customPicker);
    section.appendChild(row);
    return section;
  }

  _applyBgColor(hex) {
    if (this._sceneManager && typeof this._sceneManager.setBackgroundColor === 'function') {
      this._sceneManager.setBackgroundColor(hex);
    } else {
      // Fallback：直接操作场景
      const scene = this._ls._scene;
      if (scene) {
        const c = new THREE.Color(hex);
        scene.background = c;
        if (scene.fog) scene.fog.color.copy(c);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 通用色彩 UI 组件
  // ════════════════════════════════════════════════════════════════

  /**
   * 创建圆形色块按钮
   */
  _makeColorSwatch(hex, title, onChange) {
    const dot = document.createElement('button');
    dot.className = 'color-swatch';
    dot.title = title;
    dot.setAttribute('aria-label', title);

    const inner = document.createElement('span');
    inner.className = 'color-swatch__inner';
    inner.style.background = hex;
    dot.appendChild(inner);

    dot.addEventListener('click', () => onChange(hex));
    return dot;
  }

  /**
   * 创建美化后的自定义拾色器入口
   * 外壳为圆形色块（带 "+" 图标），点击时呼出隐藏的 <input type="color">
   */
  _makeCustomPicker(initHex, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'custom-picker';
    wrap.title = '自定义颜色';

    const preview = document.createElement('span');
    preview.className = 'custom-picker__preview';
    preview.style.background = initHex;
    preview.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" class="custom-picker__icon">
      <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    wrap.appendChild(preview);

    // 隐藏的原生 color input（CSS opacity:0 + 绝对定位）
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'custom-picker__input';
    input.value = (initHex && initHex.length === 7) ? initHex : '#888888';
    wrap.appendChild(input);

    preview.addEventListener('click', () => input.click());

    input.addEventListener('input', () => {
      const hex = input.value;
      preview.style.background = hex;
      onChange(hex);
    });

    return wrap;
  }

  _buildPresets() {
    const wrap = document.createElement('div');
    wrap.className = 'lighting-section';

    const title = document.createElement('div');
    title.className = 'lighting-section__title';
    title.textContent = '布光方案';
    wrap.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'lighting-presets-grid';

    for (const [key, preset] of Object.entries(LIGHTING_PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.innerHTML = `<span class="preset-btn__icon">${preset.icon}</span>
                       <span class="preset-btn__label">${preset.label}</span>`;
      btn.addEventListener('click', () => {
        // 应用预设
        for (const lk of ['key', 'fill', 'back']) {
          const p = preset[lk];
          this._ls.setLightPolar(lk, p.azimuth, p.elevation);
          this._ls.setLightIntensity(lk, p.intensity);
        }
        // 同步所有 Slider
        this._syncSlidersFromState();
        // 激活态
        grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
        btn.classList.add('preset-btn--active');
      });
      grid.appendChild(btn);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  _buildLightControl(lightKey) {
    const LABELS = { key: '主光 Key', fill: '补光 Fill', back: '背光 Back' };
    const state  = this._ls.getState()[lightKey];

    const section = document.createElement('div');
    section.className = 'lighting-section';
    section.dataset.lightKey = lightKey;

    // 标题行
    const header = document.createElement('div');
    header.className = 'lighting-section__header';
    header.innerHTML = `<span class="lighting-section__title">${LABELS[lightKey]}</span>`;
    section.appendChild(header);

    // ★ 光源颜色行（预设色块 + 拾色器）
    section.appendChild(this._buildLightColorRow(lightKey));

    // 极坐标旋转器
    const wheelWrap = document.createElement('div');
    wheelWrap.className = 'light-wheel-wrap';
    const wheel = this._buildLightWheel(lightKey, state.azimuth, state.elevation);
    wheelWrap.appendChild(wheel);
    section.appendChild(wheelWrap);

    // 仰角 Slider
    section.appendChild(this._buildSlider({
      label: '仰角',
      axis: 'elevation',
      lightKey,
      min: 5, max: 89, value: state.elevation,
      unit: '°',
      onInput: (v) => {
        const cur = this._ls.getState()[lightKey];
        this._ls.setLightPolar(lightKey, cur.azimuth, v);
        this._updateWheelDot(lightKey, this._ls.getState()[lightKey].azimuth, v);
      },
    }));

    // 光强 Slider
    section.appendChild(this._buildSlider({
      label: '光强',
      axis: 'intensity',
      lightKey,
      min: 0, max: 5, step: 0.05, value: state.intensity,
      unit: 'x',
      onInput: (v) => this._ls.setLightIntensity(lightKey, v),
    }));

    // 色温 Slider（仅主光）
    if (lightKey === 'key') {
      section.appendChild(this._buildColorTempSlider(lightKey));
    }

    return section;
  }

  /**
   * 光源颜色选择行（预设色块 + 自定义拾色器）
   */
  _buildLightColorRow(lightKey) {
    const row = document.createElement('div');
    row.className = 'color-picker-row color-picker-row--light';
    row.dataset.lightColorRow = lightKey;

    const presets = LIGHT_COLOR_PRESETS[lightKey] || [];
    const swatches = document.createElement('div');
    swatches.className = 'color-swatches color-swatches--sm';

    presets.forEach((preset, i) => {
      const dot = this._makeColorSwatch(preset.hex, preset.title, (hex) => {
        this._lightColors[lightKey] = hex;
        this._applyLightColor(lightKey, hex);
        swatches.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('color-swatch--active', s.dataset.hex === hex)
        );
        const pickerPreview = row.querySelector('.custom-picker__preview');
        if (pickerPreview) pickerPreview.style.background = hex;
      });
      dot.dataset.hex = preset.hex;
      if (i === 0) dot.classList.add('color-swatch--active');
      swatches.appendChild(dot);
    });

    row.appendChild(swatches);

    const customPicker = this._makeCustomPicker(this._lightColors[lightKey], (hex) => {
      this._lightColors[lightKey] = hex;
      this._applyLightColor(lightKey, hex);
      swatches.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.remove('color-swatch--active')
      );
    });
    row.appendChild(customPicker);

    return row;
  }

  _applyLightColor(lightKey, hex) {
    // sRGB hex → THREE.Color
    // Three.js Color.set(cssHex) 按 sRGB 解析，
    // 配合 renderer.outputColorSpace = THREE.SRGBColorSpace 可正确渲染
    const color = new THREE.Color(hex);
    this._ls.setLightColor(lightKey, color);
  }

  /**
   * 极坐标圆形旋转器（水平角拖拽）
   */
  _buildLightWheel(lightKey, azimuth, elevation) {
    const SIZE = 80;
    const R    = 32;

    const wrap = document.createElement('div');
    wrap.className = 'light-wheel';
    wrap.style.width = wrap.style.height = SIZE + 'px';
    wrap.dataset.lightKey = lightKey;

    // SVG 背景圆
    wrap.innerHTML = `
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" class="light-wheel__svg">
        <circle cx="${SIZE/2}" cy="${SIZE/2}" r="${R}" class="light-wheel__track"/>
        <line x1="${SIZE/2}" y1="${SIZE/2-R+4}" x2="${SIZE/2}" y2="${SIZE/2-R+10}"
              class="light-wheel__tick" transform="rotate(0,${SIZE/2},${SIZE/2})"/>
        <text x="${SIZE/2}" y="11" class="light-wheel__label-n">N</text>
        <text x="${SIZE-6}" y="${SIZE/2+4}" class="light-wheel__label-e">E</text>
        <circle cx="${SIZE/2}" cy="${SIZE/2}" r="3" class="light-wheel__center"/>
      </svg>
      <div class="light-wheel__dot" data-key="${lightKey}"></div>`;

    // 初始化 dot 位置
    this._positionWheelDot(wrap, azimuth, R, SIZE);

    // 拖拽事件
    this._attachWheelDrag(wrap, lightKey, R, SIZE);

    return wrap;
  }

  _positionWheelDot(wheelEl, azimuth, R, SIZE) {
    const dot = wheelEl.querySelector('.light-wheel__dot');
    if (!dot) return;
    const rad  = THREE.MathUtils.degToRad(azimuth);
    const cx   = SIZE / 2 + R * Math.sin(rad);
    const cy   = SIZE / 2 - R * Math.cos(rad);
    dot.style.left = (cx - 6) + 'px';
    dot.style.top  = (cy - 6) + 'px';
  }

  _updateWheelDot(lightKey, azimuth, _elevation) {
    const SIZE = 80, R = 32;
    const wheel = this._container.querySelector(`.light-wheel[data-light-key="${lightKey}"]`);
    if (wheel) this._positionWheelDot(wheel, azimuth, R, SIZE);
  }

  _attachWheelDrag(wheelEl, lightKey, R, SIZE) {
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const rect = wheelEl.getBoundingClientRect();
      const cx   = rect.left + SIZE / 2;
      const cy   = rect.top  + SIZE / 2;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx   = clientX - cx;
      const dy   = clientY - cy;
      // atan2 从正 Y 轴开始顺时针
      let azimuth = THREE.MathUtils.radToDeg(Math.atan2(dx, -dy));

      const curState = this._ls.getState()[lightKey];
      this._ls.setLightPolar(lightKey, azimuth, curState.elevation);
      this._positionWheelDot(wheelEl, azimuth, R, SIZE);

      // 同步仰角 Slider 旁边的水平角显示（通过 data-axis="azimuth"）
      const azEl = this._container.querySelector(
        `[data-light-key="${lightKey}"][data-axis="azimuth"] .slider-value`
      );
      if (azEl) azEl.textContent = Math.round(azimuth) + '°';
    };

    wheelEl.addEventListener('mousedown',  (e) => { dragging = true; onMove(e); });
    wheelEl.addEventListener('touchstart', (e) => { dragging = true; onMove(e); }, { passive: true });
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('touchmove',  onMove, { passive: true });
    document.addEventListener('mouseup',   () => { dragging = false; });
    document.addEventListener('touchend',  () => { dragging = false; });
  }

  /**
   * 色温滑条（带渐变轨道）
   */
  _buildColorTempSlider(lightKey) {
    const row = document.createElement('div');
    row.className = 'slider-row color-temp-row';

    const label = document.createElement('div');
    label.className = 'slider-label';
    label.innerHTML = `<span class="slider-label__joint">色温</span>
                       <span class="slider-label__axis" style="color:#ffb347">K</span>`;

    const track = document.createElement('div');
    track.className = 'slider-track color-temp-track';
    // 渐变轨道：暖→冷
    track.style.background = 'linear-gradient(to right, #ffb347, #fff8f0 40%, #d0e0ff)';
    track.style.borderRadius = '2px';
    track.style.height = '4px';

    const input = document.createElement('input');
    input.type  = 'range';
    input.className = 'slider-input';
    input.min   = 0;
    input.max   = TEMP_PRESETS.length - 1;
    input.step  = 0.01;
    input.value = 3; // 默认 5500K（日光）

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = '5500K';

    input.addEventListener('input', () => {
      const t   = parseFloat(input.value);
      const idx = Math.min(Math.floor(t), TEMP_PRESETS.length - 2);
      const frac = t - idx;
      const c0  = new THREE.Color(TEMP_PRESETS[idx].color);
      const c1  = new THREE.Color(TEMP_PRESETS[idx + 1].color);
      c0.lerp(c1, frac);
      this._ls.setLightColor(lightKey, c0);
      const kelvin = Math.round(
        TEMP_PRESETS[idx].k * (1 - frac) + TEMP_PRESETS[idx + 1].k * frac
      );
      valueEl.textContent = kelvin + 'K';

      // 同步颜色指示器（清除预设激活态，更新自定义拾色器预览色）
      const hex = '#' + c0.getHexString();
      this._lightColors[lightKey] = hex;
      const colorRow = this._container.querySelector(`[data-light-color-row="${lightKey}"]`);
      if (colorRow) {
        colorRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('color-swatch--active'));
        const preview = colorRow.querySelector('.custom-picker__preview');
        if (preview) preview.style.background = hex;
      }
    });

    track.appendChild(input);

    const controls = document.createElement('div');
    controls.className = 'slider-controls';
    controls.append(track, valueEl);
    row.append(label, controls);
    return row;
  }

  /**
   * 通用 Slider 构建
   */
  _buildSlider({ label, axis, lightKey, min, max, step = 0.5, value, unit = '', onInput }) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.dataset.lightKey = lightKey;
    row.dataset.axis     = axis;

    const labelEl = document.createElement('div');
    labelEl.className = 'slider-label';
    labelEl.innerHTML = `<span class="slider-label__joint">${label}</span>`;

    const track = document.createElement('div');
    track.className = 'slider-track';

    const fill = document.createElement('div');
    fill.className = 'slider-fill';

    const input = document.createElement('input');
    input.type  = 'range';
    input.className = 'slider-input';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = value;
    input._fill = fill;
    input._min  = min;
    input._max  = max;

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = (Number.isInteger(value) ? value : value.toFixed(1)) + unit;

    this._updateFill(fill, value, min, max);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      this._updateFill(fill, v, min, max);
      valueEl.textContent = (step < 1 ? v.toFixed(1) : Math.round(v)) + unit;
      onInput(v);
    });

    track.append(fill, input);
    const controls = document.createElement('div');
    controls.className = 'slider-controls';
    controls.append(track, valueEl);
    row.append(labelEl, controls);
    return row;
  }

  /**
   * PBR 材质参数区
   */
  _buildPBRSection() {
    const section = document.createElement('div');
    section.className = 'lighting-section';

    const title = document.createElement('div');
    title.className = 'lighting-section__title';
    title.textContent = 'PBR 材质';
    section.appendChild(title);

    const pbrSliders = [
      { label: '金属度', key: 'metalness',       min: 0, max: 1, step: 0.01, value: this._pbr.metalness,       unit: '' },
      { label: '粗糙度', key: 'roughness',        min: 0, max: 1, step: 0.01, value: this._pbr.roughness,        unit: '' },
      { label: '环境反射', key: 'envMapIntensity', min: 0, max: 3, step: 0.05, value: this._pbr.envMapIntensity, unit: 'x' },
    ];

    for (const s of pbrSliders) {
      section.appendChild(this._buildSlider({
        label: s.label,
        axis:  s.key,
        lightKey: 'pbr',
        min: s.min, max: s.max, step: s.step, value: s.value, unit: s.unit,
        onInput: (v) => {
          this._pbr[s.key] = v;
          this._ls.setMaterialProps(this._model, { [s.key]: v });
        },
      }));
    }

    return section;
  }

  /**
   * 同步所有 Slider 到当前光照状态（预设应用后刷新）
   */
  _syncSlidersFromState() {
    const state = this._ls.getState();
    for (const lightKey of ['key', 'fill', 'back']) {
      const s = state[lightKey];
      this._syncSlider(lightKey, 'elevation', s.elevation);
      this._syncSlider(lightKey, 'intensity', s.intensity);
      this._updateWheelDot(lightKey, s.azimuth, s.elevation);
    }
  }

  _syncSlider(lightKey, axis, value) {
    const row   = this._container.querySelector(`[data-light-key="${lightKey}"][data-axis="${axis}"]`);
    if (!row) return;
    const input = row.querySelector('.slider-input');
    const valEl = row.querySelector('.slider-value');
    const fill  = row.querySelector('.slider-fill');
    if (!input) return;
    input.value = value;
    if (fill) this._updateFill(fill, value, parseFloat(input.min), parseFloat(input.max));
    if (valEl) valEl.textContent = (axis === 'intensity'
      ? value.toFixed(1) + 'x'
      : Math.round(value) + '°');
  }

  _updateFill(fillEl, value, min, max) {
    const pct = ((value - min) / (max - min)) * 100;
    fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
}