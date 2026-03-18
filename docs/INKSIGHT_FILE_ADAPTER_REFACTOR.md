# `.inksight` 导入导出外移设计与落地记录

本文目标是为 InkSight 的 `.inksight` 文件适配做分阶段重构设计，并记录已经落地的进展：把当前压在 Drawnix 内部的导入导出业务逻辑，逐步外移到 InkSight 自己的 adapter 层。

本文同时包含两部分内容：

- 重构边界与设计思路
- 2026-03-19 已完成的三阶段落地记录

本文不追求一次性大改，而是定义：

- 当前问题在哪里
- 目标边界应该是什么
- 第一阶段应该先怎么拆
- 拆完后每层代码分别负责什么

## 1. 当前问题

目前 `.inksight` 导入导出逻辑分散在两套链路中。

### 链路 A：Drawnix 内部菜单链路

主要文件：

- `src/drawnix/drawnix/src/data/json.ts`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`

当前承担的职责：

- 保存文件名与扩展名 `.inksight`
- 读取文件
- 将 Drawnix 白板序列化为 JSON
- 将 InkSight 的 `bookMd5`、`bookName`、`bookId`、`cards`、`connections`、`highlights` 混入导出数据
- 导入后直接恢复 cards / highlights
- 导入时做 MD5 检查
- 导入时在没有当前书籍的情况下设置 `pendingRestore`
- 导入时清理 PDF 高亮覆盖层

这套链路的问题是：

- Drawnix 被迫知道 InkSight 的业务概念
- Drawnix 菜单层直接操作 `window.inksight`
- 导入导出和恢复逻辑耦合在一起
- 很难继续同步上游 `data/json.ts` 与 `app-menu-items.tsx`

### 链路 B：InkSight 自己的历史恢复链路

主要文件：

- `src/core/document-history-manager.js`
- `src/core/document-history-helpers.js`

当前承担的职责：

- 自动保存当前白板与文档状态
- 恢复历史保存
- 构建持久化快照
- 恢复 cards / highlights
- 处理 board-ready 时序

这套链路的问题是：

- 它和 Drawnix 菜单链路做了部分相同的事情
- 但输入输出结构没有统一抽象
- 两边都在拼装 `.inksight` 风格的数据

### 本质问题

现在系统里缺一个真正的“`.inksight` 文件适配层”。

换句话说，目前是：

- Drawnix 一部分在管 `.inksight`
- DocumentHistory 一部分也在管 `.inksight`

但真正应该是：

- InkSight adapter 层统一管 `.inksight`
- Drawnix 只负责“白板通用导入导出”

## 2. 重构目标

目标不是去掉 `.inksight`，而是把职责分清楚。

### 目标边界

#### Drawnix 层只负责

- 序列化通用白板数据
- 读取通用白板数据
- 不知道 `bookMd5`
- 不知道 `cards`
- 不知道 `highlights`
- 不知道 `pendingRestore`
- 不直接访问 `window.inksight`

#### InkSight adapter 层负责

- `.inksight` 文件格式定义
- 业务快照拼装
- 业务快照恢复
- MD5 校验
- 书籍 ID 重映射
- 导入前后额外副作用
- 与 Drawnix 白板数据的拼装和拆解

### 重构后的理想数据关系

```text
Drawnix board data
  +
InkSight document snapshot
  =>
