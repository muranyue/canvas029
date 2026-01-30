# 图像节点胶囊体功能添加

## 问题
图像节点（TextToImageNode）在桌面端应该有胶囊体功能，但之前使用的是普通 textarea，不支持胶囊体插入。

## 解决方案

### 1. 添加 ContentEditablePromptInput 组件

为图像节点创建了简化版的 ContentEditablePromptInput 组件，支持：
- 富文本编辑
- 胶囊体（chip）插入和显示
- 纯文本提取
- 粘贴处理

### 2. 添加 insertImageToken 函数

```typescript
const insertImageToken = (index: number) => {
    const url = inputs[index] || '';
    const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url);
    const token = isVideo ? `@Video ${index + 1}` : `@Image ${index + 1}`;
    
    if (inputRef.current) {
        inputRef.current.insertText(token);
    } else {
        const currentPrompt = data.prompt || '';
        updateData(data.id, { prompt: currentPrompt + token });
    }
};
```

### 3. 添加胶囊体按钮

在输入框下方添加了胶囊体插入按钮，与视频节点保持一致：

```typescript
{inputs.length > 0 && (
    <div className="flex justify-end gap-1.5 mt-2" data-interactive="true">
        {inputs.map((src, i) => {
            const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(src);
            return (
                <button 
                    onClick={() => insertImageToken(i)}
                    onTouchEnd={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        insertImageToken(i); 
                    }}
                    data-interactive="true"
                >
                    <span>{isVideo ? `@Video ${i + 1}` : `@Image ${i + 1}`}</span>
                    <Icons.ArrowRightLeft size={10} />
                </button>
            );
        })}
    </div>
)}
```

## 功能特性

### ContentEditablePromptInput 组件

1. **胶囊体渲染**
   - 紫色背景 (`bg-purple-500/20`)
   - 紫色边框 (`border-purple-500/30`)
   - 紫色文字 (`text-purple-400`)
   - 不可编辑 (`contenteditable="false"`)

2. **文本解析**
   - 自动识别 `@Image n` 和 `@Video n` 格式
   - 支持中文格式 `@图片n` 和 `@视频n`
   - 将匹配的文本转换为胶囊体

3. **事件处理**
   - `onTouchStart`: 阻止事件传播
   - `onMouseDown`: 阻止事件传播
   - `onWheel`: 阻止画布缩放
   - `onKeyDown`: 阻止节点删除

4. **粘贴处理**
   - 只粘贴纯文本
   - 防止格式污染

## 使用方法

### 桌面端
1. 将图像或视频节点连接到图像节点
2. 输入框下方会显示胶囊体按钮（如 `@Image 1`）
3. 点击按钮，胶囊体会插入到输入框中
4. 胶囊体显示为紫色圆角标签
5. 可以在胶囊体前后输入文字

### 移动端
1. 操作方式与桌面端相同
2. 点击胶囊体按钮会触发 `onTouchEnd` 事件
3. 输入框支持触摸输入

## 胶囊体格式

### 显示格式
```
@Image 1  @Image 2  @Video 1
```

### HTML 结构
```html
<span 
    class="inline-flex items-center justify-center h-5 px-1.5 mx-0.5 my-0.5 
           rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 
           font-bold text-[10px] align-middle select-none chip transform translate-y-[-1px]" 
    contenteditable="false" 
    data-value="@Image 1"
>
    @Image 1
</span>
```

## 与视频节点的区别

### 相同点
- 都使用 ContentEditablePromptInput
- 都支持胶囊体插入
- 胶囊体样式相同
- 按钮布局相同

### 不同点
- 图像节点的输入框更简洁（min-h-[70px]）
- 视频节点的输入框更高（min-h-[80px]）
- 视频节点有额外的工具栏（Plot, Start/End 等）

## 技术实现

### 1. 胶囊体 HTML 生成
```typescript
const createChipHtml = (text: string) => {
    return `&nbsp;<span class="..." contenteditable="false" data-value="${text}">${text}</span>&nbsp;`;
};
```

### 2. 文本到 HTML 转换
```typescript
const parseTextToHtml = (text: string) => {
    const regex = /(@(?:Image|Video|图片|视频)(?:\s+)?\d+)/gi;
    return text.split(regex).map(part => {
        if (part.match(regex)) {
            return createChipHtml(part);
        }
        return escapeHtml(part);
    }).join('').replace(/\n/g, '<br>');
};
```

### 3. HTML 到文本提取
```typescript
const getPlainText = (node: Node): string => {
    let text = '';
    node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent?.replace(/\u00A0/g, ' ') || '';
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as HTMLElement;
            if (el.classList.contains('chip')) {
                text += el.dataset.value || '';
            } else if (el.tagName === 'BR') {
                text += '\n';
            } else {
                text += getPlainText(el);
            }
        }
    });
    return text;
};
```

## 测试清单

### 基本功能
- [ ] 添加图像输入后显示胶囊体按钮
- [ ] 点击按钮能插入胶囊体
- [ ] 胶囊体正确显示（紫色样式）
- [ ] 可以在胶囊体前后输入文字
- [ ] 胶囊体不可编辑

### 桌面端
- [ ] 鼠标点击按钮正常工作
- [ ] 键盘输入正常
- [ ] 复制粘贴正常
- [ ] 胶囊体可以被删除（Backspace/Delete）

### 移动端
- [ ] 触摸点击按钮正常工作
- [ ] 虚拟键盘输入正常
- [ ] 胶囊体在移动端正确显示
- [ ] 点击输入框能聚焦

### 多输入测试
- [ ] 多个图像输入显示多个按钮
- [ ] 视频输入显示 @Video 标签
- [ ] 混合输入（图像+视频）正确识别

### 边界情况
- [ ] 没有输入时不显示按钮
- [ ] 输入框为空时显示占位符
- [ ] 长文本正常换行
- [ ] 多个胶囊体正常排列

## 修改的文件

- `canvas029/components/Nodes/TextToImageNode.tsx`
  - 添加 ContentEditablePromptInput 组件
  - 添加 insertImageToken 函数
  - 替换 textarea 为 ContentEditablePromptInput
  - 添加胶囊体按钮

## 相关文档

- `MOBILE_COMPLETE_FIX.md` - 移动端完整修复
- `IMAGE_NODE_CHIP_FIX.md` - 图像节点胶囊体功能（本文件）
