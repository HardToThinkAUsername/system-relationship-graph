# 🕸 系统关系图谱（System Relationship Graph）

把公司里的**系统、服务、代理、服务器、工具、数据库**，连同它们之间的调用 / 转发 / 部署关系，归纳成一张**能拖拽、能筛选、能编辑**的节点-连线图。

- **纯手动维护**：没有任何自动发现、采集或探针，数据来源就是你自己。
- **数据即一个 JSON 文件**：不依赖数据库，改数据就是改 `data.json`。
- **本地 / 内网即可用**：Python 标准库起一个 HTTP 服务，局域网里打开网页就能用。
- **零构建、零依赖**：前端是原生 JavaScript + 本地化的 [AntV G6](https://github.com/antvis/G6)，不需要 npm / webpack。

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="python" src="https://img.shields.io/badge/python-3.x-3776ab.svg" />
  <img alt="platform" src="https://img.shields.io/badge/platform-web-brightgreen.svg" />
  <img alt="no build" src="https://img.shields.io/badge/build-none%20required-lightgrey.svg" />
</p>

---

## ✨ 功能特性

- **六类资源、六种形状**：`system`（系统）/ `service`（服务）/ `proxy`（代理）/ `server`（服务器）/ `tool`（工具）/ `db`（数据库），各自不同的形状与颜色，左下角图例一键**筛选显示/隐藏**。
- **节点-连线图**：力导向布局，拖拽画布平移、滚轮缩放、拖动节点微调位置。
- **点选即编辑**：点击节点或连线，右侧面板编辑名称、类型、地址、责任人、说明，以及这条边代表的关系，保存即写回 `data.json`。
- **增删**：顶部「＋ 添加节点」「⇄ 添加关系」新增；**选中后按 `Delete` 直接删除**。
- **互访边自动分弧**：两个节点互相访问（一对反向边）时，两条边会自动弯成相反方向的弧线，文字也跟着分开，不再重叠。
- **多套架构 + 架构下钻**：可新建 / 切换 / 重命名 / 删除多套隔离的架构；给节点填一个 `subArch`，就能「打开内部架构」下钻，「返回上层」跳回。
- **搜索 / 列表 / 主题 / 导入导出**：顶栏按名称搜索并定位；「☰ 列表」表格查看全部节点；🌙/☀️ 深浅色主题；「⬇ 导出」备份、「⇪ 导入」覆盖（自动兼容旧格式）。

## 🚀 快速开始

要求：Python 3（无需安装任何第三方包）。

```bash
# 方式一：用控制脚本（启动 / 关闭 / 重启 / 查看状态）
./server.sh start          # 默认 8000 端口
./server.sh status
./server.sh stop

# 方式二：前台直接跑
python3 server.py          # 或 python3 server.py 9000 指定端口
```

启动后浏览器打开 <http://localhost:8000>（另一台电脑用 `http://<你的机器IP>:8000`）。

> **数据从哪来？** 仓库自带一份脱敏演示数据 `data.example.json`。首次运行时若同目录下没有 `data.json`，服务会自动回退展示这份演示数据。想开始记录自己的台账，直接：

```bash
cp data.example.json data.json
```

然后按你的真实情况编辑 `data.json`（也可以直接打开网页，通过右侧面板增删改）。

> ⚠️ `data.json` 已被 `.gitignore` 隔离，**不会被提交**——它可能包含内网 IP、域名、同事姓名等敏感信息。

## 📖 使用说明

| 操作 | 怎么做 |
| --- | --- |
| 平移画布 | 拖动空白处 |
| 缩放 | 滚轮 |
| 移动节点 | 按住节点拖动 |
| 选中 / 编辑 | 点击节点或连线，右侧面板编辑后点「保存」 |
| 删除 | 选中节点或连线后按 `Delete`（或 `Backspace`） |
| 新增节点 / 关系 | 顶栏「＋ 添加节点」「⇄ 添加关系」 |
| 筛选 | 左下角图例点某类资源隐藏/显示 |
| 搜索定位 | 顶栏输入名称回车 |
| 列表查看 | 顶栏「☰ 列表」 |
| 深浅色 | 顶栏 🌙/☀️ |
| 切换 / 管理架构 | 顶栏「架构」下拉 + ／✎／🗑 按钮 |
| 架构下钻 | 节点填了 `subArch` 后，面板出现「打开内部架构」 |
| 备份 / 还原 | 顶栏「⬇ 导出」「⇪ 导入」 |

## 📚 数据格式

所有数据都在 `data.json`，按「架构」分组，每套架构独立一套节点和关系：

```json
{
  "graphs": [
    {
      "id": "demo",
      "name": "示例架构",
      "nodes": [
        {
          "id": "order-svc",
          "name": "订单服务",
          "type": "service",
          "server": "示例环境",
          "ip": "10.0.0.21",
          "url": "",
          "owner": "后端组",
          "desc": "订单下单、拆单、状态流转",
          "subArch": "order-internal"
        }
      ],
      "edges": [
        { "id": "e1", "from": "gateway", "to": "order-svc", "label": "转发", "desc": "这条关系的说明" }
      ]
    }
  ],
  "active": "demo"
}
```

- 节点 `type` 六种：`system` / `service` / `proxy` / `server` / `tool` / `db`。
- 可选字段 `subArch`：填「其他架构的 id」，即表示该节点有一个内部架构，面板会出现「打开内部架构」下钻。
- 可选字段 `x` / `y`：锁定节点位置；不填则由力导向布局自动排布。
- 旧单图格式 `{ "nodes": [...], "edges": [...] }`、旧 `host` 字段都自动兼容。

## 🧭 设计文档

实现细节、数据模型、可视化模型、关键代码思路（视口保真、反向边弧线、光标修复等）见：

👉 **[docs/design.md](docs/design.md)**

## 🏗 项目结构

```
.
├── server.py              # 极简本地服务（Python 标准库，无依赖）
├── server.sh              # 启动 / 关闭 / 重启 / 状态 控制脚本
├── index.html             # 页面骨架
├── style.css              # 样式（含深浅色主题）
├── app.js                 # 全部前端逻辑（原生 JS，IIFE）
├── vendor/g6.min.js       # AntV G6（已本地化，离线可用）
├── data.example.json      # 脱敏演示数据（首次运行自动回退到它）
└── data.json              # 你的真实台账（本地文件，不入库）
```

## 🤝 贡献

欢迎提 Issue / Pull Request。开始前请先读一下 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 🔗 第三方依赖

- [AntV G6](https://github.com/antvis/G6) —— 图可视化引擎，MIT 协议，已本地化到 `vendor/`，离线可用。

## 📄 License

[MIT](LICENSE) © 2026 HardToThinkAUsername