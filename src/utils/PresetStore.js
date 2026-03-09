/**
 * @file PresetStore.js
 * @module utils/PresetStore
 * @description
 * Phase V — 配置存档管理器
 *
 * 功能：
 *   1. 将当前姿态（PoseManager）+ 光照（LightingSystem）序列化为 JSON
 *   2. 触发浏览器下载 .json 文件
 *   3. 通过 <input type="file"> 读取 JSON 并恢复状态
 *   4. 使用 localStorage 缓存最近一次配置（自动恢复）
 *
 * JSON 格式：
 * {
 *   version: "1.0",
 *   timestamp: "2024-...",
 *   pose: { jointKey: { x, y, z }, ... },
 *   lighting: {
 *     key:  { azimuth, elevation, intensity, color },
 *     fill: { ... },
 *     back: { ... },
 *     ambient: { intensity },
 *   },
 *   material: { metalness, roughness, envMapIntensity }
 * }
 */

const STORAGE_KEY = 'poseref_last_preset';
const FORMAT_VER  = '1.0';

export class PresetStore {
  /**
   * @param {import('../pose/PoseManager.js').PoseManager}     poseManager
   * @param {import('../scene/LightingSystem.js').LightingSystem} lightingSystem
   */
  constructor(poseManager, lightingSystem) {
    this._pose     = poseManager;
    this._lighting = lightingSystem;
  }

  // ── 序列化 / 导出 ─────────────────────────────────────────────

  /**
   * 序列化当前状态为 JSON 对象
   */
  serialize() {
    // 姿态：遍历所有已映射关节，严格过滤 null / NaN / Infinity
    const pose = {};
    for (const [key] of this._pose.boneMap) {
      const rot = this._pose.currentRotations.get(key);
      if (!rot) continue;
      const { x, y, z } = rot;
      // 任意轴为 null / NaN / Infinity 则跳过，防止存入损坏数据
      if (x == null || y == null || z == null) continue;
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      pose[key] = {
        x: parseFloat(x.toFixed(3)),
        y: parseFloat(y.toFixed(3)),
        z: parseFloat(z.toFixed(3)),
      };
    }

    // 光照
    const ls = this._lighting.getState();
    const lighting = {
      key:  { ...ls.key },
      fill: { ...ls.fill },
      back: { ...ls.back },
      ambient: { intensity: ls.ambient.intensity },
    };

    // 材质（从 LightingSystem 获取最新值）
    const material = {
      metalness:       this._lighting._lastMaterialProps?.metalness       ?? 0.1,
      roughness:       this._lighting._lastMaterialProps?.roughness        ?? 0.55,
      envMapIntensity: this._lighting._lastMaterialProps?.envMapIntensity  ?? 1.0,
    };

    return {
      version:   FORMAT_VER,
      timestamp: new Date().toISOString(),
      pose,
      lighting,
      material,
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

    const link    = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    // 同时存入 localStorage
    //this._saveToStorage(data);
    console.info(`[PresetStore] 配置已导出: ${filename}`);
  }

  // ── 反序列化 / 导入 ───────────────────────────────────────────

  /**
   * 从 JSON 对象恢复状态
   * @param {Object}   data
   * @param {Function} [onDone]
   * @param {Object}   [lightingPanel] - 可选，用于同步 UI Slider
   */
  applyJSON(data, { onDone, lightingPanel, posePanel } = {}) {
    if (!data?.version) {
      console.warn('[PresetStore] 无效的配置文件格式');
      return false;
    }

    try {
      // ── 恢复姿态 ─────────────────────────────────────────────
      if (data.pose) {
        this._pose.resetToInitial(1);
        for (const [jointKey, rot] of Object.entries(data.pose)) {
          for (const axis of ['x', 'y', 'z']) {
            const val = rot[axis];
            // 严格过滤 NaN / Infinity / 非数字
            if (val !== undefined && isFinite(val) && !isNaN(val)) {
              this._pose.setJointRotation(jointKey, axis, val);
            }
          }
        }
        posePanel?.syncToModel();
      }

      // ── 恢复光照 ─────────────────────────────────────────────
      if (data.lighting) {
        for (const lk of ['key', 'fill', 'back']) {
          const l = data.lighting[lk];
          if (!l) continue;
          if (l.azimuth   !== undefined && l.elevation !== undefined) {
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

      // ── 恢复材质 ─────────────────────────────────────────────
      if (data.material && this._lighting._modelRootRef) {
        this._lighting.setMaterialProps(this._lighting._modelRootRef, data.material);
      }

      console.info('[PresetStore] 配置已恢复');
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

  // ── localStorage 自动存档 ─────────────────────────────────────

  /**
   * 保存到 localStorage（自动存档）
   */
  saveToStorage() {
    this._saveToStorage(this.serialize());
  }

  /**
   * 从 localStorage 恢复（应用启动时调用）
   * @returns {boolean} 是否有存档
   */

  restoreFromStorage(opts = {}) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      // 含 null 的损坏存档直接删除
      if (raw.includes('"x":null')) {
        localStorage.removeItem(STORAGE_KEY);
        console.warn('[PresetStore] 存档含 null，已自动清除');
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
}