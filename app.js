/* 系统关系图谱 —— 前端逻辑
 * 数据就是一个 JSON：{ nodes:[], edges:[] }，全部手动维护。
 * 节点类型用「形状 + 颜色」双重区分（形状为主，色弱环境下也能区分）。
 */
(function () {
  "use strict";

  var FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  // —— 节点类型（形状 + 浅/深两套颜色，颜色取自 dataviz 参考调色板）——
  var TYPE_ORDER = ["system", "service", "proxy", "server", "db", "tool"];
  var TYPES = {
    system: { zh: "系统",   shape: "ellipse",  light: "#e87ba4", dark: "#d55181" },
    service:{ zh: "服务",   shape: "circle",   light: "#2a78d6", dark: "#3987e5" },
    proxy:  { zh: "代理",   shape: "diamond",  light: "#eb6834", dark: "#d95926" },
    server: { zh: "服务器", shape: "rect",     light: "#008300", dark: "#008300" },
    db:     { zh: "数据库", shape: "cylinder", light: "#1baf7a", dark: "#199e70" },
    tool:   { zh: "工具",   shape: "triangle", light: "#eda100", dark: "#c98500" }
  };
  var SIZES = { system: [78, 40], service: 40, proxy: 44, server: [50, 36], db: [36, 50], tool: 40 };

  var INK = {
    light: { surface: "#fcfcfb", primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", accent: "#2a78d6" },
    dark:  { surface: "#1a1a19", primary: "#ffffff", secondary: "#c3c2b7", muted: "#898781", accent: "#3987e5" }
  };

  var theme = localStorage.getItem("relmap-theme") || "light";
  var state = { graphs: [], active: null };
  var selected = { kind: null, id: null };
  var hiddenTypes = {};   // 被筛选隐藏的类型
  var graph = null;
  var loaded = false;   // 数据是否已加载（避免加载前的操作误写文件）
  var dragging = false, panning = false;   // 拖动/平移期间暂停 hover 高亮，避免逐帧重绘卡顿

  function activeGraph() {
    return state.graphs.find(function (g) { return g.id === state.active; }) || null;
  }
  // state.nodes / state.edges 始终指向「当前架构」的数组，其余代码无需改动
  Object.defineProperty(state, "nodes", {
    get: function () { var g = activeGraph(); return g ? g.nodes : []; },
    set: function (v) { var g = activeGraph(); if (g) g.nodes = v; }
  });
  Object.defineProperty(state, "edges", {
    get: function () { var g = activeGraph(); return g ? g.edges : []; },
    set: function (v) { var g = activeGraph(); if (g) g.edges = v; }
  });

  function ink() { return INK[theme]; }

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function findNode(id) { return state.nodes.find(function (n) { return n.id === id; }); }
  // 图标内的短地址：IPv4 取后两位（192.168.1.10 -> 1.10），域名取主机名（shop.example.com -> shop）
  function shortHost(ip) {
    if (!ip) return "";
    var s = String(ip).trim().split(":")[0];
    var parts = s.split(".");
    if (parts.length === 4 && parts.every(function (p) { return /^\d{1,3}$/.test(p); })) {
      return parts[2] + "." + parts[3];
    }
    if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(s)) {
      return parts[0];
    }
    return "";
  }
  // 根据背景色亮度选一个可读的文字颜色（深底用白字，浅底用深字）
  function readableText(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0b0b0b" : "#ffffff";
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = "toast"; }, 2000);
  }

  // ---------- 自定义节点：形状按类型区分，内部显示 IP 后两位，下方显示名称 ----------
  function drawRelNode(cfg, group) {
    group.clear();
    var shapeName = (TYPES[cfg.nodeType] || TYPES.service).shape;
    var color = cfg.color, stroke = cfg.strokeColor;
    var w = Array.isArray(cfg.size) ? cfg.size[0] : cfg.size;
    var h = Array.isArray(cfg.size) ? cfg.size[1] : cfg.size;
    var inner = cfg.innerText || "";
    var innerFill = cfg.innerFill || "#ffffff";
    var ls = cfg.labelStyle || { fill: "#0b0b0b", fontSize: 12 };
    var hw = w / 2, hh = h / 2;
    var keyShape = null;

    if (shapeName === "circle") {
      keyShape = group.addShape("circle", { attrs: { x: 0, y: 0, r: hw, fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
    } else if (shapeName === "rect") {
      keyShape = group.addShape("rect", { attrs: { x: -hw, y: -hh, width: w, height: h, radius: 4, fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
    } else if (shapeName === "ellipse") {
      keyShape = group.addShape("ellipse", { attrs: { x: 0, y: 0, rx: hw, ry: hh, fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
    } else if (shapeName === "diamond") {
      keyShape = group.addShape("polygon", { attrs: { points: [[0, -hh], [hw, 0], [0, hh], [-hw, 0]], fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
    } else if (shapeName === "triangle") {
      keyShape = group.addShape("polygon", { attrs: { points: [[0, -hh], [hw, hh], [-hw, hh]], fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
    } else { // cylinder（数据库）
      keyShape = group.addShape("rect", { attrs: { x: -hw, y: -hh + 8, width: w, height: h - 8, radius: [0, 0, 6, 6], fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" } });
      group.addShape("ellipse", { attrs: { x: 0, y: -hh + 8, rx: hw, ry: 7, fill: color, stroke: stroke, lineWidth: 2, cursor: "pointer" }, draggable: true });
    }

    // 内部：IP 后两位
    group.addShape("text", {
      attrs: {
        text: inner, x: 0, y: 2,
        fill: innerFill, fontSize: 10,
        textAlign: "center", textBaseline: "middle", fontFamily: FONT,
        cursor: "pointer"
      },
      draggable: true
    });
    // 下方：名称
    group.addShape("text", {
      attrs: {
        text: cfg.label || "", x: 0, y: h / 2 + 10,
        fill: ls.fill, fontSize: ls.fontSize,
        textAlign: "center", textBaseline: "top", fontFamily: FONT,
        cursor: "pointer"
      },
      draggable: true
    });
    return keyShape;
  }

  G6.registerNode("rel-node", { draw: drawRelNode }, "single-node");

  // ---------- 模型构造 ----------
  function nodeModel(n) {
    var t = TYPES[n.type] || TYPES.service;
    var i = ink();
    var m = {
      id: n.id,
      type: "rel-node",
      label: n.name,
      size: SIZES[n.type] || 40,
      nodeType: n.type,
      name: n.name, server: n.server || "", ip: n.ip || "",
      url: n.url || "", owner: n.owner || "", desc: n.desc || "", subArch: n.subArch || "",
      color: t[theme],
      strokeColor: theme === "dark" ? "#1a1a19" : "#fcfcfb",
      innerText: shortHost(n.ip),
      innerFill: readableText(t[theme]),
      labelStyle: { fill: i.primary, fontSize: 12 }
    };
    if (typeof n.x === "number" && typeof n.y === "number") {
      m.x = n.x; m.y = n.y;
    }
    return m;
  }

  // 同一对节点之间存在反向边（互访）时，两条边各自弯成相反的弧线，避免重叠；只改渲染，不动数据
  function hasReverseEdge(e) {
    return state.edges.some(function (o) {
      return o.id !== e.id && o.from === e.to && o.to === e.from;
    });
  }

  function edgeModel(e) {
    var i = ink();
    var m = {
      id: e.id, source: e.from, target: e.to,
      from: e.from, to: e.to,
      label: e.label || "", desc: e.desc || "",
      style: {
        stroke: i.muted, lineWidth: 1.5,
        endArrow: { path: G6.Arrow.triangle(7, 8, 0), fill: i.muted },
        cursor: "pointer"
      },
      labelCfg: {
        refX: 0, refY: 8, autoRotate: false,
        style: {
          fill: i.secondary, fontSize: 11, fontFamily: FONT,
          background: { fill: i.surface, padding: [3, 5, 3, 5], radius: 3 },
          lineWidth: 0
        }
      }
    };
    // quadratic 的 curveOffset 是边模型顶层的属性（不在 style 里），
    // 反向两边同号即可：方向相反 → 垂向翻转 → 两条弧朝相反方向凸起。
    if (hasReverseEdge(e)) { m.type = "quadratic"; m.curveOffset = 60; }
    return m;
  }

  // ---------- 图初始化 ----------
  function initGraph() {
    var mount = document.getElementById("mount");
    var tooltip = new G6.Tooltip({
      offsetX: 12, offsetY: 12, itemTypes: ["node", "edge"],
      getContent: function (e) { return tooltipHTML(e.item.getModel(), e.item.getType()); }
    });

    graph = new G6.Graph({
      container: mount,
      width: mount.clientWidth, height: mount.clientHeight,
      pixelRatio: 1,   // 固定 1:1 渲染，高 DPI 屏 / 远程桌面下拖动更流畅
      fitView: true, fitViewPadding: 48,
      layout: { type: "preset" },
      modes: { default: ["drag-canvas", "zoom-canvas", "drag-node"] },
      nodeStateStyles: {
        selected: { lineWidth: 4, stroke: "#ff4d4f" },
        dim: { opacity: 0.12 }
      },
      edgeStateStyles: {
        selected: { stroke: ink().accent, lineWidth: 3, opacity: 1 },
        highlight: { stroke: ink().accent, lineWidth: 2.5, opacity: 1 },
        dim: { opacity: 0.08 }
      },
      plugins: [tooltip]
    });

    graph.on("node:click", function (e) { selectNode(e.item.getModel().id); });
    graph.on("edge:click", function (e) { selectEdge(e.item.getModel().id); });
    graph.on("canvas:click", function () { clearSelection(); closePanel(); });
    graph.on("node:mouseenter", function (e) { if (!dragging && !panning) highlightConnected(e.item.getID()); });
    graph.on("node:mouseleave", function () { if (!dragging && !panning) clearHighlight(); });
    graph.on("edge:mouseenter", function (e) { e.item.setState("highlight", true); });
    graph.on("edge:mouseleave", function (e) { e.item.setState("highlight", false); });

    // 拖动节点后把位置写回数据，刷新后保持原样
    graph.on("node:dragstart", function () { dragging = true; tooltip.hide(); });
    graph.on("node:dragend", function () {
      dragging = false;
      capturePositions();
      save();
    });
    // 平移画布期间同样暂停 hover 高亮，减少逐帧重绘
    graph.on("canvas:dragstart", function () { panning = true; tooltip.hide(); });
    graph.on("canvas:dragend", function () { panning = false; });
    // 自动布局（重新布局 / 首次布局）结束后，记录位置并适配视野
    graph.on("afterlayout", function () {
      capturePositions();
      graph.fitView(48);
      if (state.nodes.length) save();
    });

    window.addEventListener("resize", function () {
      if (!graph) return;
      graph.changeSize(mount.clientWidth, mount.clientHeight);
      graph.fitView(48);
    });
  }

  function tooltipHTML(m, type) {
    if (type === "node") {
      var t = TYPES[m.nodeType] || {};
      var h = "<div class='tp'><div class='tp-h'><b>" + esc(m.name || "") + "</b>" +
        "<span class='tp-tag' style='color:" + t[theme] + "'>" + (t.zh || "") + "</span></div>";
      if (m.server) h += "<div>服务器：" + esc(m.server) + "</div>";
      if (m.ip) h += "<div>IP / 域名：" + esc(m.ip) + "</div>";
      if (m.owner) h += "<div>" + esc(m.owner) + "</div>";
      if (m.desc) h += "<div class='tp-d'>" + esc(m.desc) + "</div>";
      return h + "</div>";
    }
    var h = "<div class='tp'><div class='tp-h'><b>" + esc(m.label || "关系") + "</b></div>";
    if (m.desc) h += "<div class='tp-d'>" + esc(m.desc) + "</div>";
    return h + "</div>";
  }

  // ---------- 选择 / 高亮 ----------
  function neighbors(id) {
    var set = new Set([id]);
    state.edges.forEach(function (e) {
      if (e.from === id) set.add(e.to);
      else if (e.to === id) set.add(e.from);
    });
    return set;
  }

  var hasSet = typeof Set !== "undefined";

  function highlightConnected(id) {
    if (!graph) return;
    var nbr = neighbors(id);
    graph.getNodes().forEach(function (n) { n.setState("dim", !nbr.has(n.getID())); });
    graph.getEdges().forEach(function (e) {
      var m = e.getModel();
      e.setState("dim", m.from !== id && m.to !== id);
    });
  }
  function clearHighlight() {
    if (!graph) return;
    graph.getNodes().forEach(function (n) { n.setState("dim", false); });
    graph.getEdges().forEach(function (e) { e.setState("dim", false); });
  }
  function applySelection() {
    if (!graph) return;
    graph.getNodes().forEach(function (n) {
      n.setState("selected", selected.kind === "node" && n.getID() === selected.id);
    });
    graph.getEdges().forEach(function (e) {
      e.setState("selected", selected.kind === "edge" && e.getID() === selected.id);
    });
  }
  function clearSelection() { selected = { kind: null, id: null }; applySelection(); }
  function selectNode(id) { selected = { kind: "node", id: id }; applySelection(); openNodePanel(id); }
  function selectEdge(id) { selected = { kind: "edge", id: id }; applySelection(); openEdgePanel(id); }

  // ---------- 渲染 ----------
  function renderAll() {
    state.nodes.forEach(function (n) { graph.addItem("node", nodeModel(n)); });
    state.edges.forEach(function (e) { graph.addItem("edge", edgeModel(e)); });
  }

  // 把画布上当前所有节点坐标回写到 state（用于持久化）
  function capturePositions() {
    state.nodes.forEach(function (n) {
      var it = graph && graph.findById(n.id);
      if (it) { var m = it.getModel(); if (typeof m.x === "number") { n.x = m.x; n.y = m.y; } }
    });
  }

  // 旧数据里没有坐标时，用一个网格排布兜底，避免全部堆在 (0,0)
  function ensurePositions() {
    var anyMissing = state.nodes.some(function (n) {
      return typeof n.x !== "number" || typeof n.y !== "number";
    });
    if (!anyMissing) return false;
    state.nodes.forEach(function (n, idx) {
      var col = idx % 6, row = Math.floor(idx / 6);
      n.x = col * 170;
      n.y = row * 120;
    });
    return true;
  }

  // 兼容旧数据：把老的 host 字段拆成 server（名称）和 ip
  function migrateNode(n) {
    if (n.host !== undefined) {
      var host = String(n.host || "");
      var m = host.match(/\d{1,3}(?:\.\d{1,3}){3}/);
      if (n.ip === undefined) n.ip = m ? m[0] : "";
      if (n.server === undefined) {
        n.server = host.replace(/\d{1,3}(?:\.\d{1,3}){3}(:\d+)?/g, "").replace(/[（(].*[）)]\s*$/, "").trim();
      }
      delete n.host;
    }
    if (n.server === undefined) n.server = "";
    if (n.ip === undefined) n.ip = "";
  }

  function normalizeNode(raw) {
    var tmp = { id: raw.id, name: raw.name, type: raw.type, server: raw.server, ip: raw.ip, url: raw.url, owner: raw.owner, desc: raw.desc, host: raw.host, subArch: raw.subArch, x: raw.x, y: raw.y };
    migrateNode(tmp);
    var n = {
      id: tmp.id || uid("n"),
      name: String(tmp.name || "未命名"),
      type: TYPES[tmp.type] ? tmp.type : "service",
      server: String(tmp.server || ""),
      ip: String(tmp.ip || ""),
      url: String(tmp.url || ""),
      owner: String(tmp.owner || ""),
      desc: String(tmp.desc || "")
    };
    if (typeof tmp.x === "number" && typeof tmp.y === "number") { n.x = tmp.x; n.y = tmp.y; }
    if (tmp.subArch) n.subArch = String(tmp.subArch);
    return n;
  }
  function normalizeEdge(e) {
    return {
      id: e.id || uid("e"),
      from: e.from, to: e.to,
      label: e.label === undefined ? "" : String(e.label),
      desc: e.desc === undefined ? "" : String(e.desc)
    };
  }

  function refreshGraph() {
    if (!graph || !state.nodes.length) return;
    // 先记下当前视图矩阵（缩放到平移的完整变换），重建后原样恢复，避免画布跳动/飘走
    var g = graph.get("group");
    var saved = null;
    if (g && g.getMatrix()) saved = g.getMatrix().slice();
    graph.clear();
    var g2 = graph.get("group");
    if (saved && g2) g2.setMatrix(saved);
    renderAll();
    applySelection();
    applyFilters();
    if (!saved) graph.fitView(48);
  }

  // ---------- 面板 ----------
  var panel = null; // 惰性取

  function panelEl() { return panel || (panel = document.getElementById("panel")); }

  function typeOptions(cur) {
    return TYPE_ORDER.map(function (k) {
      return "<option value='" + k + "'" + (k === cur ? " selected" : "") + ">" + TYPES[k].zh + "</option>";
    }).join("");
  }

  function closePanel() {
    panelEl().innerHTML =
      "<div class='hint'><h3>怎么用</h3><ul>" +
      "<li>点击任意<b>节点</b>，右侧可编辑它的名称、类型、地址、责任人、描述。</li>" +
      "<li>点击<b>连线</b>，可编辑这条关系（谁连谁、怎么连）。</li>" +
      "<li>顶部「添加节点」「添加关系」新增内容；改完点<b>保存</b>就会写回 data.json。</li>" +
      "<li>左下角图例<b>点击</b>可筛选/隐藏某种类型；拖动节点调整布局。</li>" +
      "</ul></div>";
  }

  function openNodePanel(id) {
    var n = findNode(id);
    if (!n) return;
    var t = TYPES[n.type] || TYPES.service;
    var h = "<div class='panel-head'><span class='dot' style='background:" + t[theme] + "'></span><b>节点</b>" +
      "<button class='link' id='p-rel'>＋ 关联</button>" +
      "<button class='link danger' id='p-del'>删除</button></div>";
    h += "<div class='p-row'><label>名称（唯一显示名）</label><input id='f-name' value='" + esc(n.name) + "'></div>";
    h += "<div class='p-row'><label>类型</label><select id='f-type'>" + typeOptions(n.type) + "</select></div>";
    h += "<div class='p-row'><label>服务器名称</label><input id='f-server' value='" + esc(n.server) + "' placeholder='例如：生产环境'></div>";
    h += "<div class='p-row'><label>服务器 IP / 域名</label><input id='f-ip' value='" + esc(n.ip) + "' placeholder='例如：192.168.1.10'></div>";
    h += "<div class='p-row'><label>URL</label><input id='f-url' value='" + esc(n.url) + "' placeholder='http://...'></div>";
    h += "<div class='p-row'><label>责任人</label><input id='f-owner' value='" + esc(n.owner) + "' placeholder='团队 / 负责人'></div>";
    h += "<div class='p-row'><label>描述 / 实现细节（随便写）</label><textarea id='f-desc' rows='6'>" + esc(n.desc) + "</textarea></div>";
    var sub = n.subArch ? state.graphs.find(function (g) { return g.id === n.subArch; }) : null;
    if (sub) {
      h += "<div class='p-row'><label>内部架构</label><button class='btn-sm primary' id='p-open-sub'>↗ 打开「" + esc(sub.name) + "」</button></div>";
    }
    h += "<div class='p-row'><label>关联内部架构（可选）</label><select id='f-subarch'>" +
      "<option value=''>(无)</option>" +
      state.graphs.filter(function (g) { return g.id !== (activeGraph() ? activeGraph().id : null); }).map(function (g) {
        return "<option value='" + g.id + "'" + (g.id === n.subArch ? " selected" : "") + ">" + esc(g.name) + "</option>";
      }).join("") +
      "</select></div>";
    h += "<div class='p-btns'><button class='btn-sm primary' id='p-save'>保存</button></div>";
    h += relatedHTML(id);
    panelEl().innerHTML = h;

    document.getElementById("p-save").onclick = function () {
      n.name = document.getElementById("f-name").value.trim() || n.name;
      n.type = document.getElementById("f-type").value;
      n.server = document.getElementById("f-server").value.trim();
      n.ip = document.getElementById("f-ip").value.trim();
      n.url = document.getElementById("f-url").value.trim();
      n.owner = document.getElementById("f-owner").value.trim();
      n.desc = document.getElementById("f-desc").value;
      var sa = document.getElementById("f-subarch");
      if (sa) { var sv = sa.value; if (sv) n.subArch = sv; else delete n.subArch; }
      refreshGraph();
      save();
      buildLegend();
      toast("已保存 ✓");
    };
    var openSub = document.getElementById("p-open-sub");
    if (openSub) openSub.onclick = function () { switchTo(n.subArch); };
    document.getElementById("p-del").onclick = function () { deleteNode(id); };
    document.getElementById("p-rel").onclick = function () { openAddEdge(id); };
    bindRelatedDeletes();
  }

  function openEdgePanel(id) {
    var e = state.edges.find(function (x) { return x.id === id; });
    if (!e) return;
    var h = "<div class='panel-head'><b>关系</b><button class='link danger' id='p-del'>删除</button></div>";
    h += "<div class='p-row'><label>起点（from）</label><select id='f-from'>" + nodeOptions(e.from) + "</select></div>";
    h += "<div class='p-row'><label>终点（to）</label><select id='f-to'>" + nodeOptions(e.to) + "</select></div>";
    h += "<div class='p-row'><label>关系标签（如：转发 / 调用 / 读写 / 部署在）</label><input id='f-label' value='" + esc(e.label) + "'></div>";
    h += "<div class='p-row'><label>说明</label><textarea id='f-desc' rows='5'>" + esc(e.desc) + "</textarea></div>";
    h += "<div class='p-btns'><button class='btn-sm primary' id='p-save'>保存</button></div>";
    panelEl().innerHTML = h;

    document.getElementById("p-save").onclick = function () {
      var from = document.getElementById("f-from").value;
      var to = document.getElementById("f-to").value;
      if (from === to) { toast("起点和终点不能相同", true); return; }
      e.from = from; e.to = to;
      e.label = document.getElementById("f-label").value.trim();
      e.desc = document.getElementById("f-desc").value;
      refreshGraph();
      save();
      toast("已保存 ✓");
    };
    document.getElementById("p-del").onclick = function () { deleteEdge(id); };
  }

  function nodeOptions(cur) {
    return state.nodes.map(function (n) {
      return "<option value='" + n.id + "'" + (n.id === cur ? " selected" : "") + ">" + esc(n.name) + " (" + TYPES[n.type].zh + ")</option>";
    }).join("");
  }

  function openAddNode() {
    var h = "<div class='panel-head'><b>添加节点</b></div>";
    h += "<div class='p-row'><label>名称（唯一显示名）</label><input id='f-name' placeholder='例如：订单服务'></div>";
    h += "<div class='p-row'><label>类型</label><select id='f-type'>" + typeOptions("service") + "</select></div>";
    h += "<div class='p-row'><label>服务器名称</label><input id='f-server' placeholder='例如：生产环境'></div>";
    h += "<div class='p-row'><label>服务器 IP / 域名</label><input id='f-ip' placeholder='例如：192.168.1.10'></div>";
    h += "<div class='p-row'><label>URL</label><input id='f-url' placeholder='http://...'></div>";
    h += "<div class='p-row'><label>责任人</label><input id='f-owner' placeholder='团队 / 负责人'></div>";
    h += "<div class='p-row'><label>描述 / 实现细节</label><textarea id='f-desc' rows='5'></textarea></div>";
    h += "<div class='p-btns'><button class='btn-sm primary' id='p-save'>创建</button><button class='btn-sm' id='p-cancel'>取消</button></div>";
    panelEl().innerHTML = h;

    document.getElementById("p-cancel").onclick = closePanel;
    document.getElementById("p-save").onclick = function () {
      var name = document.getElementById("f-name").value.trim();
      if (!name) { toast("名字不能为空", true); return; }
      var node = {
        id: uid("n"), name: name,
        type: document.getElementById("f-type").value,
        server: document.getElementById("f-server").value.trim(),
        ip: document.getElementById("f-ip").value.trim(),
        url: document.getElementById("f-url").value.trim(),
        owner: document.getElementById("f-owner").value.trim(),
        desc: document.getElementById("f-desc").value
      };
      var pos = randomNear();
      node.x = Math.round(pos.x);
      node.y = Math.round(pos.y);
      state.nodes.push(node);
      graph.addItem("node", nodeModel(node));
      graph.focusItem(node.id, { ratio: 0.6 });
      save();
      buildLegend();
      closePanel();
      toast("已添加，记得点左侧图例或节点继续完善关系 ✓");
    };
  }

  function openAddEdge(prefillFrom) {
    if (state.nodes.length < 2) { toast("至少需要两个节点才能建立关系", true); return; }
    var h = "<div class='panel-head'><b>添加关系</b></div>";
    h += "<div class='p-row'><label>起点（from）</label><select id='f-from'>" + nodeOptions(prefillFrom) + "</select></div>";
    h += "<div class='p-row'><label>终点（to）</label><select id='f-to'>" + nodeOptions() + "</select></div>";
    h += "<div class='p-row'><label>关系标签（转发 / 调用 / 读写 / 部署在 / 包含 …）</label><input id='f-label' placeholder='例如：转发'></div>";
    h += "<div class='p-row'><label>说明</label><textarea id='f-desc' rows='5'></textarea></div>";
    h += "<div class='p-btns'><button class='btn-sm primary' id='p-save'>创建</button><button class='btn-sm' id='p-cancel'>取消</button></div>";
    panelEl().innerHTML = h;

    document.getElementById("p-cancel").onclick = closePanel;
    document.getElementById("p-save").onclick = function () {
      var from = document.getElementById("f-from").value;
      var to = document.getElementById("f-to").value;
      if (from === to) { toast("起点和终点不能相同", true); return; }
      var edge = {
        id: uid("e"), from: from, to: to,
        label: document.getElementById("f-label").value.trim(),
        desc: document.getElementById("f-desc").value
      };
      state.edges.push(edge);
      refreshGraph();
      save();
      closePanel();
      toast("已添加关系 ✓");
    };
  }

  function randomNear() {
    var nodes = graph.getNodes();
    if (nodes.length === 0) return { x: 0, y: 0 };
    var sx = 0, sy = 0;
    nodes.forEach(function (n) { var m = n.getModel(); sx += m.x || 0; sy += m.y || 0; });
    sx /= nodes.length; sy /= nodes.length;
    return { x: sx + (Math.random() - 0.5) * 180, y: sy + (Math.random() - 0.5) * 180 };
  }

  function relatedHTML(id) {
    var rels = state.edges.filter(function (e) { return e.from === id || e.to === id; });
    var body = rels.map(function (e) {
      var otherId = e.from === id ? e.to : e.from;
      var other = findNode(otherId);
      var dir = e.from === id ? "→" : "←";
      return "<div class='rel-item'><span class='rel-dir'>" + dir + "</span>" +
        "<span class='rel-name'>" + esc(other ? other.name : otherId) + "</span>" +
        "<span class='rel-label'>" + esc(e.label || "") + "</span>" +
        "<button class='link' data-rm='" + e.id + "'>删</button></div>";
    }).join("");
    return "<div class='related'><label>关联关系（" + rels.length + "）</label>" +
      (body || "<div class='rel-empty'>暂无关系，点上方「＋ 关联」建立连接</div>") + "</div>";
  }

  function bindRelatedDeletes() {
    var items = panelEl().querySelectorAll("[data-rm]");
    items.forEach(function (b) {
      b.onclick = function () { deleteEdge(b.getAttribute("data-rm")); };
    });
  }

  function deleteNode(id) {
    graph.removeItem(id);
    state.edges.filter(function (e) { return e.from === id || e.to === id; }).forEach(function (e) {
      graph.removeItem(e.id);
    });
    state.nodes = state.nodes.filter(function (n) { return n.id !== id; });
    state.edges = state.edges.filter(function (e) { return e.from !== id && e.to !== id; });
    clearSelection(); closePanel(); save(); buildLegend();
    toast("已删除节点及其关系");
  }

  function deleteEdge(id) {
    graph.removeItem(id);
    state.edges = state.edges.filter(function (e) { return e.id !== id; });
    clearSelection(); closePanel(); save();
    toast("已删除关系");
  }

  // ---------- 保存 ----------
  function save() {
    return fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graphs: state.graphs, active: state.active })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) toast("保存失败：" + (res.error || "未知错误"), true);
    }).catch(function (err) { toast("保存失败：" + err.message, true); });
  }

  // ---------- 图例 / 筛选 ----------
  function buildLegend() {
    var el = document.getElementById("legend");
    el.innerHTML = TYPE_ORDER.map(function (k) {
      var t = TYPES[k];
      return "<button class='lg-item" + (hiddenTypes[k] ? " off" : "") + "' data-type='" + k + "'>" +
        "<span class='sw' style='background:" + t[theme] + "'></span>" + t.zh + "</button>";
    }).join("");
    el.querySelectorAll(".lg-item").forEach(function (b) {
      b.onclick = function () {
        hiddenTypes[b.getAttribute("data-type")] = !hiddenTypes[b.getAttribute("data-type")];
        buildLegend();
        applyFilters();
      };
    });
  }

  function applyFilters() {
    if (!graph) return;
    var hidden = TYPE_ORDER.filter(function (k) { return hiddenTypes[k]; });
    graph.getNodes().forEach(function (n) {
      var m = n.getModel();
      if (hidden.indexOf(m.nodeType) >= 0) n.hide(); else n.show();
    });
    graph.getEdges().forEach(function (ed) {
      var m = ed.getModel();
      var s = graph.findById(m.from), t = graph.findById(m.to);
      if (s.isVisible() && t.isVisible()) ed.show(); else ed.hide();
    });
  }

  // ---------- 列表视图 ----------
  function renderTable() {
    var el = document.getElementById("table-view");
    var rows = state.nodes.map(function (n) {
      return "<tr data-id='" + n.id + "'><td>" + esc(n.name) + "</td>" +
        "<td>" + TYPES[n.type].zh + "</td><td>" + esc(n.server) + "</td><td>" + esc(n.ip) + "</td>" +
        "<td>" + esc(n.owner) + "</td><td class='td-desc'>" + esc((n.desc || "").slice(0, 40)) + "</td></tr>";
    }).join("");
    el.querySelector("tbody").innerHTML = rows || "<tr><td colspan='6'>暂无节点</td></tr>";
    el.querySelectorAll("tbody tr[data-id]").forEach(function (tr) {
      tr.onclick = function () {
        var id = tr.getAttribute("data-id");
        el.classList.add("hidden");
        selectNode(id);
        graph.focusItem(id, { ratio: 0.6 });
      };
    });
  }

  // ---------- 主题 ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("btn-theme").textContent = theme === "light" ? "🌙" : "☀️";
    localStorage.setItem("relmap-theme", theme);
    buildLegend();
    refreshGraph();
  }

  // ---------- 导出 ----------
  function exportJSON() {
    var blob = new Blob([JSON.stringify({ graphs: state.graphs, active: state.active }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 导入 ----------
  function triggerImport() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { importData(reader.result); };
      reader.onerror = function () { toast("读取文件失败", true); };
      reader.readAsText(f, "utf-8");
    };
    inp.click();
  }

  function importData(text) {
    var d, graphs;
    try {
      d = JSON.parse(text);
      if (d && Array.isArray(d.graphs)) graphs = d.graphs;
      else if (d && Array.isArray(d.nodes)) graphs = [{ id: "g1", name: "默认架构", nodes: d.nodes, edges: d.edges || [] }];
      else throw new Error("格式不对：需要 { graphs: [...] } 或 { nodes: [...] }");

      graphs = graphs.map(function (g) {
        return {
          id: g.id || uid("g"),
          name: String(g.name || "未命名"),
          nodes: (Array.isArray(g.nodes) ? g.nodes : []).map(normalizeNode),
          edges: (Array.isArray(g.edges) ? g.edges : []).map(normalizeEdge)
        };
      }).filter(function (g) { return g.nodes.length; });

      graphs.forEach(function (g) {
        var ids = {};
        g.nodes.forEach(function (n) { ids[n.id] = true; });
        g.edges = g.edges.filter(function (e) { return e.from && e.to && ids[e.from] && ids[e.to]; });
      });
    } catch (e) {
      toast("导入失败：" + (e && e.message ? e.message : "文件格式错误"), true);
      return;
    }

    if (!graphs.length) { toast("文件里没有有效节点", true); return; }
    var total = graphs.reduce(function (s, g) { return s + g.nodes.length; }, 0);
    if (!window.confirm("将用文件里的 " + graphs.length + " 个架构、" + total + " 个节点覆盖当前 " + state.graphs.length + " 个架构，确定导入？")) return;

    state.graphs = graphs;
    state.active = graphs[0].id;
    renderArchSelect();
    switchTo(null);
    toast("已导入 " + graphs.length + " 个架构，共 " + total + " 个节点 ✓");
  }

  // ---------- 多架构 ----------
  // 找到「哪张架构里有个节点把 gid 当作它的内部架构」——用于返回上层按钮
  function parentGraphOf(gid) {
    for (var i = 0; i < state.graphs.length; i++) {
      var g = state.graphs[i];
      if (g.id === gid) continue;
      if (g.nodes.some(function (n) { return n.subArch === gid; })) return g;
    }
    return null;
  }
  function updateArchBackButton() {
    var b = document.getElementById("btn-arch-back");
    if (!b) return;
    var cur = activeGraph();
    var p = cur ? parentGraphOf(cur.id) : null;
    if (p) {
      b.style.display = "";
      b.textContent = "← 返回「" + p.name + "」";
      b.onclick = function () { switchTo(p.id); };
    } else {
      b.style.display = "none";
    }
  }
  function renderArchSelect() {
    var sel = document.getElementById("arch-select");
    if (!sel) return;
    sel.innerHTML = state.graphs.map(function (g) {
      return "<option value='" + g.id + "'>" + esc(g.name) + "</option>";
    }).join("");
    sel.value = state.active;
  }

  function switchTo(gid) {
    if (gid) state.active = gid;
    if (!activeGraph() && state.graphs.length) state.active = state.graphs[0].id;
    renderArchSelect();
    updateArchBackButton();
    clearSelection();
    closePanel();
    ensurePositions();
    graph.clear();
    renderAll();
    graph.fitView(48);
    applyFilters();
    if (loaded) save();
  }

  function loadArchitectures(d) {
    var graphs;
    if (d && Array.isArray(d.graphs)) graphs = d.graphs;
    else if (d && Array.isArray(d.nodes)) graphs = [{ id: "g1", name: "默认架构", nodes: d.nodes, edges: d.edges || [] }];
    else graphs = [];

    state.graphs = graphs.map(function (g) {
      return {
        id: g.id || uid("g"),
        name: String(g.name || "未命名"),
        nodes: (Array.isArray(g.nodes) ? g.nodes : []).map(normalizeNode),
        edges: (Array.isArray(g.edges) ? g.edges : []).map(normalizeEdge)
      };
    });
    state.graphs.forEach(function (g) {
      var ids = {};
      g.nodes.forEach(function (n) { ids[n.id] = true; });
      g.edges = g.edges.filter(function (e) { return e.from && e.to && ids[e.from] && ids[e.to]; });
    });

    if (!state.graphs.length) state.graphs = [{ id: uid("g"), name: "默认架构", nodes: [], edges: [] }];
    var want = (d && d.active) ? d.active : state.graphs[0].id;
    state.active = state.graphs.some(function (g) { return g.id === want; }) ? want : state.graphs[0].id;

    loaded = true;
    renderArchSelect();
    switchTo(null);
  }

  function newArch() {
    var name = window.prompt("新架构名称：", "架构 " + (state.graphs.length + 1));
    if (name == null) return;
    name = String(name).trim() || "未命名";
    var g = { id: uid("g"), name: name, nodes: [], edges: [] };
    state.graphs.push(g);
    switchTo(g.id);
    toast("已新建架构「" + name + "」✓");
  }

  function renameArch() {
    var g = activeGraph();
    if (!g) return;
    var name = window.prompt("架构名称：", g.name);
    if (name == null) return;
    name = String(name).trim();
    if (!name) { toast("名称不能为空", true); return; }
    g.name = name;
    renderArchSelect();
    if (loaded) save();
    toast("已重命名 ✓");
  }

  function deleteArch() {
    if (state.graphs.length <= 1) { toast("至少保留一个架构", true); return; }
    var g = activeGraph();
    if (!g) return;
    if (!window.confirm("确定删除架构「" + g.name + "」及其全部节点？")) return;
    state.graphs = state.graphs.filter(function (x) { return x.id !== g.id; });
    switchTo(state.graphs[0].id);
    toast("已删除架构 ✓");
  }

  // ---------- 启动 ----------
  function boot() {
    initGraph();
    closePanel();
    buildLegend();

    document.getElementById("btn-add-node").onclick = openAddNode;
    document.getElementById("btn-add-edge").onclick = function () { openAddEdge(); };
    document.getElementById("btn-relayout").onclick = function () {
      graph.updateLayout({
        type: "force", preventOverlap: true,
        linkDistance: 150, nodeStrength: -1200, nodeSize: 40,
        collideStrength: 0.9, alpha: 0.85, alphaDecay: 0.03, alphaMin: 0.005
      });
      toast("正在重新布局…");
    };
    document.getElementById("btn-export").onclick = exportJSON;
    document.getElementById("btn-import").onclick = triggerImport;
    document.getElementById("arch-select").onchange = function () { switchTo(this.value); };
    document.getElementById("btn-arch-new").onclick = newArch;
    document.getElementById("btn-arch-rename").onclick = renameArch;
    document.getElementById("btn-arch-del").onclick = deleteArch;
    document.getElementById("btn-theme").onclick = function () {
      theme = theme === "light" ? "dark" : "light";
      applyTheme();
    };
    document.getElementById("btn-table").onclick = function () {
      var el = document.getElementById("table-view");
      renderTable();
      el.classList.toggle("hidden");
    };
    document.getElementById("tv-close").onclick = function () {
      document.getElementById("table-view").classList.add("hidden");
    };

    var search = document.getElementById("search");
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      graph.getNodes().forEach(function (n) {
        var m = n.getModel();
        n.setState("dim", !!q && (m.name || "").toLowerCase().indexOf(q) === -1);
      });
    });
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var q = search.value.trim().toLowerCase();
      var hit = state.nodes.filter(function (n) { return (n.name || "").toLowerCase().indexOf(q) !== -1; })[0];
      if (hit) { graph.focusItem(hit.id, { ratio: 0.7 }); selectNode(hit.id); }
    });

    // 选中节点/关系后按 Delete 或 Backspace 直接删除（焦点在输入框/下拉/编辑区时不触发）
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)) return;
      if (selected.kind === "node") { e.preventDefault(); deleteNode(selected.id); }
      else if (selected.kind === "edge") { e.preventDefault(); deleteEdge(selected.id); }
    });

    applyTheme();

    fetch("/api/data").then(function (r) { return r.json(); }).then(function (d) {
      loadArchitectures(d);
    }).catch(function (err) {
      toast("加载数据失败：" + err.message, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();