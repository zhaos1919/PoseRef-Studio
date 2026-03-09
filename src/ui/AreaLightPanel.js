/**
 * @file AreaLightPanel.js
 * @module ui/AreaLightPanel
 * @description
 * Phase VIII — 柔光箱（RectAreaLight）控制面板
 *
 * 功能：
 *   1. 添加 / 删除面积光
 *   2. 每个面积光的独立控制：宽度、高度、强度、颜色
 *   3. 位置预设（左侧柔光箱、右侧柔光箱、顶光、逆光）
 *   4. 辅助框显示/隐藏切换
 *
 * 此面板应嵌入 LightingPanel 的「光源」标签页末尾。
 */

import * as THREE from 'three';

// 柔光箱位置预设（参考影棚布光）
const AREA_POSITION_PRESETS = {
  main_right: {
    label: '主光·右',
    icon: '💡',
    position: { x:  1.8, y: 2.2, z: 1.5 },
    target:   { x:  0,   y: 0.9, z: 0 },
  },
  main_left: {
    label: '主光·左',
    icon: '💡',
    position: { x: -1.8, y: 2.2, z: 1.5 },
    target:   { x:  0,   y: 0.9, z: 0 },
  },
  overhead: {
    label: '顶光',
    icon: '⬆️',
    position: { x:  0,   y: 3.5, z: 0.5 },
    target:   { x:  0,   y: 0.9, z: 0 },
  },
  backlight: {
    label: '背景光',
    icon: '🌅',
    position: { x:  0,   y: 2.0, z: -2.5 },
    target:   { x:  0,   y: 0.9, z: 0 },
  },
};

