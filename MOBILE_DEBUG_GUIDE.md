# 移动端功能区点击问题调试指南

## 🔍 问题描述

移动端节点拖拽正常，但功能区（控制面板）的按钮、下拉菜单、输入框点击无效。

## 🧪 调试步骤

### 1. 检查事件传播

在浏览器控制台运行：

```javascript
// 监听所有 touchstart 事件
document.addEventListener('touchstart', (e) => {
  console.log('Touch target:', e.target);
  console.log('Has data-interactive:', e.target.closest('[data-interactive="true"]'));
  console.log('Is in control panel:', e.target.closest('.absolute.top-full'));
}, true);
```

**预期结果**：
- 点击功能区时，应该显示 `Has data-interactive: true`
- 点击控制面板时，应该显示 `Is in control panel: true`

---

### 2. 检查 z-index 层级

在控制台运行：

```javascript
// 检查控制面板的 z-index
const controlPanel = document.querySelector('.absolute.top-full');
if (controlPanel) {
  const styles = window.getComputedStyle(controlPanel);
  console.log('Control panel z-index:', styles.zIndex);
  console.log('Control panel pointer-events:', styles.pointerEvents);
}
```

**预期结果**：
- `z-index: 70` 或更高
- `pointer-events: auto`

---

### 3. 检查元素是否被遮挡

```javascript
// 点击位置检测
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  const element = document.elementFromPoint(touch.clientX, touch.clientY);
  console.log('Element at touch point:', element);
  console.log('Element classes:', element.className);
}, true);
```

**预期结果**：
- 点击按钮时，应该返回按钮元素
- 不应该返回节点主框元素

---

### 4. 检查 stopPropagation 调用

在 `App.tsx` 的 `handleNodeTouchStart` 开头添加日志：

```typescript
const handleNodeTouchStart = (e: React.TouchEvent, id: string) => {
  console.log('handleNodeTouchStart called');
  console.log('Target:', e.target);
  
  const target = e.target as HTMLElement;
  const isExcluded = target.closest('[data-interactive="true"]') ||
                     target.closest('.absolute.top-full') ||
                     target.closest('.absolute.bottom-full') ||
                     // ...
  
  console.log('Is excluded:', isExcluded);
  
  if (isExcluded) {
    console.log('Excluded - returning early');
    return;
  }
  
  // ...
}
```

**预期结果**：
- 点击功能区时，应该显示 `Is excluded: true`
- 应该显示 `Excluded - returning early`
- 不应该继续执行拖拽逻辑

---

## 🔧 可能的问题和解决方案

### 问题1: 功能区元素没有 pointer-events

**症状**: 点击功能区没有任何反应

**检查**:
```javascript
const buttons = document.querySelectorAll('.absolute.top-full button');
buttons.forEach(btn => {
  console.log('Button pointer-events:', window.getComputedStyle(btn).pointerEvents);
});
```

**解决方案**: 确保所有交互元素有 `pointer-events: auto`

---

### 问题2: z-index 层级问题

**症状**: 功能区被节点主框遮挡

**检查**:
```javascript
const mainFrame = document.querySelector('[data-drag-handle="true"]');
const controlPanel = document.querySelector('.absolute.top-full');

console.log('Main frame z-index:', window.getComputedStyle(mainFrame).zIndex);
console.log('Control panel z-index:', window.getComputedStyle(controlPanel).zIndex);
```

**解决方案**: 
- 控制面板 z-index 应该 > 节点主框 z-index
- 当前设置：控制面板 `z-[70]`，主框应该更低

---

### 问题3: 事件被 BaseNode 拦截

**症状**: `handleNodeTouchStart` 被调用，但没有正确排除功能区

**检查**: 在 `handleNodeTouchStart` 中添加日志（见上面第4步）

**解决方案**: 
1. 确保排除逻辑正确
2. 确保功能区有正确的标记属性
3. 不要在排除区域调用 `e.stopPropagation()`

---

### 问题4: 功能区元素缺少标记属性

**症状**: 排除逻辑无法识别功能区元素

**检查**:
```javascript
// 检查控制面板是否有正确的类名和属性
const controlPanel = document.querySelector('.absolute.top-full');
console.log('Has data-interactive:', controlPanel?.hasAttribute('data-interactive'));
console.log('Classes:', controlPanel?.className);
```

**解决方案**: 确保控制面板有：
- `data-interactive="true"` 属性
- `.absolute.top-full` 类名
- `pointer-events-auto` 类名

---

## 📋 检查清单

在移动端测试前，确认以下内容：

- [ ] 控制面板有 `data-interactive="true"` 属性
- [ ] 控制面板有 `onTouchStart={(e) => e.stopPropagation()}`
- [ ] 控制面板有 `pointer-events-auto` 类
- [ ] 控制面板有 `z-[70]` 或更高的 z-index
- [ ] `handleNodeTouchStart` 中的排除逻辑包含所有必要的检查
- [ ] 排除区域不调用 `e.stopPropagation()`
- [ ] 所有按钮和输入框有 `data-interactive="true"` 属性

---

## 🎯 快速修复尝试

如果功能区仍然无法点击，尝试以下修改：

### 方案1: 增加控制面板的 z-index

```typescript
// TextToImageNode.tsx
<div className="absolute top-full ... z-[100]" ...>
```

### 方案2: 确保控制面板不在主框内部

检查 DOM 结构，控制面板应该是：
```html
<BaseNode>
  <div data-drag-handle="true">
    <!-- 节点主框内容 -->
  </div>
</BaseNode>
<!-- 控制面板应该在这里，不在 BaseNode 内部 -->
<div class="absolute top-full">
  <!-- 控制面板 -->
</div>
```

### 方案3: 添加触摸事件捕获

```typescript
// 在控制面板上添加
onTouchStartCapture={(e) => {
  console.log('Control panel touched');
  e.stopPropagation();
}}
```

---

## 📱 实际测试步骤

1. 打开移动端浏览器
2. 打开开发者工具（如果可能）
3. 创建一个节点
4. 选中节点（轻触主框）
5. 尝试点击控制面板中的按钮
6. 查看控制台日志
7. 根据日志判断问题所在

---

**版本**: v1.0  
**日期**: 2026-01-30
