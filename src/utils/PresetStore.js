/**
 * @file PresetStore.js
 * @module utils/PresetStore
 * @description
 * Phase VIII — 多角色配置存档管理器
 *
 * 升级内容：
 *   - 序列化 / 恢复「所有角色」的姿态 + 世界坐标位置
 *   - 导入时自动克隆缺少的角色，删除多余角色，与导出时的场景完全一致
 *   - 光照、材质恢复逻辑保持不变
 *   - 向后兼容旧版 v1.0 单角色 JSON 格式
 *
 * JSON 格式 v2.0：
 * {
 *   version: "2.0",
 *   timestamp: "...",
 *   characters: [
 *     {
 *       index: 0,
 *       label: "角色 1",
 *       position: { x, y, z },
 *       pose: { jointKey: { x, y, z }, ... }
 *     },
 *     ...
 *   ],
 *   activeIndex: 0,
 *   lighting: { key, fill, back, ambient },
 *   material: { metalness, roughness, envMapIntensity }
 * }
 */

const STORAGE_KEY = 'poseref_last_preset';
const FORMAT_VER  = '2.0';

export class PresetStore {
  /**
   * @param {import('../pose/PoseManager.js').PoseManager}         poseManager    - 首个模型的 PoseManager（向后兼容）
   * @param {import('../scene/LightingSystem.js').LightingSystem}  lightingSystem
   * @param {import('../scene/ModelManager.js').ModelManager}      [modelManager] - 多角色管理器
   */
  constructor(poseManager, lightingSystem, modelManager = null) {
    this._pose     = poseManager;
    this._lighting = lightingSystem;
    this._modelMgr = modelManager;
  }

  // ── 序列化 / 导出 ─────────────────────────────────────────────────

  /**
   * 序列化当前全场景状态（含所有角色）为 JSON 对象
   */
  serialize() {
    const characters = [];

    if (this._modelMgr) {
      const entries     = this._modelMgr.entries;
      const activeEntry = this._modelMgr.activeEntry;

      entries.forEach((entry, index) => {
        const pos = entry.root.position;
        characters.push({
          index,
          label:    entry.label ?? `角色 ${index + 1}`,
          position: {
            x: parseFloat(pos.x.toFixed(4)),
            y: parseFloat(pos.y.toFixed(4)),
            z: parseFloat(pos.z.toFixed(4)),
          },
          pose: this._serializePose(entry.poseManager),
        });
      });

      const activeIndex = entries.indexOf(activeEntry);

      return {
        version:     FORMAT_VER,
        timestamp:   new Date().toISOString(),
        characters,
        activeIndex: activeIndex >= 0 ? activeIndex : 0,
        lighting:    this._serializeLighting(),
        material:    this._serializeMaterial(),
      };
    }

    // 降级兼容：无 ModelManager 时的旧逻辑
    return {
      version:     FORMAT_VER,
      timestamp:   new Date().toISOString(),
      characters:  [{
        index:    0,
        position: { x: 0, y: 0, z: 0 },
        pose:     this._serializePose(this._pose),
      }],
      activeIndex: 0,
      lighting:    this._serializeLighting(),
      material:    this._serializeMaterial(),
    };
  }

