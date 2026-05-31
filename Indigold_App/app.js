/* Indigold v0.1 — application shell (vanilla JS, no bundler, no network).
 * Drives 7 mobile-first views from local synthetic fixtures.
 * CARDINAL RULE honored in code: every fetch is a relative, same-origin path
 * into this workspace. There are zero external/CDN/API calls. */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    nodes: [],
    edges: [],
    timeline: [],
    byId: {},
    mdCache: {},
    loaded: false,
    timelineTracks: null // null = all
  };

  var ROUTES = ["inbox", "dashboard", "timeline", "atlas", "context", "brief", "io"];
  var view = document.getElementById("view");

  // ---------------------------------------------------------------------------
  // Tiny helpers
  // ---------------------------------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function layerName(L) {
    return ({ A: "Raw Source", B: "Normalized", C: "Knowledge", D: "Inference", E: "Recommendation", F: "Action" })[L] || L;
  }
  function layerChip(L) {
    return '<span class="chip layer layer-' + esc(L) + '">Layer ' + esc(L) + ' · ' + esc(layerName(L)) + "</span>";
  }
  function mvsBadge(m) {
    if (!m) return "";
    return '<span class="mvs"><span class="dot"></span>MVS ' + esc(m.score) + "</span>";
  }
  function lifeChip(m) {
    if (!m) return "";
    return '<span class="chip life life-' + esc(m.lifecycle) + '">' + esc(m.lifecycle) + "</span>";
  }

  // ---------------------------------------------------------------------------
  // Minimal Markdown -> HTML (headings, bold/italic/code/links, lists, hr,
  // blockquote, GFM pipe tables). Sufficient for the v0.1 fixtures only.
  // ---------------------------------------------------------------------------
  function stripFrontmatter(text) {
    var m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (m) return { fm: m[1], body: text.slice(m[0].length) };
    return { fm: "", body: text };
  }
  function parseFrontmatter(fm) {
    // Minimal YAML: scalars + a single-level list (key:\n  - item).
    var out = {}, lines = fm.split("\n"), i, key = null;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var listItem = /^\s*-\s+(.*)$/.exec(line);
      if (listItem && key) {
        if (!Array.isArray(out[key])) out[key] = [];
        out[key].push(unquote(listItem[1]));
        continue;
      }
      var kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
      if (kv) {
        key = kv[1];
        out[key] = kv[2] === "" ? "" : unquote(kv[2]);
      }
    }
    return out;
  }
  function unquote(s) {
    s = s.trim();
    if ((s[0] === '"' && s.slice(-1) === '"') || (s[0] === "'" && s.slice(-1) === "'")) return s.slice(1, -1);
    return s;
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
      // Only allow same-doc / relative links; never emit external navigation.
      var safe = /^https?:/i.test(u) ? "#" : esc(u);
      return '<a href="' + safe + '">' + t + "</a>";
    });
    s = s.replace(/&amp;rarr;/g, "&rarr;");
    return s;
  }
  function md(text) {
    var body = stripFrontmatter(text).body;
    var lines = body.split("\n");
    var html = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      // Table block
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        var header = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        html.push(renderTable(header, rows));
        continue;
      }
      // Headings
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { var lv = h[1].length; html.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">"); i++; continue; }
      // HR
      if (/^\s*---\s*$/.test(line)) { html.push("<hr/>"); i++; continue; }
      // Blockquote
      if (/^\s*>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        html.push("<blockquote>" + inline(quote.join(" ")) + "</blockquote>");
        continue;
      }
      // Unordered list
      if (/^\s*[-*]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { ul.push("<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>"); i++; }
        html.push("<ul>" + ul.join("") + "</ul>");
        continue;
      }
      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { ol.push("<li>" + inline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>"); i++; }
        html.push("<ol>" + ol.join("") + "</ol>");
        continue;
      }
      // Paragraph (gather until blank)
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*>|\s*\|)/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      if (para.length) html.push("<p>" + inline(para.join(" ")) + "</p>");
    }
    return '<div class="md">' + html.join("\n") + "</div>";
  }
  function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }
  function renderTable(header, rows) {
    var th = header.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("");
    var body = rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
    }).join("");
    return "<table><thead><tr>" + th + "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  // ---------------------------------------------------------------------------
  // Data loading (all relative, same-origin)
  // ---------------------------------------------------------------------------
  function loadJSON(path) { return fetch(path).then(function (r) { return r.json(); }); }
  function loadText(path) {
    if (state.mdCache[path]) return Promise.resolve(state.mdCache[path]);
    return fetch(path).then(function (r) { return r.text(); }).then(function (t) { state.mdCache[path] = t; return t; });
  }

  function bootData() {
    return Promise.all([
      loadJSON("./sample_nodes.json"),
      loadJSON("./sample_edges.json"),
      loadJSON("./sample_timeline.json")
    ]).then(function (res) {
      setData(res[0].nodes || [], res[1].edges || [], res[2].events || []);
      state.loaded = true;
    });
  }
  function setData(nodes, edges, timeline) {
    state.nodes = nodes;
    state.edges = edges;
    state.timeline = timeline;
    state.byId = {};
    nodes.forEach(function (n) { state.byId[n.id] = n; });
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  function nodeCard(n, opts) {
    opts = opts || {};
    var actions = opts.triage ? '<button class="btn btn-sm" data-triage="' + esc(n.id) + '">Triage</button>' : "";
    return (
      '<div class="card" data-node="' + esc(n.id) + '">' +
        '<div class="card-row"><h3>' + esc(n.title) + "</h3>" + mvsBadge(n.memory) + "</div>" +
        '<p class="snippet">' + esc(n.snippet || "") + "</p>" +
        '<div class="meta-row">' + layerChip(n.primary_truth_layer || n.truth_layers[0]) + lifeChip(n.memory) +
          '<span class="chip">' + esc(n.type) + "</span>" +
          (opts.triage ? '<span style="flex:1"></span>' + actions : "") +
        "</div>" +
      "</div>"
    );
  }

  var Views = {
    inbox: function () {
      var items = state.nodes.filter(function (n) {
        return n.memory && (n.memory.lifecycle === "promote" || n.memory.lifecycle === "review");
      });
      // Newest first, then top up with recently-updated nodes.
      var extra = state.nodes.slice().sort(function (a, b) {
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      }).filter(function (n) { return items.indexOf(n) === -1; }).slice(0, 3);
      var feed = items.concat(extra);
      return (
        '<h1 class="view-title">Inbox</h1>' +
        '<p class="view-sub">Captured synthetic items awaiting triage · ' + feed.length + " items</p>" +
        feed.map(function (n) { return nodeCard(n, { triage: true }); }).join("") +
        '<p class="note">Triage is a mock action in v0.1 — it opens the item; nothing is sent anywhere.</p>'
      );
    },

    dashboard: function () {
      return Promise.all([loadText("./sample_dashboard.md"), loadText("./fake_vault/05_IDENTITY_ENGINE/identity_profile.md")])
        .then(function (texts) {
          return (
            md(texts[0]) +
            '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:18px 0"/>' +
            '<p class="kicker">Identity Engine · synthetic</p>' +
            md(texts[1])
          );
        });
    },

    timeline: function () {
      var tracks = {};
      state.timeline.forEach(function (e) { tracks[e.track] = true; });
      var allTracks = Object.keys(tracks);
      var active = state.timelineTracks;
      var filterHtml = '<div class="track-filter">' +
        '<span class="chip' + (active === null ? " on" : "") + '" data-track="__all">All</span>' +
        allTracks.map(function (t) {
          var on = active && active.indexOf(t) !== -1;
          return '<span class="chip' + (on ? " on" : "") + '" data-track="' + esc(t) + '">' + esc(t.replace(/_/g, " ")) + "</span>";
        }).join("") + "</div>";

      var events = state.timeline.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (active) events = events.filter(function (e) { return active.indexOf(e.track) !== -1; });

      var rows = events.map(function (e) {
        var n = state.byId[e.node_id];
        return (
          '<div class="tl-event"' + (n ? ' data-node="' + esc(e.node_id) + '"' : "") + ">" +
            '<div class="tl-date">' + esc(e.date) + ' · <span class="tl-track">' + esc(e.track.replace(/_/g, " ")) + "</span></div>" +
            '<div class="card-row"><h3 style="font-size:15px;margin:2px 0">' + esc(e.title) + "</h3>" + layerChip(e.truth_layer) + "</div>" +
            '<p class="snippet">' + esc(e.project) + " · " + esc(e.type) + "</p>" +
          "</div>"
        );
      }).join("");

      return (
        '<h1 class="view-title">Timeline</h1>' +
        '<p class="view-sub">Multi-track temporal layer · ' + events.length + " events</p>" +
        filterHtml +
        '<div class="timeline">' + (rows || '<p class="empty">No events on selected tracks.</p>') + "</div>"
      );
    },

    atlas: function () {
      return (
        '<h1 class="view-title">Liminal Atlas</h1>' +
        '<p class="view-sub">Interactive knowledge graph · ' + state.nodes.length + " nodes · " + state.edges.length + " edges</p>" +
        '<div class="atlas-wrap"><canvas id="atlas-canvas"></canvas>' +
        '<div class="atlas-hint">Tap a node for its Truth Layer &amp; Memory Value Score · drag to nudge</div></div>' +
        '<p class="note">v0.1 renders a self-contained force layout (no CDN). Encompass relationship-mapping placeholder.</p>'
      );
    },

    context: function () {
      return loadText("./sample_context_pack.md").then(function (text) {
        var parts = stripFrontmatter(text);
        var fm = parseFrontmatter(parts.fm);
        var budget = parseInt(fm.token_budget, 10) || 0;
        var estimate = parseInt(fm.token_estimate, 10) || 0;
        var pct = budget ? Math.min(100, Math.round((estimate / budget) * 100)) : 0;
        var sources = Array.isArray(fm.source_nodes) ? fm.source_nodes : [];
        var banner =
          '<div class="fm-banner" style="flex-direction:column;align-items:stretch">' +
            '<div><span class="kicker">Encompass · ' + esc(fm.retrieval || "assembled") + "</span></div>" +
            '<div style="font-size:14px;color:var(--ink)">' + esc(fm.purpose || "") + "</div>" +
            '<div class="card-row" style="margin-top:6px"><span class="chip">budget ' + budget + " tok</span>" +
              '<span class="chip">estimate ' + estimate + " tok</span>" +
              '<span class="mvs"><span class="dot"></span>' + pct + "% of budget</span></div>" +
            '<div class="budget-bar"><div class="budget-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="meta-row">' + sources.map(function (id) {
              var n = state.byId[id];
              return '<span class="chip" ' + (n ? 'data-node="' + esc(id) + '"' : "") + ">" + esc(n ? n.title : id) + "</span>";
            }).join("") + "</div>" +
          "</div>";
        return (
          '<h1 class="view-title">Context Pack</h1>' +
          '<p class="view-sub">Token-budgeted bundle · provenance via Encompass</p>' +
          banner + md(text)
        );
      });
    },

    brief: function () {
      return loadText("./sample_weekly_brief.md").then(function (text) {
        return (
          '<h1 class="view-title">Radian — Weekly Brief</h1>' +
          '<p class="view-sub">Directional intelligence · way-ahead synthesis</p>' +
          md(text)
        );
      });
    },

    io: function () {
      return (
        '<h1 class="view-title">Data · Import / Export</h1>' +
        '<p class="view-sub">Local round-trip via the File &amp; Blob APIs — no server, no cloud.</p>' +
        '<div class="card">' +
          '<h3>Current in-memory state</h3>' +
          '<p class="snippet">' + state.nodes.length + " nodes · " + state.edges.length + " edges · " + state.timeline.length + " timeline events</p>" +
        "</div>" +
        '<button class="btn btn-gold btn-block" id="btn-export" style="margin-bottom:10px">Export Local Data (JSON)</button>' +
        '<label class="btn btn-block" for="file-import" style="text-align:center">Import Data (replace state)</label>' +
        '<input id="file-import" type="file" accept="application/json,.json" class="hidden" />' +
        '<div id="io-msg" class="note"></div>' +
        '<p class="note">Export downloads <code>indigold_export.json</code>. Import validates shape (mock v0.1 check) then re-renders all views. Everything stays on-device.</p>'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  function currentRoute() {
    var r = (location.hash || "#dashboard").replace("#", "");
    return ROUTES.indexOf(r) === -1 ? "dashboard" : r;
  }
  function setActiveTab(route) {
    var tabs = document.querySelectorAll(".tab");
    tabs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-route") === route); });
  }
  function render() {
    var route = currentRoute();
    setActiveTab(route);
    var out = Views[route]();
    Promise.resolve(out).then(function (html) {
      view.innerHTML = html;
      view.scrollTop = 0;
      window.scrollTo(0, 0);
      if (route === "atlas") initAtlas();
      if (route === "io") wireIO();
    });
  }

  // ---------------------------------------------------------------------------
  // Node detail modal
  // ---------------------------------------------------------------------------
  function openNode(id) {
    var n = state.byId[id];
    if (!n) return;
    var m = n.memory;
    var factors = m ? Object.keys(m.factors).map(function (k) {
      return "<tr><td>" + esc(k.replace(/_/g, " ")) + "</td><td>" + esc(m.factors[k]) + "</td></tr>";
    }).join("") : "";
    var prov = (n.provenance || []).map(function (pid) {
      var p = state.byId[pid];
      return '<span class="chip" data-node="' + esc(pid) + '">' + esc(p ? p.title : pid) + "</span>";
    }).join(" ") || '<span class="note">none (root)</span>';

    var layers = n.truth_layers.map(layerChip).join(" ");

    var html =
      '<p class="kicker">' + esc(n.engine || "knowledge") + " engine · " + esc(n.type) + "</p>" +
      "<h2 style=\"margin:2px 0 8px\">" + esc(n.title) + "</h2>" +
      '<p class="snippet">' + esc(n.snippet || "") + "</p>" +
      '<div class="meta-row">' + layers + mvsBadge(m) + lifeChip(m) +
        '<span class="chip">privacy: ' + esc(n.privacy || "private") + "</span></div>" +
      (m ? '<h3 style="margin-top:16px">Memory Value Score — ' + esc(m.score) + "/100</h3>" +
        '<table class="md" style="width:100%;border-collapse:collapse"><tbody>' + factors +
        "</tbody></table>" : "") +
      '<h3 style="margin-top:16px">Provenance</h3><div class="meta-row">' + prov + "</div>" +
      '<div id="modal-body-detail" class="note">Loading body…</div>';

    el("modal-body").innerHTML = html;
    el("modal").classList.remove("hidden");

    if (n.body_ref) {
      loadText("./" + n.body_ref).then(function (t) {
        var d = el("modal-body-detail");
        if (d) { d.className = ""; d.innerHTML = '<h3 style="margin-top:16px">Source body</h3>' + md(t); }
      }).catch(function () {});
    }
  }
  function closeModal() { el("modal").classList.add("hidden"); el("modal-body").innerHTML = ""; }

  // ---------------------------------------------------------------------------
  // Liminal Atlas — self-contained force-directed layout on <canvas>
  // ---------------------------------------------------------------------------
  var atlas = { raf: null };
  function initAtlas() {
    if (atlas.raf) { cancelAnimationFrame(atlas.raf); atlas.raf = null; }
    var canvas = el("atlas-canvas");
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth || 320;
    var H = Math.max(360, Math.round(W * 1.1));
    canvas.style.height = H + "px";
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var layerColor = { A: "#C4B5FD", B: "#A5B4FC", C: "#6EE7B7", D: "#FCD34D", E: "#FDBA74", F: "#FCA5A5" };
    var P = state.nodes.map(function (n, i) {
      var a = (i / state.nodes.length) * Math.PI * 2;
      return {
        id: n.id, node: n,
        x: W / 2 + Math.cos(a) * W * 0.3 + (Math.random() - 0.5) * 20,
        y: H / 2 + Math.sin(a) * H * 0.3 + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        r: 8 + ((n.memory ? n.memory.score : 50) / 100) * 12,
        color: layerColor[n.primary_truth_layer || n.truth_layers[0]] || "#D4AF37"
      };
    });
    var pById = {}; P.forEach(function (p) { pById[p.id] = p; });
    var E = state.edges.filter(function (e) { return pById[e.source_id] && pById[e.target_id]; });

    var dragging = null;
    function pos(ev) {
      var rect = canvas.getBoundingClientRect();
      var t = ev.touches ? ev.touches[0] : ev;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function pick(pt) {
      for (var i = P.length - 1; i >= 0; i--) {
        var dx = P[i].x - pt.x, dy = P[i].y - pt.y;
        if (dx * dx + dy * dy <= (P[i].r + 6) * (P[i].r + 6)) return P[i];
      }
      return null;
    }
    var moved = false, downPt = null;
    function onDown(ev) { var pt = pos(ev); downPt = pt; moved = false; dragging = pick(pt); if (dragging) ev.preventDefault(); }
    function onMove(ev) {
      if (!dragging) return;
      var pt = pos(ev);
      if (downPt && (Math.abs(pt.x - downPt.x) + Math.abs(pt.y - downPt.y) > 6)) moved = true;
      dragging.x = pt.x; dragging.y = pt.y; dragging.vx = 0; dragging.vy = 0;
      ev.preventDefault();
    }
    function onUp(ev) {
      var pt = downPt;
      if (dragging && !moved && pt) openNode(dragging.id);
      else if (!dragging && pt) { var hit = pick(pt); if (hit) openNode(hit.id); }
      dragging = null;
    }
    canvas.onmousedown = onDown; canvas.onmousemove = onMove; window.addEventListener("mouseup", onUp);
    canvas.ontouchstart = onDown; canvas.ontouchmove = onMove; canvas.ontouchend = onUp;

    function step() {
      // Repulsion
      for (var i = 0; i < P.length; i++) {
        for (var j = i + 1; j < P.length; j++) {
          var dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
          var d2 = dx * dx + dy * dy || 0.01;
          var f = 1400 / d2;
          var d = Math.sqrt(d2);
          var fx = (dx / d) * f, fy = (dy / d) * f;
          P[i].vx += fx; P[i].vy += fy; P[j].vx -= fx; P[j].vy -= fy;
        }
      }
      // Springs
      E.forEach(function (e) {
        var a = pById[e.source_id], b = pById[e.target_id];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var rest = 90;
        var f = (d - rest) * 0.01 * (0.5 + (e.weight || 0.5));
        var fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // Center gravity + integrate
      P.forEach(function (p) {
        if (p === dragging) return;
        p.vx += (W / 2 - p.x) * 0.002;
        p.vy += (H / 2 - p.y) * 0.002;
        p.vx *= 0.85; p.vy *= 0.85;
        p.x += Math.max(-6, Math.min(6, p.vx));
        p.y += Math.max(-6, Math.min(6, p.vy));
        p.x = Math.max(p.r, Math.min(W - p.r, p.x));
        p.y = Math.max(p.r, Math.min(H - p.r, p.y));
      });
      draw();
      atlas.raf = requestAnimationFrame(step);
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      E.forEach(function (e) {
        var a = pById[e.source_id], b = pById[e.target_id];
        ctx.strokeStyle = "rgba(212,175,55," + (0.15 + (e.weight || 0.3) * 0.4) + ")";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      P.forEach(function (p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(30,27,75,0.9)"; ctx.stroke();
        ctx.fillStyle = "#EDEBFF"; ctx.font = "10px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        var label = p.node.title.replace(/^(Concept: |Skill: |Event: |Decision: |Opportunity: |Raw Source: )/, "");
        if (label.length > 16) label = label.slice(0, 15) + "…";
        ctx.fillText(label, p.x, p.y + p.r + 11);
      });
    }
    step();
  }

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------
  function wireIO() {
    var btn = el("btn-export");
    if (btn) btn.onclick = exportData;
    var input = el("file-import");
    if (input) input.onchange = importData;
  }
  function exportData() {
    var payload = {
      app: "Indigold", version: "0.1.0", synthetic: true,
      exported_at: new Date().toISOString(),
      nodes: state.nodes, edges: state.edges, timeline: state.timeline
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "indigold_export.json";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setIOMsg("Exported " + state.nodes.length + " nodes ✓", false);
  }
  function importData(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        // Mock v0.1 validation — shape check only.
        if (!Array.isArray(data.nodes)) throw new Error("missing nodes[]");
        var ok = data.nodes.every(function (n) { return n.id && n.type && n.title && n.truth_layers; });
        if (!ok) throw new Error("a node failed the shape check (id/type/title/truth_layers)");
        setData(data.nodes, Array.isArray(data.edges) ? data.edges : [], Array.isArray(data.timeline) ? data.timeline : []);
        setIOMsg("Imported " + data.nodes.length + " nodes ✓ — re-rendering.", false);
        setTimeout(render, 400);
      } catch (e) {
        setIOMsg("Import failed: " + e.message, true);
      }
    };
    reader.readAsText(file);
  }
  function setIOMsg(msg, isErr) {
    var m = el("io-msg");
    if (m) { m.textContent = msg; m.style.color = isErr ? "var(--danger)" : "var(--ok)"; }
  }

  // ---------------------------------------------------------------------------
  // Global event wiring
  // ---------------------------------------------------------------------------
  document.addEventListener("click", function (e) {
    // Node tap (cards, chips, timeline)
    var holder = e.target.closest("[data-node]");
    if (holder) { openNode(holder.getAttribute("data-node")); return; }
    // Triage button
    var tri = e.target.closest("[data-triage]");
    if (tri) { e.stopPropagation(); openNode(tri.getAttribute("data-triage")); return; }
    // Timeline track filter
    var trk = e.target.closest("[data-track]");
    if (trk) {
      var t = trk.getAttribute("data-track");
      if (t === "__all") state.timelineTracks = null;
      else {
        if (!state.timelineTracks) state.timelineTracks = [];
        var idx = state.timelineTracks.indexOf(t);
        if (idx === -1) state.timelineTracks.push(t); else state.timelineTracks.splice(idx, 1);
        if (state.timelineTracks.length === 0) state.timelineTracks = null;
      }
      render();
      return;
    }
  });
  el("modal-close").addEventListener("click", closeModal);
  el("modal").addEventListener("click", function (e) { if (e.target === el("modal")) closeModal(); });

  window.addEventListener("hashchange", render);

  // ---------------------------------------------------------------------------
  // Add-to-Home-Screen hint (only outside standalone)
  // ---------------------------------------------------------------------------
  function maybeShowA2HS() {
    var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (standalone) return;
    if (localStorage.getItem("indigold_a2hs_dismissed") === "1") return;
    var banner = el("a2hs-banner");
    banner.classList.remove("hidden");
    el("a2hs-dismiss").onclick = function () {
      banner.classList.add("hidden");
      try { localStorage.setItem("indigold_a2hs_dismissed", "1"); } catch (e) {}
    };
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    maybeShowA2HS();
    bootData().then(function () {
      if (!location.hash) location.hash = "#dashboard";
      render();
    }).catch(function (err) {
      view.innerHTML = '<div class="empty">Failed to load fixtures.<br/><span class="note">' + esc(err.message) + "</span></div>";
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () { /* offline-first is best-effort */ });
    });
  }
  boot();
})();