export class AreaLightPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../scene/AreaLightSystem').AreaLightSystem} areaLightSystem
   */
  constructor(container, areaLightSystem) {
    this._container = container;
    this._als = areaLightSystem;
    this._panels = new Map(); // id → DOM element
  }

  build() {
    const section = document.createElement('div');
    section.className = 'lighting-section area-light-section';

    // 标题 + 添加按钮
    const header = document.createElement('div');
    header.className = 'lighting-section__header';
    header.innerHTML = `
      <span class="lighting-section__title" style="padding:0">柔光箱 Area Light</span>`;

    const addBtn = document.createElement('button');
    addBtn.className = 'area-light-add-btn';
    addBtn.title = '添加柔光箱';
    addBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>添加</span>`;
    addBtn.addEventListener('click', () => this._addLight());
    header.appendChild(addBtn);

    section.appendChild(header);

    // 空状态提示
    this._emptyHint = document.createElement('div');
    this._emptyHint.className = 'area-light-empty';
    this._emptyHint.textContent = '点击「添加」创建柔光箱光源';
    section.appendChild(this._emptyHint);

    // 面积光列表容器
    this._listEl = document.createElement('div');
    this._listEl.className = 'area-light-list';
    section.appendChild(this._listEl);

    this._section = section;
    this._container.appendChild(section);
  }

  // ── 内部方法 ──────────────────────────────────────────────────────

  _addLight() {
    const { id } = this._als.addAreaLight({
      position: { ...AREA_POSITION_PRESETS.main_right.position },
      target:   { ...AREA_POSITION_PRESETS.main_right.target },
    });
    this._emptyHint.style.display = 'none';
    const card = this._buildLightCard(id);
    this._listEl.appendChild(card);
    this._panels.set(id, card);
  }

  _removeLight(id) {
    this._als.removeAreaLight(id);
    const card = this._panels.get(id);
    if (card) {
      card.classList.add('area-light-card--removing');
      setTimeout(() => {
        card.remove();
        this._panels.delete(id);
        if (this._panels.size === 0) {
          this._emptyHint.style.display = '';
        }
      }, 220);
    }
  }

  _buildLightCard(id) {
    const cfg = this._als.getConfig(id);
    const card = document.createElement('div');
    card.className = 'area-light-card';
    card.dataset.lightId = id;

    // ── 卡片标题行 ──
    const titleRow = document.createElement('div');
    titleRow.className = 'area-light-card__title-row';

    const icon = document.createElement('span');
    icon.className = 'area-light-card__icon';
    icon.textContent = '▭';

    const name = document.createElement('span');
    name.className = 'area-light-card__name';
    name.textContent = `柔光箱 ${id.split('_')[1]}`;

    // 辅助框切换
    const helperToggle = document.createElement('button');
    helperToggle.className = 'area-light-toggle-btn area-light-toggle-btn--active';
    helperToggle.title = '显示/隐藏辅助框';
    helperToggle.textContent = '辅助框';
    let helperVisible = true;
    helperToggle.addEventListener('click', () => {
      helperVisible = !helperVisible;
      this._als.setHelperVisible(id, helperVisible);
      helperToggle.classList.toggle('area-light-toggle-btn--active', helperVisible);
    });

    // 删除按钮
    const removeBtn = document.createElement('button');
    removeBtn.className = 'area-light-remove-btn';
    removeBtn.title = '删除此柔光箱';
    removeBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    removeBtn.addEventListener('click', () => this._removeLight(id));

    titleRow.append(icon, name, helperToggle, removeBtn);
    card.appendChild(titleRow);

    // ── 位置预设 ──
    const presetRow = document.createElement('div');
    presetRow.className = 'area-light-preset-row';
    for (const [key, preset] of Object.entries(AREA_POSITION_PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'area-light-preset-btn';
      btn.title = preset.label;
      btn.innerHTML = `<span>${preset.icon}</span><span>${preset.label}</span>`;
      btn.addEventListener('click', () => {
        this._als.updateAreaLight(id, {
          position: { ...preset.position },
          target:   { ...preset.target },
        });
        presetRow.querySelectorAll('.area-light-preset-btn')
          .forEach(b => b.classList.remove('area-light-preset-btn--active'));
        btn.classList.add('area-light-preset-btn--active');
      });
      if (key === 'main_right') btn.classList.add('area-light-preset-btn--active');
      presetRow.appendChild(btn);
    }
    card.appendChild(presetRow);

    // ── 参数 Sliders ──
    const slidersWrap = document.createElement('div');
    slidersWrap.className = 'area-light-sliders';

    slidersWrap.appendChild(this._buildAreaSlider({
      label: '强度', min: 0, max: 30, step: 0.5, value: cfg.intensity, unit: 'x',
      onChange: v => this._als.updateAreaLight(id, { intensity: v }),
    }));
    slidersWrap.appendChild(this._buildAreaSlider({
      label: '宽度', min: 0.2, max: 4, step: 0.1, value: cfg.width, unit: 'm',
      onChange: v => this._als.updateAreaLight(id, { width: v }),
    }));
    slidersWrap.appendChild(this._buildAreaSlider({
      label: '高度', min: 0.2, max: 3, step: 0.1, value: cfg.height, unit: 'm',
      onChange: v => this._als.updateAreaLight(id, { height: v }),
    }));

    card.appendChild(slidersWrap);

    // ── 颜色选择 ──
    const colorRow = document.createElement('div');
    colorRow.className = 'area-light-color-row';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'area-light-color-label';
    colorLabel.textContent = '色温';

    // 颜色预设色块
    const colorPresets = [
      { hex: '#ffe8d0', title: '暖白 5500K' },
      { hex: '#ffffff', title: '纯白 6500K' },
      { hex: '#ffd280', title: '钨灯 3200K' },
      { hex: '#d0e8ff', title: '冷白 8000K' },
      { hex: '#ffb080', title: '黄昏 2700K' },
    ];

    const swatches = document.createElement('div');
    swatches.className = 'color-swatches color-swatches--sm';

    colorPresets.forEach((p, i) => {
      const dot = document.createElement('button');
      dot.className = 'color-swatch' + (i === 0 ? ' color-swatch--active' : '');
      dot.title = p.title;
      dot.dataset.hex = p.hex;
      dot.innerHTML = `<span class="color-swatch__inner" style="background:${p.hex}"></span>`;
      dot.addEventListener('click', () => {
        this._als.updateAreaLight(id, { color: p.hex });
        swatches.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('color-swatch--active', s.dataset.hex === p.hex)
        );
        customInput.value = p.hex;
      });
      swatches.appendChild(dot);
    });

    // 自定义拾色器
    const customWrap = document.createElement('div');
    customWrap.className = 'custom-picker';
    customWrap.title = '自定义颜色';
    customWrap.innerHTML = `
      <span class="custom-picker__preview">
        <svg width="10" height="10" viewBox="0 0 10 10" class="custom-picker__icon">
          <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>`;
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'custom-picker__input';
    customInput.value = '#ffe8d0';
    customWrap.appendChild(customInput);
    customWrap.querySelector('.custom-picker__preview')
      .addEventListener('click', () => customInput.click());
    customInput.addEventListener('input', () => {
      this._als.updateAreaLight(id, { color: customInput.value });
      swatches.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.remove('color-swatch--active')
      );
    });

    colorRow.append(colorLabel, swatches, customWrap);
    card.appendChild(colorRow);

    return card;
  }

  _buildAreaSlider({ label, min, max, step, value, unit, onChange }) {
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
    input.type  = 'range';
    input.className = 'slider-input';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = value;

    const pct = ((value - min) / (max - min)) * 100;
    fill.style.width = pct + '%';

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.textContent = (step < 1 ? value.toFixed(1) : Math.round(value)) + unit;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      const p = ((v - min) / (max - min)) * 100;
      fill.style.width = p + '%';
      valueEl.textContent = (step < 1 ? v.toFixed(1) : Math.round(v)) + unit;
      onChange(v);
    });

    track.append(fill, input);
    const controls = document.createElement('div');
    controls.className = 'slider-controls';
    controls.append(track, valueEl);
    row.append(labelEl, controls);
    return row;
  }
}