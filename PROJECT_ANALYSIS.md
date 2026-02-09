# Canvas029 项目审查报告

> 审查日期：2026-02-09  
> 项目版本：画布030 (v0.0.0)

---

## 一、项目概述

这是一个基于 React 19 + TypeScript + Vite 的可视化 AI 创作画布应用，集成了 Gemini AI 服务，支持文生图、文生视频等功能。项目采用节点式工作流设计，类似于 ComfyUI 或 Figma 的画布交互模式。

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.3 | UI 框架 |
| TypeScript | 5.8.2 | 类型系统 |
| Vite | 6.2.0 | 构建工具 |
| Tailwind CSS | - | 样式方案 |
| Lucide React | 0.562.0 | 图标库 |
| @google/genai | 1.37.0 | AI SDK |

### 项目结构

```
canvas029/
├── App.tsx                    # 主应用组件 (1200+ 行)
├── index.tsx                  # 入口文件
├── types.ts                   # 类型定义
├── components/
│   ├── Canvas.tsx             # 画布组件 (冗余)
│   ├── Sidebar.tsx            # 侧边栏导航
│   ├── Minimap.tsx            # 小地图预览
│   ├── Icons.tsx              # 图标组件
│   ├── ThemeSwitcher.tsx      # 主题切换
│   ├── Nodes/
│   │   ├── BaseNode.tsx       # 节点基础组件
│   │   ├── NodeContent.tsx    # 节点内容路由
│   │   ├── TextToImageNode.tsx
│   │   ├── TextToVideoNode.tsx
│   │   ├── OriginalImageNode.tsx
│   │   ├── CreativeDescNode.tsx
│   │   ├── GroupNode.tsx
│   │   └── Shared/            # 共享组件
│   └── Settings/
│       └── SettingsModal.tsx  # 设置模态框
├── hooks/
│   ├── index.ts               # hooks 导出
│   ├── useCanvasState.ts      # 画布状态管理
│   ├── useNodeOperations.ts   # 节点操作
│   ├── useConnectionManager.ts # 连接管理
│   ├── useClipboard.ts        # 剪贴板
│   ├── useKeyboardShortcuts.ts # 键盘快捷键
│   └── useGrouping.ts         # 分组功能
└── services/
    ├── env.ts                 # 环境配置
    ├── geminiService.ts       # AI 服务入口
    └── mode/
        ├── config.ts          # 模型配置
        ├── network.ts         # 网络请求
        ├── types.ts           # 服务类型
        ├── image/             # 图像生成处理器
        └── video/             # 视频生成处理器
```

---

## 二、功能特性

### 核心功能

- ✅ 节点式工作流画布
- ✅ 文生图 (Text to Image)
- ✅ 文生视频 (Text to Video)
- ✅ 创意描述优化 (Creative Description)
- ✅ 原始图像导入
- ✅ 节点分组
- ✅ 节点连接与数据流

### 交互特性

- ✅ 鼠标拖拽、缩放、平移
- ✅ 触摸屏双指缩放
- ✅ 框选多选
- ✅ 键盘快捷键 (Delete, Ctrl+C, Ctrl+G, 方向键对齐)
- ✅ 右键上下文菜单
- ✅ 拖放导入图片/视频

### UI 特性

- ✅ 深色/浅色主题切换
- ✅ 小地图导航
- ✅ 历史记录面板
- ✅ 工作流保存/加载
- ✅ 响应式布局 (桌面/移动端)

---

## 三、优点分析

### 1. 良好的 Hooks 架构拆分

将复杂的画布逻辑拆分为独立的自定义 hooks：

```typescript
// 状态管理清晰分离
useCanvasState()      // 核心状态
useNodeOperations()   // 节点 CRUD
useConnectionManager() // 连接管理
useClipboard()        // 剪贴板
useKeyboardShortcuts() // 快捷键
useGrouping()         // 分组
```

### 2. 性能优化意识

```typescript
// 视口裁剪 - 只渲染可见节点
const visibleNodes = useMemo(() => {
    const buffer = 200;
    return nodes.filter(node => /* 视口检测 */);
}, [nodes, transform, viewportSize]);

// 自定义 memo 比较 - 避免拖拽时重渲染
export const NodeContent = memo(NodeContentComponent, (prev, next) => {
    if (prev.data === next.data) return true;
    // 排除 x, y 坐标变化
    for (const key of keys) {
        if (key === 'x' || key === 'y') continue;
        if (prev.data[key] !== next.data[key]) return false;
    }
    return true;
});

// 动态防抖持久化
const delay = isGenerating ? 2000 : 1000;
```

### 3. 完善的多端交互支持

同时支持鼠标和触摸操作，iOS 键盘兼容处理：

```typescript
// iOS 专用：防止键盘弹出后被收回
const handleFocus = () => {
    isFocusingRef.current = true;
    setTimeout(() => { isFocusingRef.current = false; }, 300);
};
```

### 4. 灵活的模型配置系统

支持多种 AI 模型，配置可扩展：

```typescript
// 支持的模型
IMAGE: BananaPro, Flux2, Gemini 3...
VIDEO: Sora2, Kling, Hailuo, Veo, Wan, Vidu...
```

### 5. 完整的主题系统

