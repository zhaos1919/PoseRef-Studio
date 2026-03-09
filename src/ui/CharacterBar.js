/**
 * @file CharacterBar.js
 * @module ui/CharacterBar
 * @description
 * Phase VII — 多角色管理工具栏
 *
 * 功能：
 *   1. 顶部工具栏内"添加角色"按钮
 *   2. 角色切片标签（横向滚动，活跃态高亮）
 *   3. 各角色条目上的"删除"小按钮（≥2 个角色时显示）
 *   4. 变换模式切换按钮（移动 / 旋转）
 */

export class CharacterBar {
  /**
   * @param {HTMLElement}     container      - 挂载节点（插入顶部工具栏）
   * @param {ModelManager}    modelManager
   * @param {TransformSystem} transformSystem
   * @param {Function}        onActiveChange - 激活角色变更时回调（用于刷新 PosePanel / MaterialPanel）
   */
  constructor(container, modelManager, transformSystem, onActiveChange) {
    this._container      = container;
    this._modelMgr       = modelManager;
    this._transformSys   = transformSystem;
    this._onActiveChange = onActiveChange;

    this._barEl          = null;
    this._transformMode  = 'translate'; // 'translate' | 'rotate'

    this._build();

    // 监听 ModelManager 的状态变更
    this._modelMgr.onChange(() => this._refresh());
  }

  // ── 私有 ─────────────────────────────────────────────────────────

  _build() {
    // ── 角色列表栏（插入在工具栏中，已在 HTML 预留 #character-bar 节点）─
    this._barEl = document.getElementById('character-bar');
    if (!this._barEl) return;

    this._refresh();
  }

  _refresh() {
    if (!this._barEl) return;
    this._barEl.innerHTML = '';

    const entries = this._modelMgr.entries;
    const active  = this._modelMgr.activeEntry;

    // ── 角色标签列表 ─────────────────────────────────────────────
    const list = document.createElement('div');
    list.className = 'char-list';

    for (const entry of entries) {
      const tag = document.createElement('button');
      tag.className = `char-tag${entry === active ? ' char-tag--active' : ''}`;
      tag.dataset.id = entry.id;

      const icon = document.createElement('span');
      icon.className = 'char-tag__icon';
      icon.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="3" r="1.8" stroke="currentColor" stroke-width="1.1"/>
        <path d="M2 11v-3a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`;

      const nameEl = document.createElement('span');
      nameEl.className = 'char-tag__name';
      nameEl.textContent = entry.label;

      tag.append(icon, nameEl);

      // 删除按钮（≥2 个角色时才显示）
      if (entries.length > 1) {
        const del = document.createElement('button');
        del.className = 'char-tag__del';
        del.title = '移除此角色';
        del.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>`;
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this._modelMgr.removeEntry(entry.id);
        });
        tag.appendChild(del);
      }

      tag.addEventListener('click', () => {
        this._modelMgr.setActive(entry.id);
        this._transformSys.attachTo(entry.root);
        this._onActiveChange?.(entry);
      });

      list.appendChild(tag);
    }

    this._barEl.appendChild(list);

    // 分隔
    const div1 = document.createElement('div');
    div1.className = 'char-bar__div';
    this._barEl.appendChild(div1);

    // ── 添加角色按钮 ──────────────────────────────────────────────
    const addBtn = document.createElement('button');
    addBtn.className = 'tool-btn tool-btn--add-char';
    addBtn.id = 'btn-add-character';
    addBtn.title = '克隆新角色';
    addBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M1 14v-2a5 5 0 0 1 9.5-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M13 9v6M10 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>添加角色</span>`;

    addBtn.addEventListener('click', () => {
      try {
        const entry = this._modelMgr.cloneModel();
        this._transformSys.attachTo(entry.root);
        this._onActiveChange?.(entry);
      } catch(e) {
        console.error('[CharacterBar] 克隆失败:', e);
      }
    });

    this._barEl.appendChild(addBtn);
  }
}