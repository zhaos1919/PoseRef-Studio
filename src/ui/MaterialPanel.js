/**
 * @file MaterialPanel.js
 * @module ui/MaterialPanel
 * @description
 * Phase VII — PBR 材质色彩与质感定制面板
 *
 * 功能：
 *   1. 预设材质球（石膏白、素描灰、哑光黑、金属银、基础肤色）一键切换
 *   2. 修改选中模型的 MeshStandardMaterial.color / metalness / roughness
 *   3. Apple 极简风格 UI，与现有面板视觉统一
 */

import * as THREE from 'three';

// ── 预设材质球定义 ────────────────────────────────────────────────
export const MATERIAL_PRESETS = {
  plaster: {
    label: '石膏白',
    color: 0xf2f0ec,
    metalness: 0.0,
    roughness: 0.92,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-plaster" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#d8d4ce"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-plaster)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>
    </svg>`,
  },
  sketch: {
    label: '素描灰',
    color: 0x8a8a8a,
    metalness: 0.0,
    roughness: 0.85,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-sketch" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#b0b0b0"/>
          <stop offset="100%" stop-color="#5a5a5a"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-sketch)" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
    </svg>`,
  },
  matte_black: {
    label: '哑光黑',
    color: 0x1a1a1a,
    metalness: 0.0,
    roughness: 0.95,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-black" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#3c3c3c"/>
          <stop offset="100%" stop-color="#080808"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-black)" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
    </svg>`,
  },
  metallic: {
    label: '金属银',
    color: 0xc8c8c8,
    metalness: 0.92,
    roughness: 0.18,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-metal" cx="32%" cy="28%" r="65%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="45%" stop-color="#c0c0c8"/>
          <stop offset="100%" stop-color="#707078"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-metal)" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>
      <ellipse cx="8" cy="7" rx="2.5" ry="1.2" fill="rgba(255,255,255,0.5)" transform="rotate(-20,8,7)"/>
    </svg>`,
  },
  skin: {
    label: '基础肤色',
    color: 0xc8845a,
    metalness: 0.0,
    roughness: 0.72,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-skin" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#e8a880"/>
          <stop offset="100%" stop-color="#a86040"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-skin)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>
    </svg>`,
  },
  clay: {
    label: '黏土橙',
    color: 0xd4784a,
    metalness: 0.0,
    roughness: 0.88,
    icon: `<svg width="22" height="22" viewBox="0 0 22 22">
      <defs>
        <radialGradient id="mg-clay" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#f09060"/>
          <stop offset="100%" stop-color="#a04020"/>
        </radialGradient>
      </defs>
      <circle cx="11" cy="11" r="9.5" fill="url(#mg-clay)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>
    </svg>`,
  },
};

export class MaterialPanel {
  /**
   * @param {HTMLElement} container - 挂载节点
   * @param {Function} getActiveModelRoot - 返回当前激活模型根节点的函数
   */
  constructor(container, getActiveModelRoot) {
    this._container        = container;
    this._getModelRoot     = getActiveModelRoot;
    this._activePreset     = null;
    this._isBuilt          = false;

    // 精细控制滑块状态
    this._metalSlider   = null;
    this._roughSlider   = null;
    this._colorPicker   = null;
  }

  build() {
    if (this._isBuilt) return;
    this._isBuilt = true;
    this._render();
  }

  /** 刷新：切换激活角色后，重新读取其材质状态同步 UI */
  syncFromModel() {
    const root = this._getModelRoot();
    if (!root) return;

    // 取第一个 SkinnedMesh 的材质作为代表
    let mat = null;
    root.traverse(n => {
      if (!mat && n.isMesh && n.material?.isMeshStandardMaterial) mat = n.material;
    });
    if (!mat) return;

    // 同步精细控制滑块
    if (this._metalSlider) {
      this._metalSlider.value = mat.metalness;
      this._updateFill(this._metalSlider, mat.metalness, 0, 1);
      const display = this._metalSlider.closest('.slider-row')?.querySelector('.slider-value');
      if (display) display.textContent = Math.round(mat.metalness * 100) + '%';
    }
    if (this._roughSlider) {
      this._roughSlider.value = mat.roughness;
      this._updateFill(this._roughSlider, mat.roughness, 0, 1);
      const display = this._roughSlider.closest('.slider-row')?.querySelector('.slider-value');
      if (display) display.textContent = Math.round(mat.roughness * 100) + '%';
    }
    if (this._colorPicker) {
      const hex = '#' + mat.color.getHexString();
      this._colorPicker.value = hex;
    }
  }

  // ── 私有 ─────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';

    // ── 1. 预设材质球网格 ───────────────────────────────────────────
    const presetsWrap = document.createElement('div');
    presetsWrap.className = 'mat-section';

    const presetsTitle = document.createElement('div');
    presetsTitle.className = 'mat-section__title';
    presetsTitle.textContent = '模型固有色';
    presetsWrap.appendChild(presetsTitle);

    const grid = document.createElement('div');
    grid.className = 'mat-ball-grid';

    for (const [key, preset] of Object.entries(MATERIAL_PRESETS)) {
      const item = document.createElement('button');
      item.className = 'mat-ball-item';
      item.dataset.key = key;
      item.title = preset.label;
      item.innerHTML = `
        <div class="mat-ball-item__sphere">${preset.icon}</div>
        <span class="mat-ball-item__label">${preset.label}</span>`;

      item.addEventListener('click', () => {
        this._applyPreset(key, preset);
        grid.querySelectorAll('.mat-ball-item').forEach(b => b.classList.remove('mat-ball-item--active'));
        item.classList.add('mat-ball-item--active');
        this._activePreset = key;

        // 同步精细控制滑块
        if (this._metalSlider) {
          this._metalSlider.value = preset.metalness;
          this._updateFill(this._metalSlider, preset.metalness, 0, 1);
          const d = this._metalSlider.closest('.slider-row')?.querySelector('.slider-value');
          if (d) d.textContent = Math.round(preset.metalness * 100) + '%';
        }
        if (this._roughSlider) {
          this._roughSlider.value = preset.roughness;
          this._updateFill(this._roughSlider, preset.roughness, 0, 1);
          const d = this._roughSlider.closest('.slider-row')?.querySelector('.slider-value');
          if (d) d.textContent = Math.round(preset.roughness * 100) + '%';
        }
        if (this._colorPicker) {
          const c = new THREE.Color(preset.color);
          this._colorPicker.value = '#' + c.getHexString();
        }
      });

      grid.appendChild(item);
    }

    presetsWrap.appendChild(grid);
    this._container.appendChild(presetsWrap);

    // ── 分隔线 ───────────────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'panel__sep';
    this._container.appendChild(sep);

    // ── 2. 精细控制区 ──────────────────────────────────────────────
    const fineWrap = document.createElement('div');
    fineWrap.className = 'mat-section';

    const fineTitle = document.createElement('div');
    fineTitle.className = 'mat-section__title';
    fineTitle.textContent = '精细调节';
    fineWrap.appendChild(fineTitle);

    // 自定义颜色拾取
    const colorRow = document.createElement('div');
    colorRow.className = 'mat-color-row';
    colorRow.innerHTML = `<span class="mat-color-label">固有色</span>`;

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'mat-color-picker';
    colorPicker.value = '#8899cc';
    this._colorPicker = colorPicker;

    colorPicker.addEventListener('input', () => {
      const c = new THREE.Color(colorPicker.value);
      this._applyToModel(mat => { mat.color.copy(c); mat.needsUpdate = true; });
      // 取消预设激活态（自定义颜色）
      grid.querySelectorAll('.mat-ball-item').forEach(b => b.classList.remove('mat-ball-item--active'));
    });

    colorRow.appendChild(colorPicker);
    fineWrap.appendChild(colorRow);

    // 金属度 Slider
    const metalRow = this._createFineSlider({
      label: '金属度',
      min: 0, max: 1, step: 0.01, value: 0.05,
      unit: '%',
      displayScale: 100,
      onChange: (v) => this._applyToModel(mat => { mat.metalness = v; mat.needsUpdate = true; }),
    });
    this._metalSlider = metalRow.querySelector('.slider-input');

    // 粗糙度 Slider
    const roughRow = this._createFineSlider({
      label: '粗糙度',
      min: 0, max: 1, step: 0.01, value: 0.6,
      unit: '%',
      displayScale: 100,
      onChange: (v) => this._applyToModel(mat => { mat.roughness = v; mat.needsUpdate = true; }),
    });
    this._roughSlider = roughRow.querySelector('.slider-input');

    fineWrap.append(metalRow, roughRow);
    this._container.appendChild(fineWrap);
  }

  _createFineSlider({ label, min, max, step, value, unit = '', displayScale = 1, onChange }) {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'slider-label';
    labelEl.innerHTML = `<span class="slider-label__joint">${label}</span>`;

    const track = document.createElement('div');
    track.className = 'slider-track';
    const fill = document.createElement('div');
    fill.className = 'slider-fill';

    const input = document.createElement('input');
    input.type      = 'range';
    input.className = 'slider-input';
    input.min       = min;
    input.max       = max;
    input.step      = step;
    input.value     = value;
    input._fill     = fill;
    input._min      = min;
    input._max      = max;

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = Math.round(value * displayScale) + unit;

    this._updateFill(input, value, min, max);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      onChange(v);
      this._updateFill(input, v, min, max);
      valueEl.textContent = Math.round(v * displayScale) + unit;
    });

    track.append(fill, input);
    const controls = document.createElement('div');
    controls.className = 'slider-controls';
    controls.append(track, valueEl);

    row.append(labelEl, controls);
    return row;
  }

  _applyPreset(key, preset) {
    const color = new THREE.Color(preset.color);
    this._applyToModel(mat => {
      mat.color.copy(color);
      mat.metalness = preset.metalness;
      mat.roughness = preset.roughness;
      mat.needsUpdate = true;
    });
  }

  _applyToModel(fn) {
    const root = this._getModelRoot();
    if (!root) return;
    root.traverse(n => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(m => { if (m?.isMeshStandardMaterial) fn(m); });
    });
  }

  _updateFill(input, value, min, max) {
    const fill = input._fill;
    if (!fill) return;
    const pct = ((value - min) / (max - min)) * 100;
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}