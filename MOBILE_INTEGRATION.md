# 移动端适配集成指南
## PoseRef Studio — Mobile Responsive Update

---

## 📦 新增文件清单

| 文件 | 放置位置 | 说明 |
|------|---------|------|
| `mobile.css` | `public/styles/mobile.css` | 所有移动端样式 |
| `MobileController.js` | `src/ui/MobileController.js` | Bottom Sheet 逻辑 + 触摸控制 |

---

## 🔧 Step 1：引入 CSS

在 `index.html` 所有 `<link>` 标签的**最后**加一行：

```html
<!-- 已有的 CSS -->
<link rel="stylesheet" href="/styles/base.css" />
<link rel="stylesheet" href="/styles/ui.css" />
<link rel="stylesheet" href="/styles/panel.css" />
<link rel="stylesheet" href="/styles/animations.css" />
<link rel="stylesheet" href="/styles/pose.css" />
<link rel="stylesheet" href="/styles/lighting.css" />
<link rel="stylesheet" href="/styles/advanced.css" />
<link rel="stylesheet" href="/styles/material.css" />
<link rel="stylesheet" href="/styles/area_light.css" />
<link rel="stylesheet" href="/styles/help.css" />

<!-- ★ 新增：移动端响应式（必须放在最后，保证覆盖优先级） -->
<link rel="stylesheet" href="/styles/mobile.css" />
```

---

## 🔧 Step 2：集成 MobileController.js

在 `src/main.js` 顶部 import 区域加入：

```js
import { MobileController } from './ui/MobileController.js';
```

在 OrbitControls 初始化之后（大约在你 `new OrbitControls(...)` 的那几行之后），添加：

```js
// ── 初始化移动端控制器 ──
const mobileController = new MobileController(controls); // controls 是你的 OrbitControls 实例
```

在模型加载成功的回调里（`ModelLoader` 或 `GLTFLoader` 的 `onLoad`），调用：

```js
// 模型加载完毕，通知移动端同步面板内容
mobileController.onModelLoaded();
```

---

## 🔧 Step 3：OrbitControls 触摸手势配置

在 `main.js` 里找到你的 OrbitControls 初始化代码，补充触摸配置：

```js
import { TOUCH } from 'three/examples/jsm/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);

// ★ 移动端触摸手势
controls.touches = {
  ONE: TOUCH.ROTATE,      // 单指旋转
  TWO: TOUCH.DOLLY_PAN,   // 双指缩放 + 三指平移
};

// 防止移动端 pinch-zoom 页面
controls.enableZoom = true;
controls.zoomSpeed  = 0.8;
```

---

## 🎨 效果说明

### 排版精修（所有设备）
- `slider-value` 固定宽度 36px + `tabular-nums`，数值 0→100 变化时**标签不再跳位**
- Section 标题 `letter-spacing: 0.12em`，增加呼吸感
- 所有字号统一，层级清晰

### 手机端 (≤768px)
- 左侧面板自动隐藏，画布铺满全屏
- 底部 **Bottom Sheet** 毛玻璃面板，高度约 38vh
- 顶部手柄 + 右侧箭头按钮，一键收起/展开
- 四个 Tab：**姿态 · 光照 · 材质 · 视角**
- 收起后仅露出 48px 手柄，全屏观察模型

### 触摸优化
- 所有按钮最小点击区域 **44×44pt**（Apple HIG 标准）
- Slider 高度增加到 28px，thumb 加大
- `touch-action: pan-x` 防止 slider 触发 sheet 纵向滚动
- Canvas 区域 `touch-action: none`，OrbitControls 完整接管手势
- Bottom Sheet 内触摸事件不穿透到画布（`stopImmediatePropagation`）

### iOS 安全区域
- 自动适配刘海屏 / Dynamic Island（`env(safe-area-inset-*)`）

---

## ⚠️ 注意事项

1. **MobileController 的 `mirrorLivePanels()`** 会把 `#pose-controls-container`、`#lighting-controls-container`、`#material-controls-container` 的 DOM 节点**直接迁移**到 Sheet 内（而非克隆），这样事件监听器完整保留。迁移后桌面端对应容器为空，但因为 `.panel--left` 在移动端已被隐藏，所以无影响。

2. 如果你的项目使用了 **Vite HMR**，热更新时 Bottom Sheet 可能需要手动刷新页面重新初始化。开发时可临时在 `MobileController._setup()` 最后添加 `console.log('[Mobile] Sheet initialized')` 来确认初始化成功。

3. 如果 `OrbitControls` 版本较旧（Three.js r120 以前），`TOUCH` 常量的导入路径可能略有不同，请改为：
   ```js
   import * as THREE from 'three';
   controls.touches = {
     ONE: THREE.TOUCH.ROTATE,
     TWO: THREE.TOUCH.DOLLY_PAN,
   };
   ```