/**
 * @file PoseManager.js
 * @module pose/PoseManager
 * @description
 * 姿态管理器（Phase III 核心模块）
 *
 * 职责：
 *   1. 自动映射骨骼名称 → 标准关节键（兼容 Mixamo / Soldier.glb / SMPL）
 *   2. 为每个关节定义解剖学旋转限位（Constraints）
 *   3. 提供 setJointRotation() 接口，供 UI Slider 实时调用
 *   4. 内置预置姿态（站立 / T-Pose / 坐下 / 举手），带缓动过渡动画
 *
 * ─────────────────────────────────────────────────────────────────
 * 【骨骼命名适配说明】
 *
 *  本系统优先识别三种主流骨骼规范：
 *
 *  A. Mixamo（来自 mixamo.com 或 Blender 导出的 FBX→GLB）
 *     特征前缀：mixamorig: 或 mixamorig_
 *     关键骨骼：mixamorig:Hips, mixamorig:Spine, mixamorig:LeftArm...
 *
 *  B. Three.js Soldier.glb（本系统 Placeholder 模型）
 *     无前缀，骨骼名如：mixamorigHips, mixamorigSpine...
 *     注意：此模型骨骼名去掉了冒号，用驼峰合并
 *
 *  C. SMPL（来自 smpl.is.tue.mpg.de，Blender 转 GLB 后）
 *     骨骼名如：Pelvis, L_Hip, R_Hip, Spine1, L_Shoulder...
 *
 *  如你使用的模型骨骼名不匹配，请在下方 BONE_NAME_MAP 中添加映射。
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
// 1. 骨骼名称映射表
//    格式：标准关节键 → [可能的骨骼名数组，按优先级排列]
//    PoseManager 初始化时遍历模型所有骨骼，找到第一个匹配的名称
// ─────────────────────────────────────────────────────────────────
const BONE_NAME_MAP = {
  // ── 躯干 ────────────────────────────────────────────────────────
  hips:         ['mixamorigHips',        'mixamorig:Hips',        'Hips',     'Pelvis',   'pelvis'],
  spine:        ['mixamorigSpine',       'mixamorig:Spine',       'Spine',    'Spine1',   'spine'],
  spine1:       ['mixamorigSpine1',      'mixamorig:Spine1',      'Spine1',   'Spine2'],
  spine2:       ['mixamorigSpine2',      'mixamorig:Spine2',      'Spine2',   'Spine3'],
  neck:         ['mixamorigNeck',        'mixamorig:Neck',        'Neck',     'neck'],
  head:         ['mixamorigHead',        'mixamorig:Head',        'Head',     'head'],

  // ── 左臂 ────────────────────────────────────────────────────────
  leftShoulder: ['mixamorigLeftShoulder','mixamorig:LeftShoulder','LeftShoulder', 'L_Collar',  'Left_Shoulder'],
  leftArm:      ['mixamorigLeftArm',     'mixamorig:LeftArm',     'LeftArm',      'L_Shoulder','Left_Arm'],
  leftForeArm:  ['mixamorigLeftForeArm', 'mixamorig:LeftForeArm', 'LeftForeArm',  'L_Elbow',   'Left_ForeArm'],
  leftHand:     ['mixamorigLeftHand',    'mixamorig:LeftHand',    'LeftHand',     'L_Wrist',   'Left_Hand'],

  // ── 右臂 ────────────────────────────────────────────────────────
  rightShoulder:['mixamorigRightShoulder','mixamorig:RightShoulder','RightShoulder','R_Collar', 'Right_Shoulder'],
  rightArm:     ['mixamorigRightArm',    'mixamorig:RightArm',    'RightArm',     'R_Shoulder','Right_Arm'],
  rightForeArm: ['mixamorigRightForeArm','mixamorig:RightForeArm','RightForeArm', 'R_Elbow',   'Right_ForeArm'],
  rightHand:    ['mixamorigRightHand',   'mixamorig:RightHand',   'RightHand',    'R_Wrist',   'Right_Hand'],

  // ── 左腿 ────────────────────────────────────────────────────────
  leftUpLeg:    ['mixamorigLeftUpLeg',   'mixamorig:LeftUpLeg',   'LeftUpLeg',    'L_Hip',     'Left_UpLeg'],
  leftLeg:      ['mixamorigLeftLeg',     'mixamorig:LeftLeg',     'LeftLeg',      'L_Knee',    'Left_Leg'],
  leftFoot:     ['mixamorigLeftFoot',    'mixamorig:LeftFoot',    'LeftFoot',     'L_Ankle',   'Left_Foot'],

  // ── 右腿 ────────────────────────────────────────────────────────
  rightUpLeg:   ['mixamorigRightUpLeg',  'mixamorig:RightUpLeg',  'RightUpLeg',   'R_Hip',     'Right_UpLeg'],
  rightLeg:     ['mixamorigRightLeg',    'mixamorig:RightLeg',    'RightLeg',     'R_Knee',    'Right_Leg'],
  rightFoot:    ['mixamorigRightFoot',   'mixamorig:RightFoot',   'RightFoot',    'R_Ankle',   'Right_Foot'],
};

// ─────────────────────────────────────────────────────────────────
// 2. 解剖学旋转限位（单位：度，转换为弧度时使用）
//    [minDeg, maxDeg] 分别对应 X / Y / Z 轴
//    参考：人体关节活动度标准（ROM - Range of Motion）
// ─────────────────────────────────────────────────────────────────
const JOINT_CONSTRAINTS = {
  // ── 躯干：适度放开，支持夸张造型和弓背姿势 ──────────────────────
  hips:          { x: [-60,  60], y: [-90,  90], z: [-45,  45] },
  spine:         { x: [-60,  70], y: [-60,  60], z: [-45,  45] },
  spine1:        { x: [-50,  60], y: [-45,  45], z: [-40,  40] },
  spine2:        { x: [-45,  55], y: [-40,  40], z: [-35,  35] },
  neck:          { x: [-60,  60], y: [-90,  90], z: [-45,  45] },
  head:          { x: [-60,  60], y: [-90,  90], z: [-40,  40] },

  // ── 肩部：完全自由，支持耸肩 / 扣肩等造型 ───────────────────────
  leftShoulder:  { x: [-60,  60], y: [-60,  60], z: [-60,  60] },
  rightShoulder: { x: [-60,  60], y: [-60,  60], z: [-60,  60] },

  // ── 手臂：全方位 180°，支持过顶举、背后手等极限姿势 ─────────────
  leftArm:       { x: [-180, 180], y: [-180, 180], z: [-180, 180] },
  rightArm:      { x: [-180, 180], y: [-180, 180], z: [-180, 180] },

  // ── 前臂：弯曲轴全放开，旋转轴也大幅放开（支持手臂内/外旋）──────
  leftForeArm:   { x: [-10, 160], y: [-140, 140], z: [-30,  30] },
  rightForeArm:  { x: [-10, 160], y: [-140, 140], z: [-30,  30] },

  // ── 手腕：大幅放开，支持各种手势造型 ────────────────────────────
  leftHand:      { x: [-90,  90], y: [-60,  60], z: [-60,  60] },
  rightHand:     { x: [-90,  90], y: [-60,  60], z: [-60,  60] },

  // ── 大腿：支持全劈叉、高抬腿、踢腿等极限动作 ────────────────────
  leftUpLeg:     { x: [-150,  80], y: [-90,  90], z: [-90,  90] },
  rightUpLeg:    { x: [-150,  80], y: [-90,  90], z: [-90,  90] },

  // ── 小腿：膝关节弯曲轴全放开，旋转轴适度放开 ────────────────────
  leftLeg:       { x: [-10, 160], y: [-45,  45], z: [-20,  20] },
  rightLeg:      { x: [-10, 160], y: [-45,  45], z: [-20,  20] },

  // ── 脚踝：支持踮脚尖、脚背伸等芭蕾 / 武术姿势 ───────────────────
  leftFoot:      { x: [-60,  80], y: [-45,  45], z: [-50,  50] },
  rightFoot:     { x: [-60,  80], y: [-45,  45], z: [-50,  50] },
};

// ─────────────────────────────────────────────────────────────────
// 3. UI 显示配置（用于动态生成 Slider 面板）
//    每组对应面板的一个"分区"
// ─────────────────────────────────────────────────────────────────
export const POSE_PANEL_GROUPS = [
  {
    label: '躯干',
    joints: [
      { key: 'hips',         label: '骨盆',   axes: ['x', 'y', 'z'] },
      { key: 'spine',        label: '腰椎',   axes: ['x', 'y', 'z'] },
      { key: 'spine2',       label: '胸椎',   axes: ['x', 'z'] },
      { key: 'neck',         label: '颈部',   axes: ['x', 'y', 'z'] },
      { key: 'head',         label: '头部',   axes: ['x', 'y', 'z'] },
    ],
  },
  {
    label: '左臂',
    joints: [
      { key: 'leftShoulder', label: '左肩胛', axes: ['x', 'y', 'z'] },
      { key: 'leftArm',      label: '左大臂', axes: ['x', 'y', 'z'] },
      { key: 'leftForeArm',  label: '左前臂', axes: ['x', 'y'] },
      { key: 'leftHand',     label: '左手腕', axes: ['x', 'y', 'z'] },
    ],
  },
  {
    label: '右臂',
    joints: [
      { key: 'rightShoulder',label: '右肩胛', axes: ['x', 'y', 'z'] },
      { key: 'rightArm',     label: '右大臂', axes: ['x', 'y', 'z'] },
      { key: 'rightForeArm', label: '右前臂', axes: ['x', 'y'] },
      { key: 'rightHand',    label: '右手腕', axes: ['x', 'y', 'z'] },
    ],
  },
  {
    label: '左腿',
    joints: [
      { key: 'leftUpLeg',  label: '左大腿', axes: ['x', 'y', 'z'] },
      { key: 'leftLeg',    label: '左小腿', axes: ['x', 'y'] },
      { key: 'leftFoot',   label: '左脚踝', axes: ['x', 'y', 'z'] },
    ],
  },
  {
    label: '右腿',
    joints: [
      { key: 'rightUpLeg', label: '右大腿', axes: ['x', 'y', 'z'] },
      { key: 'rightLeg',   label: '右小腿', axes: ['x', 'y'] },
      { key: 'rightFoot',  label: '右脚踝', axes: ['x', 'y', 'z'] },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// 4. 预置姿态定义
//    格式：{ jointKey: { x, y, z } }（单位：度）
//    省略的关节保持当前值不变（设为 0 表示重置）
// ─────────────────────────────────────────────────────────────────
export const POSE_PRESETS = {
  stand: {
    label: '站立',
    icon: '🧍',
    rotations: {
      hips:          { x: 0,    y: 0,   z: 0 },
      spine:         { x: 0,    y: 0,   z: 0 },
      spine1:        { x: 0,    y: 0,   z: 0 },
      spine2:        { x: 0,    y: 0,   z: 0 },
      neck:          { x: 0,    y: 0,   z: 0 },
      head:          { x: 0,    y: 0,   z: 0 },
      leftArm:       { x: 0,    y: 0,   z: 0 },
      leftForeArm:   { x: 0,    y: 0,   z: 0 },
      leftHand:      { x: 0,    y: 0,   z: 0 },
      rightArm:      { x: 0,    y: 0,   z: 0 },
      rightForeArm:  { x: 0,    y: 0,   z: 0 },
      rightHand:     { x: 0,    y: 0,   z: 0 },
      leftUpLeg:     { x: 0,    y: 0,   z: 0 },
      leftLeg:       { x: 0,    y: 0,   z: 0 },
      rightUpLeg:    { x: 0,    y: 0,   z: 0 },
      rightLeg:      { x: 0,    y: 0,   z: 0 },
    },
  },

  tpose: {
    label: 'T-Pose',
    icon: '🙆',
    rotations: {
      hips:          { x: 0,    y: 0,   z: 0 },
      spine:         { x: 0,    y: 0,   z: 0 },
      spine2:        { x: 0,    y: 0,   z: 0 },
      neck:          { x: 0,    y: 0,   z: 0 },
      head:          { x: 0,    y: 0,   z: 0 },
      leftArm:       { x: 0,    y: 0,   z: 90 },  // 左臂平举
      leftForeArm:   { x: 0,    y: 0,   z: 0 },
      leftHand:      { x: 0,    y: 0,   z: 0 },
      rightArm:      { x: 0,    y: 0,   z: -90 }, // 右臂平举
      rightForeArm:  { x: 0,    y: 0,   z: 0 },
      rightHand:     { x: 0,    y: 0,   z: 0 },
      leftUpLeg:     { x: 0,    y: 0,   z: 0 },
      leftLeg:       { x: 0,    y: 0,   z: 0 },
      rightUpLeg:    { x: 0,    y: 0,   z: 0 },
      rightLeg:      { x: 0,    y: 0,   z: 0 },
    },
  },

  sit: {
    label: '坐下',
    icon: '🪑',
    rotations: {
      hips:          { x: -15,  y: 0,   z: 0 },
      spine:         { x: 5,    y: 0,   z: 0 },
      spine2:        { x: 5,    y: 0,   z: 0 },
      neck:          { x: 5,    y: 0,   z: 0 },
      head:          { x: 5,    y: 0,   z: 0 },
      leftArm:       { x: 0,    y: 0,   z: 30 },
      leftForeArm:   { x: 80,   y: 0,   z: 0 },
      rightArm:      { x: 0,    y: 0,   z: -30 },
      rightForeArm:  { x: 80,   y: 0,   z: 0 },
      leftUpLeg:     { x: -90,  y: 0,   z: 5 },  // 大腿水平
      leftLeg:       { x: 90,   y: 0,   z: 0 },  // 小腿垂直
      rightUpLeg:    { x: -90,  y: 0,   z: -5 },
      rightLeg:      { x: 90,   y: 0,   z: 0 },
    },
  },

  raiseLeft: {
    label: '举左手',
    icon: '🙋',
    rotations: {
      hips:          { x: 0,    y: 0,   z: 0 },
      spine:         { x: 0,    y: 5,   z: 3 },
      leftShoulder:  { x: 0,    y: 0,   z: 10 },
      leftArm:       { x: 155,  y: 0,   z: 45 }, // 左臂高举过头
      leftForeArm:   { x: 5,    y: 0,   z: 0 },
      leftHand:      { x: 0,    y: 0,   z: 0 },
      rightArm:      { x: 0,    y: 0,   z: -15 },
      rightForeArm:  { x: 20,   y: 0,   z: 0 },
      leftUpLeg:     { x: 0,    y: 0,   z: 3 },
      rightUpLeg:    { x: 0,    y: 0,   z: -3 },
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// 5. PoseManager 类
// ─────────────────────────────────────────────────────────────────

export class PoseManager {
  /**
   * @param {THREE.Bone[]} bones - 由 ModelLoader 提取的骨骼数组
   */
  constructor(bones) {
    /** @type {Map<string, THREE.Bone>} 标准关节键 → Bone 实例 */
    this.boneMap = new Map();

    /** @type {Map<string, {x,y,z}>} 当前每个关节的旋转值（度） */
    this.currentRotations = new Map();

    /**
     * @type {Map<string, {x,y,z}>}
     * 模型加载时各骨骼的原始旋转值（度）。
     * 预置姿态 rotations 中的值会叠加在此基础上，
     * 从而与模型自身的 rest pose 兼容。
     */
    this._initialRotations = new Map();

    /** @type {Map<string, ReturnType<setTimeout>>} 过渡动画计时器 */
    this._tweens = new Map();

    // 执行骨骼映射
    this._mapBones(bones);
    // 记录初始旋转（必须在 _mapBones 之后）
    this._captureInitial();

    console.info(`[PoseManager] 初始化完成 | 已映射 ${this.boneMap.size} / ${Object.keys(BONE_NAME_MAP).length} 个关节`);
    if (this.boneMap.size === 0) {
      console.warn('[PoseManager] ⚠️ 未找到任何标准关节。请检查模型骨骼命名是否在 BONE_NAME_MAP 中。');
    }
  }

  /**
   * 设置指定关节的旋转（单位：度），带解剖学约束
   * @param {string} jointKey  - 标准关节键，如 'leftArm'
   * @param {'x'|'y'|'z'} axis
   * @param {number} degrees
   */
  setJointRotation(jointKey, axis, degrees) {
    const bone = this.boneMap.get(jointKey);
    if (!bone) return;

    // 注意：constraints 在 Slider 的 min/max 上已经强制，
    // 这里对内部调用（如预置过渡）不再 clamp，
    // 避免 rest pose 偏移叠加后超出旧约束范围导致姿态被截断。
    const value = degrees;

    // 写入 THREE.Bone 局部旋转（弧度）
    bone.rotation[axis] = THREE.MathUtils.degToRad(value);

    // 更新内部状态
    const rot = this.currentRotations.get(jointKey) ?? { x: 0, y: 0, z: 0 };
    rot[axis] = value;
    this.currentRotations.set(jointKey, rot);
  }

  /**
   * 获取指定关节当前旋转值（度）
   * @param {string} jointKey
   * @param {'x'|'y'|'z'} axis
   * @returns {number}
   */
  getJointRotation(jointKey, axis) {
    return this.currentRotations.get(jointKey)?.[axis] ?? 0;
  }

  /**
   * 获取关节的旋转限位
   * @param {string} jointKey
   * @param {'x'|'y'|'z'} axis
   * @returns {[number, number]}
   */
  getConstraint(jointKey, axis) {
    return JOINT_CONSTRAINTS[jointKey]?.[axis] ?? [-180, 180];
  }

  /**
   * 平滑过渡到预置姿态
   * @param {string}   presetKey  - 预置名称，如 'sit'
   * @param {number}   [duration] - 过渡时长（毫秒）
   * @param {Function} [onDone]   - 完成回调
   */
  applyPreset(presetKey, duration = 600, onDone) {
    const preset = POSE_PRESETS[presetKey];
    if (!preset) {
      console.warn(`[PoseManager] 未找到预置姿态: ${presetKey}`);
      return;
    }

    console.info(`[PoseManager] 应用预置: ${preset.label}`);

    // 取消所有进行中的过渡
    this._tweens.forEach(id => clearInterval(id));
    this._tweens.clear();

    const FPS      = 60;
    const steps    = Math.round((duration / 1000) * FPS);
    let   step     = 0;

    // 记录起始旋转
    const startRots = {};
    for (const jointKey of Object.keys(preset.rotations)) {
      const cur = this.currentRotations.get(jointKey) ?? { x: 0, y: 0, z: 0 };
      startRots[jointKey] = { ...cur };
    }

    const timerId = setInterval(() => {
      step++;
      // 使用 easeInOutCubic 缓动
      const t = this._easeInOutCubic(step / steps);

      for (const [jointKey, deltaRot] of Object.entries(preset.rotations)) {
        const start   = startRots[jointKey];
        // 目标值 = 模型原始 rest pose + 预置增量
        // 这样无论模型本身骨骼有无初始偏转，姿态都是正确的
        const initial = this._initialRotations.get(jointKey) ?? { x: 0, y: 0, z: 0 };
        for (const axis of ['x', 'y', 'z']) {
          const from = start[axis]        ?? initial[axis] ?? 0;
          const to   = (initial[axis] ?? 0) + (deltaRot[axis] ?? 0);
          this.setJointRotation(jointKey, axis, from + (to - from) * t);
        }
      }

      if (step >= steps) {
        clearInterval(timerId);
        this._tweens.delete('preset');
        onDone?.();
      }
    }, 1000 / FPS);

    this._tweens.set('preset', timerId);
  }

  /**
   * 重置所有关节到模型原始的 rest pose（加载时记录的初始旋转）
   * 不依赖任何预置，直接从 _initialRotations 读取目标值
   * @param {number} [duration]
   * @param {Function} [onDone]
   */
  resetToInitial(duration = 400, onDone) {
    this._tweens.forEach(id => clearInterval(id));
    this._tweens.clear();

    const FPS   = 60;
    const steps = Math.round((duration / 1000) * FPS);

    // ★ duration=0 时直接同步执行，不用 setInterval
    if (steps <= 0) {
      for (const [jointKey, initRot] of this._initialRotations) {
        for (const axis of ['x', 'y', 'z']) {
          this.setJointRotation(jointKey, axis, initRot[axis] ?? 0);
        }
      }
      onDone?.();
      return;
    }

    let step = 0;

    // 记录当前各关节起始旋转
    const startRots = {};
    for (const [jointKey] of this._initialRotations) {
      const cur = this.currentRotations.get(jointKey) ?? { x: 0, y: 0, z: 0 };
      startRots[jointKey] = { ...cur };
    }

    const timerId = setInterval(() => {
      step++;
      const t = this._easeInOutCubic(step / steps);

      for (const [jointKey, initRot] of this._initialRotations) {
        const start = startRots[jointKey];
        for (const axis of ['x', 'y', 'z']) {
          const from = start[axis]   ?? 0;
          const to   = initRot[axis] ?? 0;
          this.setJointRotation(jointKey, axis, from + (to - from) * t);
        }
      }

      if (step >= steps) {
        clearInterval(timerId);
        this._tweens.delete('reset');
        onDone?.();
      }
    }, 1000 / FPS);

    this._tweens.set('reset', timerId);
  }

  // ── 私有方法 ──────────────────────────────────────────────────────

  /**
   * 遍历骨骼数组，按 BONE_NAME_MAP 建立映射
   * @private
   */
  _mapBones(bones) {
    // 建立骨骼名称索引（骨骼名 → Bone 实例），O(1) 查找
    const boneIndex = new Map();
    for (const bone of bones) {
      boneIndex.set(bone.name, bone);
      // 同时索引小写版本，提高容错
      boneIndex.set(bone.name.toLowerCase(), bone);
    }

    for (const [jointKey, nameVariants] of Object.entries(BONE_NAME_MAP)) {
      for (const name of nameVariants) {
        const bone = boneIndex.get(name) ?? boneIndex.get(name.toLowerCase());
        if (bone) {
          this.boneMap.set(jointKey, bone);
          break; // 找到第一个匹配即停止
        }
      }
    }
  }

  /**
   * 记录模型加载完成时的初始旋转值（度）
   * 用于"重置"功能
   * @private
   */
  _captureInitial() {
    const nonZeroJoints = [];
    for (const [jointKey, bone] of this.boneMap) {
      const rot = {
        x: THREE.MathUtils.radToDeg(bone.rotation.x),
        y: THREE.MathUtils.radToDeg(bone.rotation.y),
        z: THREE.MathUtils.radToDeg(bone.rotation.z),
      };
      // currentRotations：跟踪运行时变化
      this.currentRotations.set(jointKey, { ...rot });
      // _initialRotations：永不改变，作为 rest pose 基准
      this._initialRotations.set(jointKey, { ...rot });

      // 调试：检测初始旋转是否接近 0（bind pose 应接近全零）
      const mag = Math.abs(rot.x) + Math.abs(rot.y) + Math.abs(rot.z);
      if (mag > 1) nonZeroJoints.push(`${jointKey}(x:${rot.x.toFixed(1)} y:${rot.y.toFixed(1)} z:${rot.z.toFixed(1)})`);
    }
    if (nonZeroJoints.length > 0) {
      console.warn('[PoseManager] 以下关节初始旋转非零: ' + nonZeroJoints.join(', '));
    } else {
      console.info('[PoseManager] bind pose 正常，所有关节初始旋转接近零');
    }
  }

  /**
   * 应用解剖学约束并 clamp 值
   * @private
   */
  _clamp(jointKey, axis, degrees) {
    const constraint = JOINT_CONSTRAINTS[jointKey];
    if (!constraint?.[axis]) return degrees;
    const [min, max] = constraint[axis];
    return Math.max(min, Math.min(max, degrees));
  }

  /**
   * easeInOutCubic 缓动函数
   * @param {number} t - 0 到 1
   * @returns {number}
   * @private
   */
  _easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}