  /**
   * 下载当前配置为 .json 文件
   * @param {string} [name]
   */
  exportJSON(name) {
    const data     = this.serialize();
    const json     = JSON.stringify(data, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const filename = name ?? `PoseRef_${data.timestamp.slice(0, 10)}.json`;

    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    console.info(`[PresetStore] 配置已导出 (${data.characters.length} 个角色): ${filename}`);
  }

  // ── 反序列化 / 导入 ───────────────────────────────────────────────

  /**
   * 从 JSON 对象恢复全场景状态
   *
   * @param {Object}   data
   * @param {Object}   opts
   * @param {Function} [opts.onDone]
   * @param {Object}   [opts.lightingPanel]
   * @param {Object}   [opts.posePanel]
   * @param {Function} [opts.onActiveChange] - (entry) => void，激活角色变更后由 App 刷新面板 UI
   * @returns {boolean}
   */
  applyJSON(data, { onDone, lightingPanel, posePanel, onActiveChange } = {}) {
    if (!data?.version) {
      console.warn('[PresetStore] 无效的配置文件格式');
      return false;
    }

    try {
      // 兼容旧版 v1.0：将 data.pose 包装为 characters 数组
      const characters = data.characters ?? (data.pose
        ? [{ index: 0, position: { x: 0, y: 0, z: 0 }, pose: data.pose }]
        : null);

      if (!characters?.length) {
        console.warn('[PresetStore] 配置中无角色数据');
        return false;
      }

      // ── 多角色恢复 ──────────────────────────────────────────────
      if (this._modelMgr) {
        // 1. 克隆补足缺少的角色
        const currentCount = this._modelMgr.entries.length;
        for (let i = currentCount; i < characters.length; i++) {
          this._modelMgr.cloneModel();
        }

        // 2. 删除多余角色（从末尾删起，避免索引错乱）
        while (this._modelMgr.entries.length > characters.length) {
          const entries = this._modelMgr.entries;
          const last    = entries[entries.length - 1];
          this._modelMgr.removeEntry(last.id);
        }

        // 3. 依次恢复每个角色的位置与姿态
        const currentEntries = this._modelMgr.entries;
        for (let i = 0; i < characters.length; i++) {
          const charData = characters[i];
          const entry    = currentEntries[i];
          if (!entry) continue;

          // 位置
          if (charData.position) {
            entry.root.position.set(
              charData.position.x ?? 0,
              charData.position.y ?? 0,
              charData.position.z ?? 0
            );
          }

          // 姿态
          if (charData.pose) {
            this._applyPose(entry.poseManager, charData.pose);
          }
        }

        // 4. 恢复激活角色并刷新面板 UI
        const activeIdx   = Math.min(data.activeIndex ?? 0, currentEntries.length - 1);
        const activeEntry = currentEntries[activeIdx] ?? currentEntries[0];
        if (activeEntry) {
          this._modelMgr.setActive(activeEntry.id);
          // 同步面板绑定
          if (posePanel) {
            posePanel._pose = activeEntry.poseManager;
            posePanel.syncToModel();
          }
          onActiveChange?.(activeEntry);
        }

      } else {
        // 降级：无 ModelManager，只恢复第一个角色
        if (characters[0]?.pose) {
          this._applyPose(this._pose, characters[0].pose);
          posePanel?.syncToModel();
        }
      }

      // ── 光照恢复 ────────────────────────────────────────────────
      if (data.lighting) {
        for (const lk of ['key', 'fill', 'back']) {
          const l = data.lighting[lk];
          if (!l) continue;
          if (l.azimuth !== undefined && l.elevation !== undefined) {
            this._lighting.setLightPolar(lk, l.azimuth, l.elevation);
          }
          if (l.intensity !== undefined) this._lighting.setLightIntensity(lk, l.intensity);
          if (l.color     !== undefined) this._lighting.setLightColor(lk, l.color);
        }
        if (data.lighting.ambient?.intensity !== undefined) {
          this._lighting.setLightIntensity('ambient', data.lighting.ambient.intensity);
        }
        lightingPanel?._syncSlidersFromState();
      }

      // ── 材质恢复 ────────────────────────────────────────────────
      if (data.material && this._lighting._modelRootRef) {
        this._lighting.setMaterialProps(this._lighting._modelRootRef, data.material);
      }

      console.info(`[PresetStore] 配置已恢复 (${characters.length} 个角色)`);
      onDone?.(data);
      return true;
    } catch (err) {
      console.error('[PresetStore] 恢复配置失败:', err);
      return false;
    }
  }

  /**
   * 打开文件选择器，导入 JSON
   * @param {Object} opts  - 同 applyJSON 的 opts
   * @returns {Promise<boolean>}
   */
  importFromFile(opts = {}) {
    return new Promise((resolve) => {
      const input  = document.createElement('input');
      input.type   = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        document.body.removeChild(input);
        if (!file) { resolve(false); return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            const ok   = this.applyJSON(data, opts);
            resolve(ok);
          } catch {
            console.error('[PresetStore] JSON 解析失败');
            resolve(false);
          }
        };
        reader.readAsText(file);
      });

      input.click();
    });
  }

  // ── localStorage 自动存档 ─────────────────────────────────────────

  saveToStorage() {
    this._saveToStorage(this.serialize());
  }

  restoreFromStorage(opts = {}) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      if (raw.includes('"x":null') || raw.includes('NaN') || raw.includes('Infinity')) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn('[PresetStore] 存档含损坏数据，已自动清除');
        return false;
      }
      const data = JSON.parse(raw);
      return this.applyJSON(data, opts);
    } catch {
      return false;
    }
  }

  _saveToStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[PresetStore] localStorage 写入失败:', e.message);
    }
  }

  // ── 私有工具 ──────────────────────────────────────────────────────

  /**
   * 序列化单个 PoseManager 的旋转数据
   */
  _serializePose(poseManager) {
    if (!poseManager) return {};
    const pose = {};
    for (const [key] of poseManager.boneMap) {
      const rot = poseManager.currentRotations.get(key);
      if (!rot) continue;
      const { x, y, z } = rot;
      if (x == null || y == null || z == null) continue;
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      pose[key] = {
        x: parseFloat(x.toFixed(3)),
        y: parseFloat(y.toFixed(3)),
        z: parseFloat(z.toFixed(3)),
      };
    }
    return pose;
  }

  /**
   * 序列化光照状态
   */
  _serializeLighting() {
    const ls = this._lighting.getState();
    return {
      key:     { ...ls.key },
      fill:    { ...ls.fill },
      back:    { ...ls.back },
      ambient: { intensity: ls.ambient.intensity },
    };
  }

  /**
   * 序列化材质状态
   */
  _serializeMaterial() {
    return {
      metalness:       this._lighting._lastMaterialProps?.metalness       ?? 0.1,
      roughness:       this._lighting._lastMaterialProps?.roughness        ?? 0.55,
      envMapIntensity: this._lighting._lastMaterialProps?.envMapIntensity  ?? 1.0,
    };
  }

  /**
   * 将 poseData 应用到指定的 PoseManager
   */
  _applyPose(poseManager, poseData) {
    if (!poseManager || !poseData) return;
    poseManager.resetToInitial(1);
    for (const [jointKey, rot] of Object.entries(poseData)) {
      for (const axis of ['x', 'y', 'z']) {
        const val = rot[axis];
        if (val !== undefined && isFinite(val) && !isNaN(val)) {
          poseManager.setJointRotation(jointKey, axis, val);
        }
      }
    }
  }
}