.inksight file payload
```

也就是说：

- Drawnix 只提供 `board snapshot`
- InkSight 再把它包装成 `.inksight`

## 3. 建议新增的 adapter 层

建议新增一个专门目录：

- `src/inksight-file/`

第一阶段建议最少拆出这几个文件。

### `src/inksight-file/inksight-file-types.ts` 或 `.js`

职责：

- 定义 `.inksight` 文件结构
- 明确哪些字段属于通用白板数据
- 哪些字段属于 InkSight 扩展数据

建议结构：

```js
{
  type: 'drawnix',
  version: '0.0.1',
  source: 'web',
  elements: [],
  viewport: {},
  theme: {},
  bookMd5: '',
  bookName: '',
  bookId: '',
  cards: [],
  connections: [],
  highlights: [],
  lastPage: 1
}
```

说明：

- `elements` / `viewport` / `theme` 是白板核心数据
- 其余是 InkSight 扩展数据

### `src/inksight-file/inksight-file-snapshot.js`

职责：

- 从 `appContext` 与 `board` 构建 InkSight 快照
- 不负责文件系统读写

建议导出函数：

- `buildInksightPersistenceSnapshot(appContext)`
- `buildInksightFilePayload({ board, appContext, lastPage })`

这个文件应吸收目前这些逻辑：

- `document-history-helpers.js` 里的 `buildPersistenceSnapshot`
- `document-history-helpers.js` 里的 `buildAutoSavePayload`
- `app-menu-items.tsx` 里保存时拼 `extraData` 的逻辑

### `src/inksight-file/inksight-file-restore.js`

职责：

- 接收 `.inksight` payload
- 执行恢复所需的业务逻辑
- 不负责 Drawnix 菜单 UI

建议导出函数：

- `validateInksightPayloadAgainstCurrentBook(payload, appContext)`
- `restoreInksightPersistence(payload, appContext)`
- `resolveInksightRestoreSourceId(payload, appContext)`

这个文件应吸收目前这些逻辑：

- `app-menu-items.tsx` 里导入后的 MD5 校验
- `app-menu-items.tsx` 里 cards/highlights 恢复
- `app-menu-items.tsx` 里 `pendingRestore` 设置
- `app-menu-items.tsx` 里 PDF highlight 清理

### `src/inksight-file/inksight-file-io.js`

职责：

- 负责 `.inksight` 文件读写
- 只关注文件层，不做业务恢复

建议导出函数：

- `saveInksightFile(payload, { suggestedName })`
- `openInksightFile()`

这个文件可以包装：

- `fileOpen`
- `fileSave`

同时把：

- 扩展名 `.inksight`
- 文件类型描述

从 Drawnix `data/json.ts` 里挪出来。

## 4. 第一阶段建议采用的职责分配

第一阶段不要试图一次重写所有链路，建议只先做“职责搬迁”，不做行为变化。

### Drawnix 层保留

- `serializeAsJSON(board)` 只返回白板通用数据
- `loadFromBlob(...)` 只解析白板结构
- `saveAsJSON` / `loadFromJSON` 最终应回到更接近上游的状态

### InkSight 层新增

- `.inksight` payload 组装
- `.inksight` 文件打开/保存
- `.inksight` payload 恢复

### 菜单层变化

当前：

- `app-menu-items.tsx` 直接自己拼 `extraData`
- 自己恢复 cards/highlights

目标：

- `app-menu-items.tsx` 只调用 InkSight adapter

例如：

```js
saveCurrentInksightBoard(board, getAppContext())
openAndRestoreInksightBoard(board, getAppContext(), listRender)
```

也就是说菜单层只做触发，不做业务拼装。

## 5. 第一阶段不应该做的事

为了降低风险，第一阶段不建议做这些动作。

### 不要改 `.inksight` 文件格式

原因：

- 现在重构的重点是“职责迁移”
- 不是“格式升级”

### 不要同时重写 document history 全链路

原因：

- `DocumentHistoryManager` 已经有一套可工作的恢复时序
- 第一阶段只需要把公共拼装逻辑抽出来复用

### 不要立即回滚所有 Drawnix 改动

原因：

- 一次性大回退风险太高
- 更适合分两步：
  - 第一步：把逻辑抽走
  - 第二步：再让 Drawnix 文件逐步回归上游风格

## 6. 推荐的第一阶段落地顺序

### 第一步：建立 adapter 文件

先新增：

- `src/inksight-file/inksight-file-types.js`
- `src/inksight-file/inksight-file-snapshot.js`
- `src/inksight-file/inksight-file-restore.js`
- `src/inksight-file/inksight-file-io.js`

这一阶段先不删旧逻辑，只把新接口搭出来。

### 第二步：让菜单层改为调用 adapter

目标文件：

- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`

改造目标：

- 保存时不再直接拼 `extraData`
- 导入时不再直接恢复 `cards/highlights`
- 菜单只调用 adapter 的高层方法

### 第三步：让 `document-history-helpers.js` 复用同一套快照构建逻辑

目标文件：

- `src/core/document-history-helpers.js`

改造目标：

- `buildAutoSavePayload` 改成复用 adapter 层的 payload builder
- 避免“菜单导出”和“自动保存”各自维护一套结构

### 第四步：收缩 Drawnix `data/json.ts`

目标文件：

- `src/drawnix/drawnix/src/data/json.ts`

改造目标：

- 只保留通用白板 JSON 的职责
- 不再负责 `.inksight` 扩展字段
- 不再决定 `.inksight` 文件格式

## 7. 第一阶段完成后的收益

只做完第一阶段，就会立刻获得几个好处。

### 好处 1：Drawnix fork 面积明显下降

最容易和上游冲突的两个文件之一：

- `data/json.ts`
- `app-menu-items.tsx`

