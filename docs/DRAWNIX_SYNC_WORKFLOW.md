# Drawnix 同步操作说明

本文提供 InkSight 中 `drawnix-repo` 的日常同步命令与推荐操作顺序。

相关文件：

- `scripts/drawnix-sync.ps1`
- `docs/DRAWNIX_SYNC_MAINTENANCE.md`
- `docs/DRAWNIX_FORK_PATCHES.md`

## 1. 当前 remote 结构

`drawnix-repo` 当前按标准 fork 结构维护：

- `origin`: 你自己的 Drawnix fork
- `upstream`: 官方 Drawnix 仓库

建议先确认：

```powershell
git -C drawnix-repo remote -v
```

## 2. 推荐日常命令

### 查看当前状态

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\drawnix-sync.ps1 -Action status
```

会输出：

- remote 配置
- 分支跟踪关系
- 工作区状态

### 拉取上游最新信息

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\drawnix-sync.ps1 -Action fetch
```

### 查看上游最近提交

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\drawnix-sync.ps1 -Action log
```

默认展示 `upstream/main` 最近 20 条提交。

### 查看你自己的 fork 与上游差异

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\drawnix-sync.ps1 -Action diff
```

默认比较：

- `upstream/main...origin/main`

### 一次跑完整检查

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\drawnix-sync.ps1 -Action all
```

## 3. package.json 快捷命令

如果你更习惯用 npm，也可以使用：

```powershell
npm run drawnix:sync:status
npm run drawnix:sync:fetch
npm run drawnix:sync:log
npm run drawnix:sync:diff
npm run drawnix:sync:all
```

## 4. 推荐同步节奏

建议按下面的节奏执行：

1. 每 2 到 4 周执行一次 `drawnix:sync:all`
2. 从最近 upstream commit 中筛选与 InkSight 相关的主题
3. 先更新 `docs/DRAWNIX_FORK_PATCHES.md`
4. 再决定这次是否需要真正合并或 cherry-pick

## 5. 推荐同步流程

### 步骤 1：获取上游信息

```powershell
npm run drawnix:sync:all
```

重点看：

- `packages/drawnix/src`
- `packages/react-board/src`
- `packages/react-text/src`

### 步骤 2：筛选候选改动

优先关注：

- 数据恢复或导出导入问题
- 撤销重做问题
- 移动端、手势、缩放问题
- Mermaid / Markdown / 自动布局相关能力

### 步骤 3：同步前先检查高冲突文件

- `src/drawnix/drawnix/src/data/json.ts`
- `src/drawnix/drawnix/src/drawnix.tsx`
- `src/drawnix/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/*`
- `src/drawnix/drawnix/src/components/toolbar/popup-toolbar/*`

### 步骤 4：更新差异台账

同步前后都建议更新：

- `docs/DRAWNIX_FORK_PATCHES.md`

### 步骤 5：跑 InkSight 自己的保护性测试

至少确认：

- `.inksight` 导入导出
- 高亮、卡片、节点恢复
- `board-ready` 恢复时序
- feature islands 懒加载

## 6. 什么时候不建议立刻同步

遇到下面情况，建议先观察，不要急着吸收：

- 上游只是 UI 或样式细节调整
- 上游改动正好命中你们的高冲突文件，但收益不明显
- 本地正在改白板核心能力，容易和同步互相打架

## 7. 什么时候建议优先同步

遇到下面情况，建议提高优先级：

- 数据损坏、恢复失败、撤销重做异常
- 移动端无法正常使用
- 影响导图布局、TTD 转换、文本编辑的明显 bug
- 上游依赖升级修复兼容性问题
