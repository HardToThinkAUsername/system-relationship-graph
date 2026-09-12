# 设计文档（Design）

> 本文说明「系统关系图谱」的定位、技术选型、数据模型、可视化模型与关键实现细节。
> 面向对象：想理解、二次开发或扩展本项目的同学。

## 1. 定位与目标

把公司内部**系统、服务、代理、服务器、工具、数据库**以及它们之间的关系，维护成一张可交互的拓扑图。核心诉求：

1. **台账化**：一份数据即一份「资源台账」，能看、能查、能改。
2. **可视化**：用图和连线直观呈现调用 / 转发 / 部署关系。
3. **可编辑**：页面里点几下就能增删改，不需要懂代码。
4. **轻量**：无数据库、无后端框架、无前端构建，`git clone` 即可跑。

## 2. 设计原则

- **纯手动维护**：不做任何自动发现（不扫网段、不装 agent、不读配置），数据由人填写。
- **单一数据源**：所有数据是**一个 `data.json`**，前后端都以它为准。
- **零依赖运行**：服务端只用 Python 标准库，前端只用原生 JS + 本地化的 G6，离线可用。
- **约定大于配置**：六种固定节点类型，不强求字段齐全，缺省即空。

## 3. 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 服务端 | `http.server`（Python 标准库） | 无需 pip install，一条 `GET/POST /api/data` 足够 |
| 图引擎 | AntV G6 v4（UMD，本地 `vendor/`） | 成熟的节点-连线图库，自定义节点/边能力强 |
| 前端 | 原生 JavaScript（ES5 风格 IIFE） | 不引构建链，改完刷新即生效 |
| 数据 | 单文件 JSON | 人可读、可 diff、可版本管理 |

**关键取舍**：用 G6 自带的力导向布局（force）+ 自定义节点形状，而不是手写 SVG/Canvas，省掉大量命中检测、拖拽、缩放逻辑。

## 4. 整体架构

```
浏览器 (index.html + style.css + app.js + vendor/g6.min.js)
        │  GET  /          静态页面
        │  GET  /api/data  读 data.json
        └─ POST /api/data  写 data.json（页面「保存」时触发）
                │
        server.py ──> data.json （缺省时回退 data.example.json）
```

### 前端模块划分（app.js，单文件 IIFE）

- `state`：`{ graphs: [], active }`，全局数据状态。
- 数据访问器：`state.nodes` / `state.edges`（活动架构的节点/边）。
- 节点注册：`drawRelNode`（六种类型按 `type` 绑定形状 + 颜色）。
- 边模型：`edgeModel`（含反向边自动弧线逻辑）。
- 渲染：`renderAll` / `refreshGraph`（后者负责**保留视口**的全量重绘）。
- 面板：`openNodePanel` / `openEdgePanel` / `openAddNode` / `openAddEdge`。
- 持久化：`save` → `POST /api/data`。
- 架构：`switchTo` / `newArch` / `renameArch` / `deleteArch`，及 `subArch` 下钻。

## 5. 数据模型

顶层：

```json
{ "graphs": [ { "id", "name", "nodes": [...], "edges": [...] } ], "active": "<当前架构id>" }
```

### 节点（node）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 全局唯一 |
| `name` | string | 显示名 |
| `type` | enum | `system` / `service` / `proxy` / `server` / `tool` / `db` |
| `server` | string | 所属服务器/环境（自由文本） |
| `ip` | string | IP 或域名 |
| `url` | string | 访问地址 |
| `owner` | string | 责任人 |
| `desc` | string | 说明 |
| `x` / `y` | number? | 可选，锁定位置；缺省由布局排布 |
| `subArch` | string? | 可选，指向另一个架构的 `id`，表示有内部架构 |

六种 `type` → 形状 / 颜色映射如下（示意图例见产品内左下角）：

- `system`：圆角矩形，主色
- `service`：胶囊/圆角矩形，次色
- `proxy`：六边形，转发色
- `server`：矩形（机箱感），服务器色
- `tool`：菱形，工具色
- `db`：圆柱体（上椭圆 + 下矩形），数据库色

### 边（edge）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 全局唯一 |
| `from` | string | 源节点 id |
| `to` | string | 目标节点 id |
| `label` | string | 关系名（线上文字） |
| `desc` | string | 关系说明 |

