#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统关系图谱 —— 极简本地服务

用法:
    python3 server.py [端口]      # 默认 8000

启动后浏览器打开 http://localhost:8000 即可。
所有数据都存在同目录下的 data.json 里，可以随时手动编辑；页面里点"保存"也会写回这个文件。
"""

import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT, "data.json")
# 首次克隆时仓库没有 data.json（真实台账不入库），回退到这份脱敏演示数据
DATA_EXAMPLE_FILE = os.path.join(ROOT, "data.example.json")


def normalize(data):
    """把旧格式 / 空文件统一成 {'graphs': [...], 'active': ...}"""
    if not isinstance(data, dict):
        data = {}
    graphs = data.get("graphs")
    if not isinstance(graphs, list):
        # 旧单图格式 {nodes, edges}
        nodes = data.get("nodes") if isinstance(data.get("nodes"), list) else []
        edges = data.get("edges") if isinstance(data.get("edges"), list) else []
        graphs = [{"id": "g1", "name": "默认架构", "nodes": nodes, "edges": edges}]
    out = []
    for g in graphs:
        if not isinstance(g, dict):
            continue
        out.append({
            "id": str(g.get("id") or "g"),
            "name": str(g.get("name") or "未命名"),
            "nodes": g.get("nodes") if isinstance(g.get("nodes"), list) else [],
            "edges": g.get("edges") if isinstance(g.get("edges"), list) else [],
        })
    if not out:
        out = [{"id": "g1", "name": "默认架构", "nodes": [], "edges": []}]
    ids = [g["id"] for g in out]
    active = data.get("active")
    if active not in ids:
        active = out[0]["id"]
    return {"graphs": out, "active": active}


def load_data():
    path = DATA_FILE if os.path.exists(DATA_FILE) else DATA_EXAMPLE_FILE
    if not os.path.exists(path):
        return normalize({})
    try:
        with open(path, "r", encoding="utf-8") as f:
            return normalize(json.load(f))
    except (OSError, ValueError):
        return normalize({})


def save_data(data):
    normalized = normalize(data)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/data":
            self._send_json(load_data())
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/data":
            try:
                length = int(self.headers.get("Content-Length") or 0)
                data = json.loads(self.rfile.read(length))
                save_data(data)
                self._send_json({"ok": True})
            except Exception as e:  # noqa: BLE001
                self._send_json({"ok": False, "error": str(e)}, 500)
        else:
            self._send_json({"ok": False, "error": "not found"}, 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 52)
    print("  系统关系图谱 已启动")
    print("  浏览器打开:  http://localhost:%d" % port)
    print("  数据文件:    %s" % DATA_FILE)
    print("  按 Ctrl+C 停止")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()