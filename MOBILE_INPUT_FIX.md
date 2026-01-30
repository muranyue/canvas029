# 移动端输入问题修复

## 修复的问题

### 1. ✅ 标题无法在移动端编辑

**问题原因：**
- 标题使用 `onDoubleClick` 进入编辑模式
- 移动端没有原生的双击事件

**解决方案：**
- 添加自定义双击检测逻辑
- 使用 `onTouchStart` 检测两次快速点击（300ms内）
- 保留桌面端的 `onDoubleClick` 功能

**代码实现：**
```typescript
const lastTapRef = useRef<number>(0);

const handleTap = (e: React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // 双击检测成功
        e.preventDefault();
        setIsEditing(true);
        setEditValue(title);
    }
    lastTapRef.current = now;
};
```

---

### 2. ✅ 输入框无法点击和输入

**问题原因：**
- 输入框缺少 `onTouchStart` 和 `onMouseDown` 事件处理
- 触摸事件被父元素的拖拽逻辑拦截

**解决方案：**

#### TextToImageNode 的 textarea：
```typescript
<textarea 
    onTouchStart={(e) => e.stopPropagation()} 
    onMouseDown={(e) => e.stopPropagation()} 
    data-interactive="true"
/>
```

#### TextToVideoNode 的 ContentEditable：
```typescript
<div 
    onTouchStart={(e) => e.stopPropagation()}
    onMouseDown={(e) => e.stopPropagation()}
    data-interactive="true"
>
    <div contentEditable />
</div>
```

---

### 3. ✅ 图像输入胶囊体（Chip）不显示/无法交互

**问题原因：**
- BaseNode 的过滤逻辑只检查 `target.isContentEditable`
- 这会匹配到 ContentEditable 的子元素（包括 chip），但不会正确识别整个可编辑区域
- Chip 元素虽然有 `contenteditable="false"`，但它的父元素是 contenteditable 的

**解决方案：**
- 改进 BaseNode 的过滤逻辑
- 同时检查元素本身和父元素是否在 contenteditable 区域内
- 使用 `target.closest('[contenteditable]')` 检查整个祖先链

**代码实现：**
```typescript
const isInteractive = 
    target.closest('[data-interactive="true"]') ||
    target.closest('[contenteditable="true"]') ||
    // 检查元素本身或父元素是否是contenteditable
    (target.isContentEditable || target.closest('[contenteditable]'));
```

---

## 修改的文件

1. **LocalNodeComponents.tsx**
   - `LocalEditableTitle`: 添加移动端双击检测

2. **TextToImageNode.tsx**
   - `textarea`: 添加触摸事件处理

3. **TextToVideoNode.tsx**
   - `ContentEditablePromptInput`: 添加容器级别的触摸事件处理

4. **BaseNode.tsx**
   - `handleTouchStartFiltered`: 改进 contenteditable 检测
   - `handleTouchEndFiltered`: 改进 contenteditable 检测
   - `handleClickFiltered`: 改进 contenteditable 检测

---

## 测试清单

### 标题编辑
- [ ] 在移动端快速双击标题能进入编辑模式
- [ ] 编辑后能正常保存
- [ ] 按 Enter 或点击外部能退出编辑
- [ ] 桌面端双击仍然正常工作

### 输入框
- [ ] TextToImage 节点的 textarea 能正常点击和输入
- [ ] TextToVideo 节点的 ContentEditable 能正常点击和输入
- [ ] 输入时不会触发节点拖拽
- [ ] 滚动输入框内容不会缩放画布

### 图像输入胶囊体
- [ ] 点击 "@Image 1" 等按钮能插入胶囊体
- [ ] 胶囊体正确显示（紫色背景，圆角边框）
- [ ] 胶囊体不可编辑（contenteditable="false"）
- [ ] 可以在胶囊体前后输入文字
- [ ] 点击胶囊体不会触发节点拖拽

### 回归测试
- [ ] 节点拖拽仍然正常工作
- [ ] 桌面端所有功能不受影响
- [ ] 其他按钮和控件仍然可点击

---

## 技术要点

### 移动端双击检测模式

```typescript
const lastTapRef = useRef<number>(0);

const handleTap = (e: React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // 双击逻辑
    }
    lastTapRef.current = now;
};
```

### ContentEditable 区域检测

需要同时检查：
1. `target.isContentEditable` - 元素本身是否可编辑
2. `target.closest('[contenteditable]')` - 是否在可编辑区域内
3. `target.closest('[contenteditable="true"]')` - 明确启用的可编辑区域

### 事件传播控制

所有交互元素都需要：
```typescript
onTouchStart={(e) => e.stopPropagation()}
onMouseDown={(e) => e.stopPropagation()}
data-interactive="true"
```

这样可以防止事件冒泡到父元素的拖拽处理器。
