# True-Mem Viewer 视觉升级方案

## 设计理念（Ilya 视角）

**简洁、本质、高信息密度** - 去除装饰，突出数据，优化认知负荷。

---

## 1. 配色方案升级

### 当前配色
- 主色：Mint Green (#34d399)
- 背景：Slate 950 (#020617)
- 边框：White 10% opacity

### 新配色方案（深色主题优化）
```js
// tailwind.config.cjs
colors: {
  // 主色调 - 保留 mint 但增加层次
  mint: {
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',  // 主色
    500: '#10b981',
    600: '#059669',
  },
  // 新增：强调色（用于重要信息）
  accent: {
    blue: '#60a5fa',    // 信息
    purple: '#a78bfa',  // 会话
    amber: '#fbbf24',   // 警告
    rose: '#fb7185',    // 错误/删除
  },
  // 背景层次
  dark: {
    950: '#020617',  // 主背景
    900: '#0f172a',  // 卡片背景
    800: '#1e293b',  // 悬停背景
  },
}
```

### 应用规则
- **主色 mint-400**: 主要按钮、活跃标签、强调文本
- **accent.purple**: 会话相关元素
- **accent.blue**: 记忆相关元素
- **accent.amber**: 统计数据
- **accent.rose**: 删除/危险操作

---

## 2. 图标系统

### 图标映射
```tsx
import {
  Database,      // 记忆列表
  Users,         // 会话
  BarChart3,     // 数据统计
  Activity,      // 运行监控
  Settings,      // 设置
  ChevronDown,   // 展开
  ChevronRight,  // 收起
  Clock,         // 时间
  Zap,           // 强度/相关性
  Tag,           // 分类
  Archive,       // 存储
  Search,        // 搜索
  Filter,        // 筛选
  RefreshCw,     // 刷新
  Trash2,        // 删除
  RotateCcw,     // 恢复
} from 'lucide-preact';
```

### 使用原则
- 图标 + 文字（移动端仅图标）
- 统一尺寸：16px（小）、20px（中）、24px（大）
- 统一颜色：继承父元素 text color

---

## 3. 动画系统

### Tailwind Transitions
```css
/* 全局动画配置 */
.transition-smooth {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.transition-expand {
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
}
```

### 动画场景
1. **标签切换**: `transition-smooth` + opacity
2. **卡片展开**: `transition-expand` + max-height
3. **悬停效果**: `hover:bg-dark-800 transition-smooth`
4. **按钮点击**: `active:scale-95 transition-smooth`
5. **加载状态**: `animate-pulse`

---

## 4. 组件重设计

### 4.1 标签导航
**当前**: 纯文字按钮
**升级**: 图标 + 文字 + 动画

```tsx
<button class="group flex items-center gap-2 rounded-full px-4 py-2 transition-smooth
  ${active ? 'bg-mint-400 text-dark-950' : 'border border-white/10 text-slate-300 hover:bg-dark-800'}">
  <Database size={20} class="transition-smooth group-hover:scale-110" />
  <span>记忆列表</span>
</button>
```

### 4.2 记忆卡片
**当前**: 单层卡片
**升级**: 分层设计 + 视觉层次

```tsx
<article class="group rounded-2xl border border-white/10 bg-gradient-to-br from-dark-900 to-dark-950
  hover:border-mint-400/30 transition-smooth shadow-lg hover:shadow-mint-400/10">
  {/* 主要信息 */}
  <div class="p-4">
    <div class="flex items-start gap-3">
      <Tag size={16} class="text-accent-blue mt-1" />
      <p class="flex-1 text-slate-100">{summary}</p>
      <span class="text-xs text-slate-500">{strength}</span>
    </div>
  </div>
  
  {/* 展开详情 */}
  {expanded && (
    <div class="border-t border-white/5 bg-dark-950/50 p-4 animate-in slide-in-from-top-2">
      {/* 详细信息 */}
    </div>
  )}
</article>
```

### 4.3 筛选器（折叠面板）
**当前**: 横向排列，拥挤
**升级**: 可折叠面板，分组

```tsx
<details class="rounded-2xl border border-white/10 bg-dark-900" open>
  <summary class="flex items-center justify-between p-4 cursor-pointer hover:bg-dark-800 transition-smooth">
    <div class="flex items-center gap-2">
      <Filter size={20} class="text-mint-400" />
      <span class="font-semibold text-white">筛选条件</span>
    </div>
    <ChevronDown size={20} class="text-slate-400 transition-transform group-open:rotate-180" />
  </summary>
  
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border-t border-white/5">
    {/* 筛选项 */}
  </div>
</details>
```

### 4.4 会话时间线
**当前**: 简单列表
**升级**: 时间线视觉 + 连接线

```tsx
<div class="relative pl-8">
  {/* 时间线 */}
  <div class="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-mint-400 to-transparent"></div>
  
  {injections.map((inj, i) => (
    <div class="relative mb-4">
      {/* 时间点 */}
      <div class="absolute left-[-1.75rem] top-2 w-3 h-3 rounded-full bg-mint-400 ring-4 ring-dark-950"></div>
      
      {/* 内容卡片 */}
      <div class="rounded-lg border border-white/5 bg-dark-900 p-3 hover:border-mint-400/30 transition-smooth">
        <p class="text-sm text-slate-200">{inj.memorySummary}</p>
        <div class="mt-2 flex items-center gap-3 text-xs text-slate-500">
          <span class="flex items-center gap-1">
            <Tag size={12} /> {inj.classification}
          </span>
          <span class="flex items-center gap-1">
            <Zap size={12} /> {inj.relevanceScore?.toFixed(2)}
          </span>
          <span class="flex items-center gap-1">
            <Clock size={12} /> {formatTime(inj.injectedAt)}
          </span>
        </div>
      </div>
    </div>
  ))}
</div>
```

---

## 5. 响应式优化

### 断点策略
- **sm (640px)**: 单列布局
- **md (768px)**: 双列布局
- **lg (1024px)**: 三列布局
- **xl (1280px)**: 完整布局

### 移动端优化
- 标签导航：仅图标
- 筛选器：默认折叠
- 卡片：全宽显示
- 字体：略微放大（16px → 17px）

---

## 6. 加载与空状态

### 加载状态
```tsx
<div class="flex flex-col items-center justify-center py-12">
  <RefreshCw size={32} class="text-mint-400 animate-spin" />
  <p class="mt-4 text-sm text-slate-400">加载中...</p>
</div>
```

### 空状态
```tsx
<div class="flex flex-col items-center justify-center py-12 text-center">
  <Database size={48} class="text-slate-600" />
  <p class="mt-4 text-lg font-semibold text-slate-300">暂无数据</p>
  <p class="mt-2 text-sm text-slate-500">开始对话后，记忆将出现在这里</p>
</div>
```

---

## 实施优先级

1. **P0 (立即)**: 图标系统 + 基础动画
2. **P1 (核心)**: 配色升级 + 卡片重设计
3. **P2 (优化)**: 筛选器折叠 + 时间线视觉
4. **P3 (增强)**: 响应式优化 + 加载状态

---

## 预期效果

- **视觉层次**: 清晰的信息层级，减少认知负荷
- **交互反馈**: 流畅的动画，明确的状态变化
- **信息密度**: 更多信息，更少空间浪费
- **专业感**: 现代化设计，符合 Ilya 的简洁美学
