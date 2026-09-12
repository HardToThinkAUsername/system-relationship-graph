# 贡献指南

感谢你愿意为「系统关系图谱」做贡献！项目很小，规则也简单。

## 运行

```bash
./server.sh start            # 或 python3 server.py
```

浏览器打开 <http://localhost:8000>，首次没有 `data.json` 会自动用 `data.example.json` 的演示数据。

## 开发约定

- **前端** `app.js`：原生 JavaScript + AntV G6，沿用 ES5 风格 IIFE、中文注释。
- **后端** `server.py`：Python 标准库，一个函数做一件事。
- **数据**：演示/示例请改 `data.example.json`；`data.json` 不入库（含内网敏感信息）。

## 提交前检查

```bash
node --check app.js
python3 -m py_compile server.py
```

## 提 PR 的流程

1. Fork 本仓库，新建分支（如 `feat/xxx`、`fix/xxx`）。
2. 改动尽量小、聚焦一个点。
3. 更新受影响的文档（README / docs/design.md）。
4. 提交并创建一个 Pull Request，说明「做了什么 / 为什么」。

## 议题（Issue）

- Bug：描述复现步骤 + 环境（浏览器、Python 版本）。
- 功能建议：描述使用场景和期望行为。

> 请不要在 Issue 里贴真实内网 IP、域名、账号口令等敏感信息。