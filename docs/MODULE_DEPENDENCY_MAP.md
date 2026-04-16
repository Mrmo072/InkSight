# InkSight 模块依赖关系图

本文档用于固定当前前端装配结构，说明各模块职责、依赖方向和接线原则，避免后续修改重新把逻辑堆回 [src/main.js](/D:/Projects/InkSight/src/main.js)。

## 目标

- `main.js` 只保留状态、少量跨模块协调和启动入口。
- 业务逻辑优先放到 `src/app/` 下按职责拆分的模块中。
- 模块之间尽量通过“语义化依赖对象”协作，而不是传递大量零散回调。
- 依赖方向尽量保持单向，减少循环引用和隐式共享状态。

## 当前装配总览

```text
main.js
  ├─ app-bootstrap.js
  │   ├─ workspace-events.js
  │   ├─ layout-controls.js
  │   ├─ reader-toolbar-events.js
  │   ├─ selection-sync.js
  │   ├─ SplitView / OutlineSidebar / AnnotationList
  │   └─ runtime project restore + app notification mount
  ├─ project-workspace.js
  ├─ workspace-documents.js
  ├─ file-library.js
  ├─ reader-loader.js
  ├─ source-navigation.js
  └─ core managers / app context
```

## 模块职责

### [src/main.js](/D:/Projects/InkSight/src/main.js)

职责：
- 初始化全局状态和 DOM 引用
- 创建控制器实例
- 提供少量跨模块桥接函数
- 触发应用启动

不应承担：
- 文件导入/打开/删除的细节
- 项目保存/恢复实现
- 布局按钮事件细节
- 阅读器工具栏事件细节

### [src/app/app-bootstrap.js](/D:/Projects/InkSight/src/app/app-bootstrap.js)

职责：
- 统一处理应用启动顺序
- 创建 `SplitView`、`OutlineSidebar`、`AnnotationList`
- 注册应用级事件、布局控制、工具栏事件
- 恢复运行时工作区并挂载通知系统

依赖：
- `services`: 长生命周期服务，例如 `projectWorkspace`、`logger`
- `hooks`: 启动阶段需要调用的外部能力，例如 `createDrawnixView`、`setupResponsiveLayout`
- `elements`: 已收集好的 DOM 引用

### [src/app/project-workspace.js](/D:/Projects/InkSight/src/app/project-workspace.js)

职责：
- 管理项目身份（user/session/project）
- 负责运行时工作区保存与恢复
- 负责项目导出、自动保存、保存状态提示

依赖方向：
- 可依赖 `app-context`
- 可依赖 `inksight-file/*`
- 不应依赖 `main.js`
- 不应直接依赖文件库渲染实现，只通过 `renderFileList` 回调触发更新

### [src/app/workspace-documents.js](/D:/Projects/InkSight/src/app/workspace-documents.js)

职责：
- 导入文档
- 打开文档
- 移除文档
- 清空/恢复工作区文件列表
- 协调阅读器加载与当前文档状态

依赖接口：
- `workspace`: `state` 与 `elements`
- `readers`: `readerLoader`、`documentHistoryManager`、当前 reader 读写
- `ui`: 渲染、工具状态、页面信息、工作区模式切换

这类接口说明该模块是“文档工作区控制器”，而不是直接控制整个应用。

### [src/app/workspace-events.js](/D:/Projects/InkSight/src/app/workspace-events.js)

职责：
- 生成文件库和工作区相关的 DOM / window 事件监听器定义
- 将事件路由到 `workspaceDocuments`、`projectWorkspace`、导航或 UI 行为

依赖接口：
- `workspaceDocuments`: 文档操作
- `projectWorkspace`: 项目相关动作
- `ui`: 导入、恢复、界面更新
- `navigation`: 翻页、跳转源码、关闭紧凑面板
- `dragState`: 拖拽排序的瞬时状态

### [src/app/layout-controls.js](/D:/Projects/InkSight/src/app/layout-controls.js)

