# Drawnix Fork 差异台账

本文记录 InkSight 相对上游 Drawnix 的关键 fork 改动，用于后续同步、回归测试和外移改造。

## 使用方式

每次同步上游前后，都建议更新本文：

- 新增了哪些本地 patch
- 哪些 patch 已外移
- 哪些 patch 已不再需要
- 哪些文件成为新的高冲突热点

## 当前重点 patch

## 1. 导入导出与 InkSight 持久化绑定

- `path`: `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `path`: `src/drawnix/drawnix/src/plugins/with-hotkey.ts`
- `path`: `src/core/document-history-helpers.js`
- `path`: `src/core/document-history-manager.js`
- `path`: `src/inksight-file/inksight-file-types.js`
- `path`: `src/inksight-file/inksight-file-snapshot.js`
- `path`: `src/inksight-file/inksight-file-restore.js`
- `path`: `src/inksight-file/inksight-file-io.js`
- `reason`: 导入导出需要携带 InkSight 的书籍身份、卡片、连接和高亮数据
- `owner`: InkSight
- `can_move_out`: 已部分完成
- `risk`: 中
- `test`: `test/inksight-file-adapter.test.ts`、`src/core/__tests__/document-history-manager.test.js`

说明：

- `.inksight` 文件格式、读写、恢复逻辑已迁移到 `src/inksight-file/*`
- 菜单、热键、自动保存、历史恢复已共用同一套 adapter 边界
- `src/drawnix/drawnix/src/data/json.ts` 已回归通用 Drawnix JSON 职责

## 2. TTD 懒加载与 feature islands

- `path`: `src/drawnix/drawnix/src/drawnix.tsx`
- `path`: `src/drawnix/drawnix/src/components/ttd-dialog/ttd-dialog.tsx`
- `path`: `src/drawnix/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx`
- `path`: `src/drawnix/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx`
- `reason`: 控制首屏加载成本，避免高级能力在应用启动时整体进入主包
- `owner`: InkSight
- `can_move_out`: 部分可以
- `risk`: 高
- `test`: `test/drawnix-feature-islands.test.tsx`

说明：

- `TTDDialog` 本身被懒加载
- Mermaid/Markdown 转换库改为按需动态加载
- 这是性能策略，不建议在无测试保护时直接回归上游实现

## 3. toolbar 菜单与品牌定制

- `path`: `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `reason`: 菜单行为与品牌链接被定制为 InkSight 版本
- `owner`: InkSight
- `can_move_out`: 是
- `risk`: 中
- `test`: 建议补 toolbar 菜单测试

说明：

- GitHub 链接被改为 InkSight 仓库
- 增加导出选中文本功能
- 部分导入导出流程与上游行为不一致

## 4. 箭头与线条相关能力裁剪

- `path`: `src/drawnix/drawnix/src/components/arrow-picker.tsx`
- `path`: `src/drawnix/drawnix/src/components/toolbar/creation-toolbar.tsx`
- `path`: `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.tsx`
- `path`: `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-arrow-shape-button.tsx`
- `path`: `src/drawnix/drawnix/src/plugins/with-arrow-preview-shape.ts`
- `path`: `src/drawnix/drawnix/src/plugins/with-arrow-shape-sync.ts`
- `reason`: 当前产品不需要完整 arrow shape / line shape 能力
- `owner`: InkSight
- `can_move_out`: 是
- `risk`: 中到高
- `test`: 建议补 toolbar 可用性测试

说明：

- 当前做法是直接删除或裁剪上游组件与插件
- 长期更建议改成配置式隐藏，而不是删文件

## 5. 样式主题定制

- `path`: `src/drawnix/drawnix/src/components/color-picker.tsx`
- `path`: `src/drawnix/drawnix/src/components/color-picker.scss`
- `path`: `src/drawnix/drawnix/src/components/tool-icon.scss`
- `path`: `src/drawnix/drawnix/src/styles/index.scss`
- `path`: `src/drawnix/drawnix/src/styles/theme.scss`
- `path`: `src/drawnix/drawnix/src/styles/variables.module.scss`
- `reason`: 视觉与交互细节被定制为 InkSight 风格
- `owner`: InkSight
- `can_move_out`: 大部分可以
- `risk`: 中
- `test`: 建议补最小样式快照或关键 DOM 结构测试

说明：

- 这类文件容易在同步时产生大量冲突
- 建议逐步改为外层主题覆盖

## 6. 构建与测试适配

- `path`: `src/drawnix/drawnix/tsconfig.json`
- `path`: `src/drawnix/drawnix/tsconfig.lib.json`
- `path`: `src/drawnix/drawnix/tsconfig.spec.json`
- `path`: `src/drawnix/react-board/tsconfig.json`
- `path`: `src/drawnix/react-board/tsconfig.lib.json`
- `path`: `src/drawnix/react-board/tsconfig.spec.json`
- `path`: `src/drawnix/react-text/tsconfig.json`
- `path`: `src/drawnix/react-text/tsconfig.spec.json`
- `path`: `src/drawnix/react-board/src/utils/resizeObserverFix.js`
- `reason`: 本地工程结构和构建流程与上游 monorepo 不一致
- `owner`: InkSight
- `can_move_out`: 视情况而定
- `risk`: 低到中
- `test`: 构建与白板初始化验证

说明：

- 这类改动业务价值不高，但会持续制造 diff 噪音
- 建议逐项确认是否仍然必要

## 当前高冲突文件清单

每次同步上游前，优先检查以下文件：

- `src/drawnix/drawnix/src/drawnix.tsx`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/ttd-dialog.tsx`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.tsx`
- `src/drawnix/drawnix/src/styles/index.scss`
- `src/inksight-file/inksight-file-restore.js`
- `src/inksight-file/inksight-file-snapshot.js`

## 下一轮建议处理顺序

1. 继续补 `.inksight` 契约测试，特别是菜单/热键/恢复闭环。
2. 评估 toolbar 注入与品牌外移。
3. 再考虑把 arrow shape 裁剪改成配置式隐藏。
4. 持续控制 `src/inksight-file/*` 与 `src/drawnix/*` 的边界。

## 2026-03-19 已同步内容补记

本节记录 2026-03-19 这轮实际吸收的上游 Drawnix 变化，便于后续维护时快速判断哪些 patch 是主动同步进来的，而不是历史遗留。

### 额外落地：`.inksight` adapter 外移

## 0. `.inksight` adapter 三阶段外移

- `path`: `src/inksight-file/inksight-file-types.js`
- `path`: `src/inksight-file/inksight-file-snapshot.js`
- `path`: `src/inksight-file/inksight-file-restore.js`
- `path`: `src/inksight-file/inksight-file-io.js`
- `path`: `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `path`: `src/drawnix/drawnix/src/plugins/with-hotkey.ts`
- `path`: `src/core/document-history-helpers.js`
- `path`: `src/core/document-history-manager.js`
- `path`: `src/drawnix/drawnix/src/data/json.ts`
- `reason`: 把 `.inksight` 文件格式、读写、恢复逻辑从 Drawnix 内部逐步外移到 InkSight adapter 层，降低后续同步成本
- `owner`: InkSight
- `can_move_out`: 已完成核心外移
- `risk`: 中
- `test`: `test/inksight-file-adapter.test.ts`、`src/core/__tests__/document-history-manager.test.js`、`test/drawnix-sync-updates.test.ts`

说明：

- 第一阶段完成了 adapter 层建立与菜单切换
- 第二阶段完成了自动保存与历史恢复复用共享 restore / payload 逻辑
- 第三阶段把 `json.ts` 收缩回通用 Drawnix JSON 职责，并把 `Ctrl+S` 热键切到 adapter

### A. 已吸收的上游同步项

## 1. 主题持久化与导出背景色

- `path`: `src/drawnix/drawnix/src/data/json.ts`
- `path`: `src/drawnix/drawnix/src/data/types.ts`
- `path`: `src/drawnix/drawnix/src/utils/color.ts`
- `path`: `src/drawnix/drawnix/src/utils/image.ts`
- `path`: `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `reason`: 吸收上游主题导出、主题恢复和导出背景色支持，同时兼容 InkSight 的 `.inksight` 扩展格式
- `owner`: InkSight
- `can_move_out`: 部分可以
- `risk`: 高
- `test`: `test/drawnix-sync-updates.test.ts`

说明：

- 保留了 InkSight 自己的额外持久化字段
- 同时吸收了上游的 `theme` 保存与恢复能力
- JPG 和 SVG 导出会根据当前主题背景做更合理的处理

## 2. SVG 导出接入

- `path`: `src/drawnix/drawnix/src/utils/image.ts`
- `path`: `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `reason`: 吸收上游 SVG 导出能力，并接入 InkSight 当前菜单结构
- `owner`: InkSight
- `can_move_out`: 否
- `risk`: 中
- `test`: `test/drawnix-sync-updates.test.ts`

说明：

- 底层导出逻辑来自上游方向
- 菜单接入方式按 InkSight 现有 UI 结构落地

## 3. 文本双击后聚焦修复

- `path`: `src/drawnix/react-board/src/plugins/with-react.tsx`
- `reason`: 吸收上游文本编辑 bugfix，修复双击新增文本后的聚焦问题
- `owner`: Drawnix upstream sync
- `can_move_out`: 否
- `risk`: 低
- `test`: 依赖白板交互回归验证

说明：

- 这是典型的高价值低风险同步项
- 后续遇到同类文本编辑 bugfix，优先继续同步

## 4. 自定义字体大小的薄同步实现

- `path`: `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/font-size-control.tsx`
- `path`: `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.tsx`
- `path`: `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.scss`
- `path`: `src/drawnix/drawnix/src/transforms/property.ts`
- `path`: `src/drawnix/react-text/src/text.tsx`
- `reason`: 上游字体大小功能价值高，但完整实现改动面太大，因此以薄同步方式吸收核心能力
- `owner`: InkSight
- `can_move_out`: 否
- `risk`: 中
- `test`: `test/drawnix-sync-updates.test.ts`

说明：

- 当前实现不是完整照搬上游 UI
- 已支持字号写入、字号渲染、简单步进调节
- 如果未来需要进一步贴近上游，可再评估是否引入完整 `Select` 组件方案

## 5. freehand 命中与填充修复

- `path`: `src/drawnix/drawnix/src/plugins/freehand/type.ts`
- `path`: `src/drawnix/drawnix/src/plugins/freehand/utils.ts`
- `reason`: 吸收上游 freehand 命中逻辑和默认填充修复
- `owner`: Drawnix upstream sync
- `can_move_out`: 否
- `risk`: 低
- `test`: 依赖白板交互回归验证

说明：

- 这类交互 bugfix 适合优先同步
- 与 InkSight 当前业务改动耦合较低

## 6. SizeSlider 小幅体验修复

- `path`: `src/drawnix/drawnix/src/components/size-slider.tsx`
- `path`: `src/drawnix/drawnix/src/components/size-slider.scss`
- `reason`: 吸收上游滑块禁用态和 tooltip 方向的小修复
- `owner`: Drawnix upstream sync
- `can_move_out`: 否
- `risk`: 低
- `test`: 间接由 `test/drawnix-sync-updates.test.ts` 覆盖本轮核心能力

说明：

- 当前本地代码已经部分接近上游
- 这次只补齐仍有价值的小缺口，没有重复搬运已一致的部分

### B. 已评估但明确暂不吸收的上游项

## 1. curly note 新形状

- `reason`: 新增能力，不是当前刚需
- `risk`: 中到高
- `decision`: 暂不合并

说明：

- 会影响 shape picker、icons、多语言文案
- 当前收益明显低于冲突成本

## 2. `index.css` 导出

- `reason`: 仅对 npm 包发布方式有价值
- `risk`: 低
- `decision`: 暂不合并

说明：

- InkSight 当前是 vendored 源码集成，不依赖包导出能力

## 3. `markdown-to-drawnix` 单独依赖 bump

- `reason`: 当前版本已在兼容范围
- `risk`: 低
- `decision`: 暂不合并

说明：

- 没必要为了版本号变化单独制造依赖变更

## 4. 颜色面板 tooltip / 文案 / 结构调整

- `reason`: 会碰到 InkSight 已改过的 `ColorPicker`、样式和多语言文本
- `risk`: 中
- `decision`: 暂不合并

说明：

- 这类改动收益不如风险高

## 5. i18n 扩展

- `reason`: 本地已定制，且历史翻译文件存在编码痕迹
- `risk`: 中
- `decision`: 暂不合并

说明：

- 没有明显功能收益时，不建议继续扩大碰撞面