```typescript
const isDark = canvasBg === '#0B0C0E';
const containerBg = isDark ? 'bg-[#18181B]' : 'bg-white';
```

---

## 四、问题与改进建议

### 🔴 高优先级

#### 1. App.tsx 过于臃肿

**问题**：单文件 1200+ 行，包含大量事件处理和渲染逻辑

**建议**：
```
App.tsx (1200行) → 拆分为：
├── App.tsx (~200行)           # 主布局
├── CanvasArea.tsx (~400行)    # 画布区域
├── ContextMenu.tsx            # 右键菜单
├── QuickAddMenu.tsx           # 快速添加菜单
├── NewWorkflowDialog.tsx      # 新建对话框
└── GroupToolbar.tsx           # 分组工具栏
```

#### 2. 重复代码

**问题**：`ContentEditablePromptInput` 在两个文件中完全重复 (200+ 行)

**位置**：
- `TextToImageNode.tsx` 第 20-180 行
- `TextToVideoNode.tsx` 第 30-190 行

**建议**：提取到 `components/Nodes/Shared/ContentEditablePromptInput.tsx`

---

### 🟡 中优先级

#### 3. 类型安全问题

**问题**：字符串字面量代替枚举

```typescript
// ❌ 当前写法 (useCanvasState.ts:35)
if (node.type === 'TEXT_TO_VIDEO')

// ✅ 应该使用
if (node.type === NodeType.TEXT_TO_VIDEO)
```

#### 4. 潜在内存泄漏

**问题**：Image 对象和 Blob URL 未正确清理

```typescript
// ❌ 当前写法
const img = new Image();
img.onload = () => { /* 使用后未清理 */ };

// ✅ 建议
useEffect(() => {
    return () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
}, []);
```

#### 5. 缺少错误边界

**问题**：AI 生成失败可能导致整个应用崩溃

**建议**：添加 Error Boundary

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
    componentDidCatch(error, errorInfo) {
        // 错误上报
    }
    render() {
        if (this.state.hasError) {
            return <ErrorFallback />;
        }
        return this.props.children;
    }
}
```

#### 6. 硬编码值散落

**问题**：魔法数字分散在各处

```typescript
const DEFAULT_NODE_WIDTH = 320;  // useNodeOperations.ts
const DEFAULT_NODE_WIDTH = 360;  // Canvas.tsx (不一致!)
const maxSide = 750;
const buffer = 200;
```

**建议**：集中到 `constants.ts`

---

### 🟢 低优先级

#### 7. Canvas.tsx 冗余文件

**问题**：`components/Canvas.tsx` 是早期版本，与 `App.tsx` 功能重复

**建议**：删除或标记为废弃

#### 8. 缺少测试覆盖

**问题**：项目没有单元测试

**建议优先测试**：
- `useNodeOperations` - 节点 CRUD
- `useConnectionManager` - 连接逻辑
- `calculateImportDimensions` - 尺寸计算

---

## 五、安全建议

### 1. API Key 存储

**当前**：API Key 存储在 localStorage

**风险**：XSS 攻击可窃取密钥

**建议**：
- 开发环境：使用 `.env.local`
- 生产环境：后端代理 API 调用

### 2. XSS 风险

**位置**：`ContentEditablePromptInput` 中的 innerHTML 操作

```typescript
// ⚠️ 需要更严格的输入过滤
divRef.current.innerHTML = parseTextToHtml(value);
```

**建议**：使用 DOMPurify 或类似库过滤

---

## 六、性能优化建议

### 1. 虚拟化长列表

历史记录面板在节点数量多时可能卡顿

```typescript
// 建议使用 react-window
import { FixedSizeGrid } from 'react-window';
```

### 2. Web Worker

AI 生成的轮询逻辑可移至 Web Worker，避免阻塞主线程

### 3. 代码分割

```typescript
// 懒加载非核心组件
const SettingsModal = React.lazy(() => import('./Settings/SettingsModal'));
const Minimap = React.lazy(() => import('./Minimap'));
```

### 4. 图片优化

考虑对历史记录缩略图使用 WebP 格式和渐进式加载

---

## 七、代码质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 9/10 | 功能丰富，交互完善 |
| 代码组织 | 6/10 | App.tsx 过大，存在重复代码 |
| 类型安全 | 7/10 | 基本完善，有少量字符串字面量 |
| 性能优化 | 8/10 | 有优化意识，可进一步提升 |
| 可维护性 | 6/10 | 需要重构拆分 |
| 测试覆盖 | 2/10 | 缺少测试 |
| 安全性 | 6/10 | API Key 存储方式需改进 |

**综合评分：7/10**

---

## 八、重构优先级建议

1. **立即处理**：提取重复的 `ContentEditablePromptInput`
2. **短期**：拆分 App.tsx 为多个组件
3. **中期**：添加 Error Boundary 和核心逻辑测试
4. **长期**：优化 API Key 存储、添加代码分割

---

## 九、总结

Canvas029 是一个功能完整、交互丰富的 AI 画布应用，架构设计合理，hooks 拆分清晰。主要问题集中在代码组织层面，通过重构可以显著提升可维护性。项目具备良好的基础，适合继续迭代开发。