## 6. 可视化模型

### 6.1 节点

用 G6 `registerNode` 自定义，`group.addShape` 组合形状与两段文字：

- 主形状（keyShape，决定命中区域与拖拽）。
- 内部第一行：`ip` 的后两位（小字，便于一眼区分同 IP 的服务）。
- 主形状下方：`name` 标签。

**光标 / 拖拽修复**：G6 v4 中，只有 `keyShape` 被自动标记 `draggable`，文字 shape 与会 `capture` 命中，导致悬停在文字上时光标是箭头、无法拖拽。修复方式：给文字和 db 圆柱盖等 shape 显式加上 `cursor: "pointer"` 与 `draggable: true`。

### 6.2 边与反向弧

默认边为直线带箭头。当一对节点存在**双向访问**（A→B 且 B→A）时，两条边各自变成二次贝塞尔曲线（`quadratic`）：

- 两条反向边使用**同号** `curveOffset`。
- G6 的二次曲线控制点 = 中点 + 方向向量的**垂向量** × `curveOffset`；反向边的方向相反，垂向量随之翻转，因此同号 offset 会让两条弧朝相反方向凸起，天然分开。
- `curveOffset` 写在**边模型顶层**（不是 `style` 里），因为 G6 读的是 `t.curveOffset`。

### 6.3 布局

- 初始 `layout: { type: "preset" }`：按节点 `x`/`y` 摆放，无坐标时用「重新布局」。
- 「↻ 重新布局」切到 force（`preventOverlap` + 排斥力），跑完重置回 preset 以锁定位置。

## 7. 关键实现细节

### 7.1 保存后 / 切主题后「画布跳走」的修复

现象：编辑节点保存、或切换深浅色后，整张图突然挪位或消失。

根因两处叠加：

1. `graph.clear()` 会重启根视图 group 并把它重置为**单位矩阵**，等于清掉缩放与平移。
2. 早前用 `graph.zoomTo(zoom, center)` 恢复时，把**世界坐标**当成了 `zoom()` 所需的**画布坐标**传入，恢复错误。

修复：`refreshGraph()` 在 `clear()` 前把根 group 的完整变换矩阵 `getMatrix().slice()` 存下，`clear()` 后 `setMatrix(saved)` 原样写回，再重渲染。

```js
function refreshGraph() {
  var g = graph.get("group"), saved = null;
  if (g && g.getMatrix()) saved = g.getMatrix().slice();
  graph.clear();
  var g2 = graph.get("group");
  if (saved && g2) g2.setMatrix(saved);
  renderAll(); applySelection(); applyFilters();
  if (!saved) graph.fitView(48);
}
```

### 7.2 反向边弧线（同上第 6.2 节）

### 7.3 删除快捷键

全局 `keydown` 监听 `Delete`/`Backspace`，仅当「焦点不在输入框 / 下拉 / 可编辑区」时，删除当前选中的节点或边，避免在编辑文字时误删。

## 8. 交互清单

- 平移 / 缩放 / 拖节点 / 点选编辑 / Delete 删除 / 添加节点 / 添加关系 / 保存写回。
- 图例筛选、搜索定位、列表视图、深浅色主题、导出导入。
- 多架构切换与增删改、`subArch` 下钻与「返回上层」。

## 9. 已知限制与扩展方向

**已知限制**

- 单数据文件：超大图（成千上万个节点）性能会下降，暂无分页/懒加载。
- 无鉴权：服务监听 `0.0.0.0`，内网任何人都能改数据，敏感环境建议加上反向代理鉴权或改监听地址。
- 无历史版本：`data.json` 被覆盖即丢，建议结合 git 或「导出」做备份。

**扩展方向**

- 节点富字段（环境 / 状态 / 标签）、按 tag 多条件筛选。
- 关系类型区分（调用 vs 部署 vs 依赖），不同线型或颜色。
- 导入导出多格式（CSV / Excel / PlantUML）。
- 快照与 diff、操作审计日志。

## 10. 代码约定

- 前端为原生 JS，ES5 风格 + IIFE，注释用中文，贴近已有代码。
- 后端为 Python 标准库，函数短小、一个函数一件事。
- 提交前跑 `node --check app.js` 与 `python3 -m py_compile server.py`.