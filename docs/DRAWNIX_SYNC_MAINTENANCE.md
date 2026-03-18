# Drawnix 同步更新与维护建议

本文基于 InkSight 当前代码结构整理，目标不是单次升级 Drawnix，而是建立一套可持续、低风险的同步维护方法。

## 1. 当前集成方式判断

InkSight 目前对白板层的集成方式属于“源码 vendoring + 本地深度定制”：

- `vite` 通过 alias 直接指向本地 vendored 源码，而不是完全依赖 npm 包。
- `src/drawnix/*` 中保留了 `drawnix`、`react-board`、`react-text` 三个包的本地副本。
- `src/mindmap/*`、`src/core/*`、`src/app/*` 又在此基础上接入了 InkSight 自己的持久化、阅读器联动、恢复时序与懒加载策略。

这意味着后续维护应按“长期 fork”思路处理，而不是“偶尔复制上游代码”。

相关文件：

- `vite.config.js`
- `src/drawnix/drawnix`
- `src/drawnix/react-board`
- `src/drawnix/react-text`
- `src/mindmap/DrawnixBoard.jsx`
- `docs/IMPLEMENTATION_NOTES.md`

## 2. 当前差异扫描结论

当前 `src/drawnix/*` 与 `drawnix-repo/packages/*` 的差异主要集中在以下几类。

### A. 与 InkSight 业务强耦合的 fork 改动

这类改动建议保留在 fork 中，不要轻易回归上游。

1. 文件导入导出接入 InkSight 持久化数据