都会减轻业务耦合。

### 好处 2：菜单导出与自动保存使用同一套 payload 规则

这会减少未来出现：

- 一个能恢复
- 一个不能恢复
- 一个带 theme
- 一个不带 theme

这类分叉问题。

### 好处 3：后续更容易补契约测试

适合新增测试的位置会变得非常明确：

- `inksight-file-snapshot.test.js`
- `inksight-file-restore.test.js`

这样以后就不用总靠 UI 层测试导入导出。

## 8. 建议的第一阶段接口草案

下面是建议的高层接口，不要求现在完全按这个名字实现，但语义建议尽量一致。

### 构建 payload

```js
buildInksightFilePayload({
  board,
  appContext,
  lastPage
})
```

### 保存文件

```js
saveInksightFilePayload(payload, {
  suggestedName
})
```

### 打开文件

```js
openInksightFilePayload()
```

### 恢复业务状态

```js
restoreInksightPayload(payload, {
  appContext,
  clearPdfHighlights: true
})
```

### 菜单层组合接口

```js
exportCurrentBoardAsInksight(board, appContext)
importBoardFromInksight(board, listRender, appContext)
```

## 9. 2026-03-19 已完成落地进度

截至 2026-03-19，这份设计中的前三步已经实际落地。

### 已完成的第一阶段：建立 adapter 文件并切换菜单导入导出

已新增目录：

- `src/inksight-file/`

已新增文件：

- `src/inksight-file/inksight-file-types.js`
- `src/inksight-file/inksight-file-snapshot.js`
- `src/inksight-file/inksight-file-restore.js`
- `src/inksight-file/inksight-file-io.js`

已完成内容：

- 菜单保存改为通过 adapter 生成 `.inksight` payload 并保存
- 菜单导入改为通过 adapter 读取 `.inksight` 文件并恢复 cards / highlights
- `app-menu-items.tsx` 不再直接拼接 InkSight 持久化字段

涉及文件：

- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/inksight-file/inksight-file-io.js`
- `src/inksight-file/inksight-file-restore.js`
- `src/inksight-file/inksight-file-snapshot.js`

### 已完成的第二阶段：历史恢复链路复用 adapter

已完成内容：

- `document-history-helpers.js` 改为复用共享 payload builder
- `document-history-manager.js` 改为复用共享恢复逻辑
- 保留了历史恢复原有的 `board-ready` 时序
- 保留了“没有 `bookMd5` 时仍可绑定当前书籍 ID”的旧语义，避免行为悄悄变化

涉及文件：

- `src/core/document-history-helpers.js`
- `src/core/document-history-manager.js`
- `src/inksight-file/inksight-file-restore.js`
- `src/inksight-file/inksight-file-snapshot.js`

### 已完成的第三阶段：收缩 Drawnix `json.ts` 职责

已完成内容：

- `src/drawnix/drawnix/src/data/json.ts` 已收缩为通用 Drawnix 白板 JSON 读写
- `json.ts` 不再默认保存为 `.inksight`
- `json.ts` 不再携带 InkSight 扩展字段
- `Ctrl+S` 热键已切到 InkSight adapter，用户侧仍然保存 `.inksight`

涉及文件：

- `src/drawnix/drawnix/src/data/json.ts`
- `src/drawnix/drawnix/src/plugins/with-hotkey.ts`
- `src/inksight-file/inksight-file-io.js`

### 当前状态总结

现在 `.inksight` 这一层的职责已经基本收敛到 InkSight adapter：

- `.inksight` payload 构建
- `.inksight` 文件读写
- `.inksight` 业务恢复
- 菜单导入导出
- 自动保存与历史恢复
- `Ctrl+S` 热键保存

而 Drawnix 内部已经更接近“通用白板引擎”的职责边界。

### 当前仍值得继续推进的方向

1. 给 `.inksight` 增加更完整的契约测试
2. 继续评估 toolbar 注入与品牌外移
3. 逐步把“删文件式裁剪”改成“配置式隐藏”
4. 在不影响用户行为的前提下，继续缩小 `src/drawnix` 中的产品层 patch

## 10. 本文结论

第一步重构的重点不是“删掉 Drawnix 里的所有 `.inksight` 逻辑”，而是先建立 InkSight 自己的文件适配层，让：

- `.inksight` 文件格式
- `.inksight` 文件读写
- `.inksight` 业务快照构建
- `.inksight` 业务恢复

都收敛到同一个 adapter 边界内。

这样后面再继续把逻辑从 `src/drawnix` 往外挪，才会越挪越轻，而不是越挪越乱。
