# InkSight Design System — "Paper & Ink"（纸墨）

> 生成于 2026-09 的整体 UI 重设计。本文件是视觉决策的 Source of Truth；
> 实现层唯一入口是 `src/styles/themes.css`（token 层）。

## 1. 设计理念

InkSight 是"阅读 → 捕获 → 连接"的知识工作台。界面应像一张安静的书桌：

- **纸（Paper）**：暖色纸感背景承载阅读面，柔和不刺眼，呼应"墨水书"的气质。
- **墨（Ink）**：文字层级用墨色深浅表达；主操作色是"墨蓝"——钢笔水的深蓝。
- **克制**：停靠式扁平面板 + 发丝线（hairline）分隔，不用玻璃拟态、不用重阴影；
  阴影只给真正浮起的东西（搜索面板、弹窗、浮动工具条）。

## 2. Token 体系（themes.css）

命名规则（组件 CSS 只允许消费这些语义 token，禁止硬编码色值）：

| 前缀 | 用途 |
|---|---|
| `--paper-canvas / surface / raised / hover / active` | 背景层级：应用画布 → 面板 → 卡片/浮层 → 悬停 → 按下 |
| `--ink-strong / body / muted / faint / inverse` | 文字层级：标题 → 正文 → 次要 → 弱化 → 反色 |
| `--line / line-strong` | 发丝线边框 / 强调边框 |
| `--brand / brand-strong / brand-soft / brand-soft-strong` | 主操作色（墨蓝）及其悬停、柔和底 |
| `--gold / gold-strong / gold-soft / gold-soft-strong` | 次强调（琥珀）：捕获、警告、恢复类操作 |
| `--ok / warn / danger` | 状态色 |
| `--reader-bg` | 文档阅读面（PDF/EPUB 周围的画布） |
| `--radius-xs/sm/md/lg/xl/full` | 圆角：6/8/10/14/20/999 |
| `--motion-fast/base/slow` + `--ease-out` | 动效：120/180/280ms |
| `--shadow-1/2/3` | 阴影仅三档：卡片、浮层、模态 |

兼容层：旧规则消费的 `--bg-* / --text-* / --border / --primary / --accent* /
--surface-* / --tint-* / --warn-*` 等变量在 themes.css 中统一映射到上述 token，
组件无需逐一改写。

## 3. 六套主题

| 主题 | 气质 | Brand |
|---|---|---|
| `default` | 纸（暖白纸感，默认主题） | 墨蓝 #1D4ED8 |
| `colorful` | 纸 + 青碧 | Teal #0F766E |
| `soft` | 冷灰纸 | 靛蓝 #2B6CB0 |
| `retro` | 羊皮纸 | 皮革棕 #7A5C2E |
| `dark` | 墨夜（暖炭黑） | 天蓝 #8AB0F8 |
| `starry` | 深海蓝夜 | 天蓝 #6FB1FF |

暗色主题下 PDF 页面保持反相可读（themes.css 中的 filter 规则）。

## 4. 字体

- UI：`--font-ui` = Inter（Google Fonts，离线回退 system-ui）
- 展示/品牌：`--font-display` = Manrope（wordmark、标题）
- 阅读：`--font-reading` = Noto Serif SC（衬线，正文阅读场景）
- 最小字号 10px（仅限 uppercase 元信息标签），正文 ≥12px，UI 文本 ≥13px。

## 5. 布局原则

- **停靠式工作区**：`#app-layout` 无 gap、无 padding；侧边栏/笔记面板与阅读区
  以 1px 发丝线相接，圆角为 0。结构感来自线条，不来自间隙和阴影。
- 顶栏高度 `--header-height: 52px`，三段式（左侧视图工具 / 中部文档标题+模式切换 / 右侧面板工具）。
- 模式切换器（Read/Capture/Map）：胶囊分段控件，激活项浮起（raised 底 + shadow-1 + brand-strong 文字）。
- 浮动元素（页面导航、选择工具条）：raised 白底 + line 边框 + shadow-2，圆角 full。
- 激活文件项：brand-soft 底 + 左侧 2px brand 内嵌条（inset box-shadow）。
- 弹窗/通知浮层可用 shadow-3；其余平面一律不用阴影。

## 6. 图标

主 UI 统一 Material Icons Round（`<span class="material-icons-round">`）；
白板内部（drawnix）使用其自带 SVG 图标体系，不强制混改。

## 7. 反模式（不要做）

- ❌ 组件 CSS 硬编码十六进制色值 / rgba 主色（一律用 token）
- ❌ 玻璃拟态 backdrop-filter 大面积使用
- ❌ 9px 以下正文、灰色叠灰色的低对比文本
- ❌ emoji 当图标
- ❌ 给停靠面板加圆角或投影（破坏停靠感）

## 8. 样式加载顺序（关键约束）

三份全局 CSS 只能由 `index.html` 的 `<link>` 按以下顺序加载：

1. `styles.css`（基础组件）
2. `themes.css`（token 层）
3. `workspace-ui.css`（外壳皮肤，**最终胜出者**）

**禁止在 JS 中 `import` 这三个文件**：dev 模式下 Vite 会把 JS 导入的 CSS
以 `<style>` 注入到 `<link>` 之后，使 styles.css 的旧规则反向覆盖
workspace-ui.css（历史上导致过批注控制区三列挤压、项目主页旧渐变复现）。
构建产物会把三个 link 合并为单文件，所以这类 bug 只在 dev 出现——
排查样式"改了不生效"时先查这里。

## 9. 交付前检查

- [ ] 明暗主题下正文对比度 ≥ 4.5:1
- [ ] 所有可点击元素有 hover + focus-visible 态
- [ ] `prefers-reduced-motion` 下关闭过渡
- [ ] 触控目标 ≥ 40px（compact/mobile 布局）
- [ ] 新增样式只消费 themes.css 的 token