- `src/drawnix/drawnix/src/data/json.ts`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/inksight-file/*`

当前改动点：

- `.inksight` 文件格式、读写、恢复逻辑已外移到 `src/inksight-file/*`
- Drawnix 菜单与热键通过 adapter 调用 `.inksight` 保存和恢复
- `json.ts` 已回归通用白板 JSON 职责
- 自动保存与历史恢复也已复用同一套 adapter payload / restore 逻辑

判断：

- 这是典型的产品层能力，不属于 Drawnix 通用能力。
- 当前已经完成第一轮外移，后续同步时应优先保住 adapter 边界，不再把业务逻辑回灌进 Drawnix 内核文件。

2. 懒加载与性能边界控制

- `src/drawnix/drawnix/src/drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/ttd-dialog.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx`
- `test/drawnix-feature-islands.test.tsx`

本地改动点：

- `TTDDialog` 改为懒加载
- Mermaid/Markdown 转换库改为首次预览或插入时才动态加载
- 明确维持“feature islands”与高级能力按需加载策略

判断：

- 这和 InkSight 当前的包体积、启动性能策略直接相关。
- 这类改动不一定能被上游接受，但对本项目很有价值，应该保留并继续用测试保护。

### B. 明显的产品定制改动

这类改动不一定要保留在 Drawnix fork 内部，更适合逐步外移成适配层。

1. 菜单与品牌定制

- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`

本地改动点：

- GitHub 链接改为 InkSight 仓库
- 增加导出选中文本能力
- 清理了部分导入导出行为

判断：

- 这类改动不影响白板内核，未来最好改成外层注入式菜单，而不是继续直接改上游文件。

2. 箭头/线条能力裁剪

- `src/drawnix/drawnix/src/components/arrow-picker.tsx`
- `src/drawnix/drawnix/src/components/toolbar/creation-toolbar.tsx`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.tsx`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-arrow-shape-button.tsx`
- `src/drawnix/drawnix/src/plugins/with-arrow-preview-shape.ts`
- `src/drawnix/drawnix/src/plugins/with-arrow-shape-sync.ts`

本地改动点：

- 删除部分 line shape / arrow shape UI
- 删除箭头预览和箭头形状同步插件

判断：

- 这是产品选择，不一定是技术必要性。
- 如果未来还想频繁同步上游，建议把这类“功能关掉但不删底层”的改法放到外层配置，而不是直接删组件和插件文件。

3. 样式与视觉定制

- `src/drawnix/drawnix/src/components/color-picker.tsx`
- `src/drawnix/drawnix/src/components/color-picker.scss`
- `src/drawnix/drawnix/src/components/tool-icon.scss`
- `src/drawnix/drawnix/src/styles/index.scss`
- `src/drawnix/drawnix/src/styles/theme.scss`
- `src/drawnix/drawnix/src/styles/variables.module.scss`

判断：

- 这类改动一般同步冲突频率高，但业务价值相对低。
- 建议逐步抽到 InkSight 自己的主题覆盖层，减少直接改 Drawnix 源样式。

### C. 低价值但会制造同步噪音的改动

这类改动建议尽量回归上游结构，减少未来 diff 面积。

- `src/drawnix/drawnix/tsconfig.json`
- `src/drawnix/drawnix/tsconfig.lib.json`
- `src/drawnix/drawnix/tsconfig.spec.json`
- `src/drawnix/react-board/tsconfig.json`
- `src/drawnix/react-board/tsconfig.lib.json`
- `src/drawnix/react-board/tsconfig.spec.json`
- `src/drawnix/react-text/tsconfig.json`
- `src/drawnix/react-text/tsconfig.spec.json`
- `src/drawnix/react-board/src/utils/resizeObserverFix.js`

判断：

- 这些改动大多是本地构建适配、测试裁剪、兼容性补丁。
- 如果它们确实仍然需要，建议单独记录原因；如果只是历史遗留，优先收敛。

## 3. 建议的目录与职责边界

为了降低未来同步成本，建议把白板相关代码按三层维护。

### 第 1 层：上游镜像层

目录：

- `drawnix-repo/`

职责：

- 保持尽可能接近上游 Drawnix 仓库
- 用来观察 upstream commit、issue、PR、目录变化
- 不放 InkSight 业务代码

建议：

- 把 `drawnix-repo` 设置为真正的上游跟踪仓
- `origin` 指向你自己的 Drawnix fork
- `upstream` 指向 `https://github.com/plait-board/drawnix`

### 第 2 层：本地 fork 层

目录：

- `src/drawnix/`

职责：

- 存放必须保留的白板源码 patch
- 尽量只放“上游无法提供、但 InkSight 必须依赖”的改动

建议：

- 不再继续把业务联动逻辑塞进这一层
- 每一个 fork patch 都要能回答“为什么不能外移”

### 第 3 层：InkSight 适配层

目录：

- `src/mindmap/`
- `src/core/`
- `src/app/`

职责：

- 文档高亮与节点联动
- 历史恢复与自动保存
- 书籍身份映射
- 菜单、品牌、导入导出策略、懒加载策略

建议：

- 后续新增需求优先写在这一层
- 只有当上游内部 API 不足以支撑时，才去动 `src/drawnix/`

## 4. 推荐的同步策略

### 策略原则

1. 小步同步，不攒大版本

- 建议每 2 到 4 周查看一次上游变化
- 建议每 1 到 2 个月做一次受控同步
- 每次同步只聚焦一个主题

适合按主题拆分的同步类型：

- TTD 相关
- toolbar 相关
- mind map 能力
- 移动端与手势
- 样式与主题
- 构建与依赖升级

2. 先看上游，再决定“跟”还是“留”

每次看到上游变更，不要立刻合入，先分类：

- 通用 bugfix，值得吸收
- 新功能，但不适合当前产品
- 与本地 fork 冲突较大，需要重做 adapter
- 仅 UI/样式变化，可暂缓

3. 优先 cherry-pick 思路，不优先大范围覆盖

对你这个项目来说，更推荐：

- 基于 commit 或文件级别挑选同步

不太推荐：

- 定期整包覆盖 `src/drawnix`

因为当前本地定制已经不算薄封装，整包覆盖冲突成本会越来越高。

## 5. 每次同步建议流程

### 第一步：获取上游信息

建议固定执行以下动作：

1. `git -C drawnix-repo fetch upstream`
2. 查看最近一段时间的 commit、release、issue、PR
3. 只挑和 InkSight 相关的改动主题

关注重点：

- `packages/drawnix/src`
- `packages/react-board/src`
- `packages/react-text/src`
- `package.json`
- `README` 或迁移说明

### 第二步：做影响分级

建议将候选同步项分成三档：

- `P1`：bugfix、安全问题、数据损坏、移动端崩溃、撤销重做异常
- `P2`：明显改善体验的功能增强
- `P3`：样式、文案、演示站、非关键基础设施调整

只有 `P1` 和部分 `P2` 值得优先进入 InkSight。

### 第三步：先比对本地 fork 热点文件

同步前优先检查这些高冲突文件：

- `src/drawnix/drawnix/src/drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/*`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/*`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/*`
- `src/drawnix/drawnix/src/styles/*`
- `src/inksight-file/*`

原因：

- 这些文件既被上游频繁改，也被 InkSight 深度改。

### 第四步：先合“可外移”的改动，再合“硬冲突”的改动

建议顺序：

1. 先同步低风险公共文件
2. 再处理被 InkSight 改过的热点文件
3. 最后处理样式与行为冲突

### 第五步：跑回归测试

建议至少验证这些能力：

- 白板初始化与 `board-ready`
- 导图保存、导入、恢复
- 书籍 MD5 匹配与节点重映射
- Mermaid/Markdown 懒加载
- 自动布局
- 高亮与卡片联动

## 6. 建议补齐的保护性测试

你们现在已经有针对 feature islands 的测试，这很好，但还应该继续补下面这些测试。

### 高优先级

1. `.inksight` 导入导出契约测试

覆盖内容：

- 导出包含 `bookMd5`、`bookName`、`bookId`
- 导出包含 cards / connections / highlights
- 导入时能恢复这些结构
- MD5 不一致时给出安全提示

建议文件：

- `test/drawnix-persistence-contract.test.tsx`

2. 书籍切换后的重映射测试

覆盖内容：

- 当前文档已打开
- 旧导图导入
- `highlightId` / `sourceId` 映射是否正确

建议文件：

- `src/core/__tests__/mindmap-restore-remap.test.js`

3. toolbar 定制测试

覆盖内容：

- InkSight 不需要的 arrow/line shape 不重新暴露
- 自定义菜单项仍能正常工作

### 中优先级

1. 样式回归快照测试

- 至少保护关键 toolbar 和弹窗结构

2. 移动端交互测试

- 重点关注 pinch zoom、pointer、手写模式切换

## 7. 建议逐步外移的改动

如果要降低未来维护成本，优先考虑把下面这些改动从 `src/drawnix` 里抽出来。

### 第一优先级：导入导出适配

目标：

- Drawnix 内部只负责通用 JSON 序列化
- InkSight 外层负责 `.inksight` 结构、额外元数据与恢复逻辑

原因：

- 这是当前最核心、最稳定、也最不属于上游职责的定制
- 一旦外移成功，同步 Drawnix `data/json.ts` 的成本会显著下降

### 第二优先级：菜单与品牌

目标：

- 让 toolbar 菜单支持外层注入或覆盖
- 避免继续直接改 `app-menu-items.tsx`

### 第三优先级：功能开关而不是删文件

目标：

- 用配置隐藏 arrow shape 等功能
- 不直接删除 `popup-arrow-shape-button.tsx`、`with-arrow-preview-shape.ts`、`with-arrow-shape-sync.ts`

原因：

- 直接删文件会让上游后续相关改动更难重放

## 8. 建议保留在 fork 内部的改动

以下改动短期内可以接受继续保留在 `src/drawnix`：

- 与 InkSight 文档体系强绑定的导入导出行为
- 与启动性能直接相关的懒加载边界
- 必须基于内部插件链才能实现的行为定制

前提是：

- 必须写清楚原因
- 必须有测试保护
- 必须知道上游一旦改到这里，谁来处理冲突

## 9. 建议新增的维护文档与记录方式

除了本文，建议再新增一份 fork 差异台账，例如：

- `docs/DRAWNIX_FORK_PATCHES.md`

每条记录建议包含：

- 文件路径
- 改动类别
- 为什么要改
- 能否外移
- 同步上游时的冲突风险
- 对应测试

示例字段：

- `path`
- `reason`
- `owner`
- `can_move_out`
- `risk`
- `test`

## 10. 建议的长期路线

### 短期

- 整理 `drawnix-repo` 的 remote
- 建立 fork 差异台账
- 为 `.inksight` 导入导出补契约测试

### 中期

- 把导入导出与菜单定制逐步外移
- 把删文件式改动改成配置式裁剪

### 长期

- 让 `src/drawnix` 趋向“薄 fork”
- 让 InkSight 的产品能力更多沉淀在 adapter 层
- 把上游同步从“人工大合并”变成“有测试保护的小步吸收”

## 11. 当前最值得立刻执行的动作

按优先级建议如下：

1. 修正 `drawnix-repo` 的 remote 配置，建立真正的 `upstream`
2. 新增 `docs/DRAWNIX_FORK_PATCHES.md`，开始记录 fork 差异
3. 为 `.inksight` 导入导出补一组契约测试
4. 继续维护 `src/inksight-file/*` 与 Drawnix 内核之间的清晰边界
5. 下次同步时只挑一个主题先试运行，建议从 TTD 或 toolbar 开始

## 12. 本文结论

InkSight 当前对白板层的维护策略，最合适的不是“尽量不 fork”，而是“把 fork 管理好，并持续把不必要的 fork 缩回 adapter 层”。

一句话概括：

- 白板内核尽量贴近上游
- 产品联动尽量外移
- 必须保留的 fork 用文档和测试守住

## 13. 2026-03-19 同步决策记录

本节记录一次实际执行过的上游同步筛选，便于后续维护时快速理解：

- 从 2025-11-20 左右引入 Drawnix 之后，上游发生了哪些变化
- 哪些变化已经吸收到 InkSight
- 哪些变化明确选择暂不吸收
- 每个决策背后的原因是什么

### 本次参考范围

本次对比基于 `drawnix-repo` 中拉取到的上游 `upstream/develop`，关注时间范围约为：

- 2025-11-20
- 到 2026-03-19

### 上游主要变化概览

在这个时间段内，Drawnix 上游比较值得关注的更新主要有：

- 2025-11-29：支持导出为 `SVG`
- 2025-12-03：颜色/透明度滑块与 tooltip 体验修复
- 2025-12-05：`markdown-to-drawnix` 依赖修复
- 2026-01-16：主题色可保存、可随 JSON 导入导出恢复，导出图片也能带背景色
- 2026-01-20：新增左右两种 curly note 形状
- 2026-01-21：双击创建文本后聚焦失败修复
- 2026-02-10：增加 `index.css` 导出
- 2026-02-26：支持自定义字体大小
- 2026-03-03：freehand 命中与默认填充修复

### 已经合并到 InkSight 的更新

以下内容已经同步到当前项目，并经过目标测试验证。

1. `SVG` 导出能力

已合并原因：

- 用户价值高
- 改动范围可控
- 与 InkSight 现有导出结构兼容

涉及文件：

- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/drawnix/drawnix/src/utils/image.ts`

2. 主题持久化与导出背景色

已合并原因：

- 对 InkSight 很实用
- 不会破坏 `.inksight` 扩展格式
- 能明显改善导入导出的一致性

涉及文件：

- `src/drawnix/drawnix/src/data/types.ts`
- `src/drawnix/drawnix/src/utils/color.ts`
- `src/drawnix/drawnix/src/utils/image.ts`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/inksight-file/inksight-file-snapshot.js`

3. 双击创建文本后的聚焦修复

已合并原因：

- 属于明确 bugfix
- 改动很小
- 对文本编辑体验有直接提升

涉及文件：

- `src/drawnix/react-board/src/plugins/with-react.tsx`

4. 自定义字体大小

已合并方式：

- 没有整块照搬上游完整 UI
- 采用“薄同步”方式，只吸收核心能力

已合并原因：

- 功能价值高
- 但上游原实现改动面太大
- InkSight 当前 fork 结构更适合吸收“字号写入 + 渲染 + 简单控件”这部分核心能力

涉及文件：

- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/font-size-control.tsx`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.tsx`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/popup-toolbar.scss`
- `src/drawnix/drawnix/src/transforms/property.ts`
- `src/drawnix/react-text/src/text.tsx`

5. freehand 命中与默认填充修复

已合并原因：

- 属于纯交互修复
- 风险低
- 与 InkSight 当前 fork 冲突很小

涉及文件：

- `src/drawnix/drawnix/src/plugins/freehand/type.ts`
- `src/drawnix/drawnix/src/plugins/freehand/utils.ts`

6. 透明度/尺寸滑块的小幅体验修复

已合并内容：

- 吸收了低风险的部分
- 包括滑块 tooltip 与禁用态反馈的补齐

已合并原因：

- 收益稳定
- 改动小
- 几乎不会撞到 InkSight 的业务定制

涉及文件：

- `src/drawnix/drawnix/src/components/size-slider.tsx`
- `src/drawnix/drawnix/src/components/size-slider.scss`

### 明确没有合并的更新

以下内容已经评估过，但本次选择不合并。

1. 左右 curly note 新形状

未合并原因：

- 属于新增绘图能力，不是当前刚需
- 会影响 shape picker、icons、多语言文本
- 收益不如冲突成本高

2. `index.css` 导出

未合并原因：

- 这是 npm 包发布层能力
- InkSight 当前使用的是 vendored 源码，而不是依赖包的 `exports`
- 对现有工程基本没有实际收益

3. `markdown-to-drawnix` 依赖 bump

未合并原因：

- 当前项目依赖已经在兼容范围
- 单独为了版本号变动而同步，收益不高

4. 颜色面板 tooltip / 文案 / 面板结构调整

未合并原因：

- 会碰到 InkSight 已经改过的 `ColorPicker`
- 会波及样式和多语言文本
- 当前收益不如风险高

5. i18n 扩展

未合并原因：

- InkSight 对白板层文本已有定制
- 一些翻译文件本身存在历史编码痕迹
- 在没有明显功能收益时，不适合继续扩大碰撞面

6. 其它 shape / arrow picker 行为调整

未合并原因：

- InkSight 当前对工具栏和箭头能力有裁剪
- 直接跟上游这些变更，可能把本地故意关闭的能力重新带回来

### 本次同步策略为什么不是“全部合并”

原因主要有三点：

1. InkSight 不是简单使用 Drawnix，而是已经深度 fork 并接入了：

- 阅读器
- 高亮系统
- 卡片系统
- `.inksight` 持久化格式

2. 上游更新里有些是通用 bugfix，适合直接吸收。

例如：

- 文本聚焦修复
- freehand 命中修复
- 主题导出背景修复

3. 上游更新里有些是新功能或发布层改动，但会明显撞到本地 fork。

例如：

- curly note 新形状
- 完整字体大小 UI
- i18n 扩展
- shape picker 改动

因此，本项目更适合采用的原则是：

- 先吸收高价值 bugfix
- 再薄同步高价值新能力
- 低收益高冲突更新先延后

### 本次同步后的结论

到 2026-03-19 为止，Drawnix 从 2025-11-20 之后那些：

- 高价值
- 低风险
- 适合 InkSight 当前结构

的更新，已经基本被吸收。

剩余未合并内容主要属于：

- 新增能力但不是刚需
- 只对 npm 包发布有价值
- 会明显撞到 InkSight 现有 fork 定制
- 收益低于冲突成本

## 14. 2026-03-19 `.inksight` adapter 外移进度

在本次同步工作之后，`.inksight` 相关职责又继续完成了三阶段外移：

1. 建立 `src/inksight-file/*` adapter 层
2. 让菜单导入导出、自动保存和历史恢复复用同一套 payload / restore 逻辑
3. 把 `src/drawnix/drawnix/src/data/json.ts` 收缩回通用白板 JSON 职责，并把 `Ctrl+S` 热键切到 adapter

这意味着当前维护 Drawnix fork 时，关于 `.inksight` 的判断原则已经变成：

- `src/drawnix/*` 主要负责白板通用能力
- `src/inksight-file/*` 主要负责 InkSight 文件格式与业务恢复
- 后续如果上游再改 `json.ts`，同步难度已经比之前明显下降