职责：
- 管理注释/脑图视图切换
- 管理左右面板开关与宽度预设
- 管理移动端工具栏显隐

依赖方向：
- 只依赖布局相关对象和回调
- 不应接入项目保存、文件导入、阅读器加载等业务逻辑

### [src/app/reader-toolbar-events.js](/D:/Projects/InkSight/src/app/reader-toolbar-events.js)

职责：
- 处理工具栏模式切换
- 处理高亮面板显示/拖动/高度调节
- 处理自动布局入口

依赖方向：
- 只依赖 reader 状态、工具栏 UI、`setWorkspaceMode`
- 不应直接操作文件列表和项目状态

### [src/app/file-library.js](/D:/Projects/InkSight/src/app/file-library.js)

职责：
- 计算可见文档
- 计算文档引用统计
- 渲染文件库、空状态、恢复面板

特点：
- 它是“派生视图层”，不直接执行删除、导入、打开等副作用
- 真正动作由 `workspace-events.js` 转发到控制器

## 推荐依赖方向

建议保持以下方向：

```text
main.js
  -> app-bootstrap
  -> project-workspace
  -> workspace-documents
  -> file-library

app-bootstrap
  -> workspace-events
  -> layout-controls
  -> reader-toolbar-events

workspace-events
  -> workspace-documents
  -> project-workspace

workspace-documents
  -> reader-loader
  -> app-context
  -> file-list helpers

project-workspace
  -> app-context
  -> inksight-file/*
```

避免反向依赖：

- `project-workspace` 不应依赖 `workspace-events`
- `workspace-documents` 不应依赖 `app-bootstrap`
- `file-library` 不应直接调用导入/删除等副作用
- `layout-controls` 不应知道项目或文档持久化细节

## 依赖注入约定

目前推荐三类接口形式：

### 1. `services`

用于长生命周期、具有明显业务职责的对象。

示例：
- `projectWorkspace`
- `logger`

### 2. `hooks`

用于装配阶段必须回调的外部能力。

示例：
- `createDrawnixView`
- `setupResponsiveLayout`
- `handleRestorePagePosition`

### 3. 语义对象

用于一组同类能力，避免传入大量平铺参数。

示例：
- `workspace`: 状态与 DOM 容器
- `readers`: reader loader、history manager、当前 reader 访问器
- `ui`: 渲染与界面切换回调
- `navigation`: 跳转与面板关闭
- `dragState`: 拖拽中的临时状态

不推荐的形式：
- 超过 8 到 10 个平铺函数参数
- 传入既包含 UI 也包含持久化也包含导航的杂糅对象
- 模块内部通过 `window.*` 临时读取调用方状态来绕开注入

## 修改原则

后续如果需要新增模块，优先按下面顺序判断：

1. 它是业务控制器，还是纯视图渲染，还是事件装配？
2. 它依赖的是哪一类能力：状态、UI、导航、服务、reader？
3. 能否加入现有语义对象，而不是继续增加平铺参数？
4. 是否会让某个低层模块反向依赖上层装配代码？

如果答案会让依赖方向变混乱，优先调整边界，而不是直接把逻辑放回 `main.js`。

## 测试对应关系

当前已经有模块级测试覆盖的模块：

- [file-library.test.js](/D:/Projects/InkSight/src/app/__tests__/file-library.test.js)
- [workspace-documents.test.js](/D:/Projects/InkSight/src/app/__tests__/workspace-documents.test.js)
- [workspace-events.test.js](/D:/Projects/InkSight/src/app/__tests__/workspace-events.test.js)
- [layout-controls.test.js](/D:/Projects/InkSight/src/app/__tests__/layout-controls.test.js)
- [reader-toolbar-events.test.js](/D:/Projects/InkSight/src/app/__tests__/reader-toolbar-events.test.js)
- [project-workspace.test.js](/D:/Projects/InkSight/src/app/__tests__/project-workspace.test.js)

后续新增模块时，建议同步新增对应模块级测试，而不是只依赖全量回归。
