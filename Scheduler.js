/* ============================================================
   TEMA — dark / light con localStorage
   ============================================================ */

const THEME_KEY = 'cpusim-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-toggle');
  if (icon) {
    icon.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
    icon.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  // Respetar preferencia del sistema si no hay preferencia guardada
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

/* ============================================================
   NAVEGACIÓN — Sistema de módulos / pantallas
   ============================================================ */

const SCREENS = ['screen-home', 'screen-scheduler', 'screen-aging'];

/** Muestra solo la pantalla pedida, oculta las demás */
function showScreen(id) {
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  // back button: solo visible si no estamos en home
  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.classList.toggle('hidden', id === 'screen-home');
  // scroll al tope
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Abre un módulo por nombre */
function openModule(name) {
  if (name === 'scheduler') {
    showScreen('screen-scheduler');
    // inicializar tabla si no hay filas
    if (!document.querySelector('#proc-tbody tr')) buildTable();
  } else if (name === 'aging') {
    showScreen('screen-aging');
    if (!document.querySelector('#ag-tbody tr')) agingBuildTable();
  }
}

/** Vuelve al menú principal */
function goHome() {
  showScreen('screen-home');
}

/* ============================================================
   SIMULADOR DE PLANIFICACIÓN DE PROCESOS — scheduler.js
   ============================================================ */

// ─── Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const algoSel = () => { const el = $('algorithm'); return el ? el.value : 'fcfs'; };

function buildTable() {
  const n = parseInt($('num-procs').value) || 4;
  const isPriority = algoSel() === 'priority';

  $('quantum-field').style.display = algoSel() === 'rr' ? '' : 'none';

  const tbody = $('proc-tbody');
  tbody.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell">P${i}</td>
      <td><input type="number" min="0" value="${i}" class="arr-input"></td>
      <td><input type="number" min="1" value="${Math.floor(Math.random() * 6) + 1}" class="burst-input"></td>
      <td class="priority-col">
        <input type="number" min="1" value="${n - i}" class="prio-input" oninput="this.value = Math.max(1, parseInt(this.value)||1)">
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function getProcesses() {
  return Array.from($('proc-tbody').querySelectorAll('tr')).map((r, i) => ({
    id:       i,
    pid:      `P${i}`,
    arrival:  parseInt(r.querySelector('.arr-input').value)   || 0,
    burst:    parseInt(r.querySelector('.burst-input').value) || 1,
    priority: r.querySelector('.prio-input')
                ? Math.max(1, parseInt(r.querySelector('.prio-input').value) || 1)
                : 1,
  }));
}

function clearResults() {
  ['gantt-panel', 'results-panel', 'log-panel'].forEach(id => $(id).classList.add('hidden'));
}

// ─── Algoritmos ────────────────────────────────────────────────────────────

function runFCFS(procs, ctxTime) {
  const timeline = [], log = [];
  const rem = procs.map(p => ({ ...p, done: false }));
  let time = 0, lastPid = null;
  log.push(`<span class="hdr">=== FCFS — First Come First Served ===</span>`);
  log.push(`<span class="hdr">   (desempate de llegada simultánea: mayor prioridad primero)</span>`);

  while (rem.some(p => !p.done)) {
    // Procesos disponibles: ya llegaron
    const avail = rem.filter(p => !p.done && p.arrival <= time);

    if (!avail.length) {
      // CPU ociosa: saltar al siguiente proceso
      const nextArr = Math.min(...rem.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: nextArr, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${nextArr}  [IDLE]</span>`);
      time = nextArr; continue;
    }

    // FCFS: primero el que llegó antes.
    // Si llegaron al mismo tiempo → mayor prioridad → menor id (orden original)
    avail.sort((a, b) => a.arrival - b.arrival || b.priority - a.priority || a.id - b.id);
    const p = avail[0];

    if (lastPid !== null && lastPid !== p.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${time}–${time + ctxTime}  [CTX SWITCH] ${lastPid} → ${p.pid}  (+${ctxTime}ms)</span>`);
      time += ctxTime;
    }
    const end = time + p.burst;
    timeline.push({ pid: p.pid, start: time, end, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${end}  [EJECUTANDO] ${p.pid}  llegada=${p.arrival}  ráfaga=${p.burst}ms  prioridad=${p.priority}</span>`);
    log.push(`<span class="end-line">  t=${end}  [FIN] ${p.pid}</span>`);
    p.done = true; lastPid = p.pid; time = end;
  }
  return { timeline, log };
}

function runSJF(procs, ctxTime) {
  const timeline = [], log = [];
  const rem = procs.map(p => ({ ...p, done: false }));
  let time = 0, lastPid = null;
  log.push(`<span class="hdr">=== SJF — Trabajo Corto Primero (No Preemptivo) ===</span>`);

  while (rem.some(p => !p.done)) {
    const avail = rem.filter(p => !p.done && p.arrival <= time);
    if (!avail.length) {
      const next = Math.min(...rem.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: next, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${next}  [IDLE]</span>`);
      time = next; continue;
    }
    // Criterio: menor ráfaga → mayor prioridad → menor llegada → menor id
    avail.sort((a, b) => a.burst - b.burst || b.priority - a.priority || a.arrival - b.arrival || a.id - b.id);
    const p = avail[0];
    if (lastPid !== null && lastPid !== p.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${time}–${time + ctxTime}  [CTX SWITCH] ${lastPid} → ${p.pid}  (+${ctxTime}ms)</span>`);
      time += ctxTime;
    }
    const end = time + p.burst;
    timeline.push({ pid: p.pid, start: time, end, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${end}  [EJECUTANDO] ${p.pid}  ráfaga=${p.burst}ms  prioridad=${p.priority}</span>`);
    log.push(`<span class="end-line">  t=${end}  [FIN] ${p.pid}</span>`);
    p.done = true; lastPid = p.pid; time = end;
  }
  return { timeline, log };
}

function runRR(procs, ctxTime, quantum) {
  const timeline = [], log = [];
  const queue = procs.map(p => ({ ...p, rem: p.burst, firstRun: -1, done: false }))
                     .sort((a, b) => a.arrival - b.arrival);
  log.push(`<span class="hdr">=== ROUND ROBIN — Quantum = ${quantum}ms ===</span>`);

  let time = 0, lastPid = null;
  const readyQueue = [];
  const arrived = new Set();

  const enqueue = t => {
    // Solo los que llegan EXACTAMENTE en t (nuevos)
    const newArrivals = queue.filter(p => !arrived.has(p.id) && p.arrival <= t && !p.done);
    // Mayor prioridad entra primero al lote simultáneo; desempate por id original
    newArrivals.sort((a, b) => b.priority - a.priority || a.id - b.id);
    newArrivals.forEach(p => { arrived.add(p.id); readyQueue.push(p); });
  };

  enqueue(0);
  while (queue.some(p => !p.done)) {
    if (!readyQueue.length) {
      const next = Math.min(...queue.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: next, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${next}  [IDLE] cola vacía</span>`);
      time = next; enqueue(time); continue;
    }
    const p = readyQueue.shift();
    if (p.firstRun < 0) p.firstRun = time;
    if (lastPid !== null && lastPid !== p.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${time}–${time + ctxTime}  [CTX SWITCH] ${lastPid} → ${p.pid}  (+${ctxTime}ms)</span>`);
      time += ctxTime; enqueue(time);
    }
    const slice = Math.min(quantum, p.rem);
    const end = time + slice;
    timeline.push({ pid: p.pid, start: time, end, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${end}  [EJECUTANDO] ${p.pid}  slice=${slice}ms  rest=${p.rem - slice}ms  prioridad=${p.priority}</span>`);
    p.rem -= slice; lastPid = p.pid; time = end; enqueue(time);
    if (p.rem > 0) readyQueue.push(p);
    else { p.done = true; log.push(`<span class="end-line">  t=${end}  [FIN] ${p.pid}</span>`); }
  }
  return { timeline, log };
}

function runPriority(procs, ctxTime) {
  const timeline = [], log = [];
  const rem = procs.map(p => ({ ...p, done: false }));
  let time = 0, lastPid = null;
  log.push(`<span class="hdr">=== PRIORIDAD (No Preemptivo — número mayor = mayor prioridad) ===</span>`);

  while (rem.some(p => !p.done)) {
    const avail = rem.filter(p => !p.done && p.arrival <= time);
    if (!avail.length) {
      const next = Math.min(...rem.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: next, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${next}  [IDLE]</span>`);
      time = next; continue;
    }
    // Mayor prioridad → menor llegada → menor id (determinista)
    avail.sort((a, b) => b.priority - a.priority || a.arrival - b.arrival || a.id - b.id);
    const p = avail[0];
    if (lastPid !== null && lastPid !== p.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${time}–${time + ctxTime}  [CTX SWITCH] ${lastPid} → ${p.pid}  (+${ctxTime}ms)</span>`);
      time += ctxTime;
    }
    const end = time + p.burst;
    timeline.push({ pid: p.pid, start: time, end, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${end}  [EJECUTANDO] ${p.pid}  prioridad=${p.priority}  ráfaga=${p.burst}ms</span>`);
    log.push(`<span class="end-line">  t=${end}  [FIN] ${p.pid}</span>`);
    p.done = true; lastPid = p.pid; time = end;
  }
  return { timeline, log };
}

function runNonPreemptive(sorted, ctxTime, name) {
  const timeline = [], log = [];
  let time = 0, lastPid = null;
  const rem = sorted.map(p => ({ ...p, done: false }));
  log.push(`<span class="hdr">=== ${name} ===</span>`);

  while (rem.some(p => !p.done)) {
    const next = rem.find(p => !p.done);
    if (!next) break;
    if (next.arrival > time) {
      timeline.push({ pid: 'idle', start: time, end: next.arrival, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${next.arrival}  [IDLE]</span>`);
      time = next.arrival;
    }
    if (lastPid !== null && lastPid !== next.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${time}–${time + ctxTime}  [CTX SWITCH] ${lastPid} → ${next.pid}  (+${ctxTime}ms)</span>`);
      time += ctxTime;
    }
    const end = time + next.burst;
    timeline.push({ pid: next.pid, start: time, end, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${end}  [EJECUTANDO] ${next.pid}  ráfaga=${next.burst}ms  prioridad=${next.priority}</span>`);
    log.push(`<span class="end-line">  t=${end}  [FIN] ${next.pid}</span>`);
    next.done = true; lastPid = next.pid; time = end;
  }
  return { timeline, log };
}

// ─── Métricas ──────────────────────────────────────────────────────────────
function computeMetrics(procs, timeline) {
  return procs.map(p => {
    const runs = timeline.filter(b => b.pid === p.pid && b.type === 'run');
    if (!runs.length) return null;
    const firstRun = runs[0].start;
    const lastEnd  = Math.max(...runs.map(b => b.end));
    const totalRun = runs.reduce((s, b) => s + (b.end - b.start), 0);
    return {
      pid: p.pid, arrival: p.arrival, burst: p.burst, priority: p.priority,
      firstRun, finish: lastEnd,
      waitTime:   Math.max(0, (lastEnd - p.arrival) - totalRun),
      turnaround: lastEnd - p.arrival,
      response:   firstRun - p.arrival,
    };
  }).filter(Boolean);
}

// ─── Render Gantt ──────────────────────────────────────────────────────────

const PID_COLORS = ['p0','p1','p2','p3','p4','p5','p6','p7','p8','p9'];
const pidMap = {};

function colorFor(pid) {
  if (pid === 'idle') return 'idle';
  if (pid === 'ctx')  return 'ctx';
  if (!(pid in pidMap)) pidMap[pid] = PID_COLORS[Object.keys(pidMap).length % PID_COLORS.length];
  return pidMap[pid];
}

/**
 * Dibuja el Gantt usando posicionamiento absoluto:
 * cada bloque se coloca con left = start*PX y width = (end-start)*PX
 * → nunca colapsa, sin importar la cantidad de procesos o tiempo total.
 */
function renderGantt(timeline, procMap) {
  const total = Math.max(...timeline.map(b => b.end));
  // px por unidad de tiempo: mínimo 28px, máximo 80px
  const PX = Math.max(28, Math.min(80, Math.floor(1100 / total)));
  const trackW = total * PX; // ancho total de pista en px

  const container = $('gantt-rows');
  container.innerHTML = '';

  // ── Eje temporal ──
  const axisRow = document.createElement('div');
  axisRow.className = 'gantt-axis-row';
  axisRow.style.width = (trackW + 56) + 'px';  // 56px = label width

  // mostrar tick en cada unidad o cada N unidades si es muy largo
  const tickStep = total <= 30 ? 1 : total <= 60 ? 2 : Math.ceil(total / 30);
  const shownTicks = new Set();

  for (let t = 0; t <= total; t += tickStep) {
    addAxisTick(axisRow, t, PX);
    shownTicks.add(t);
  }
  if (!shownTicks.has(total)) addAxisTick(axisRow, total, PX);
  container.appendChild(axisRow);

  // ── Fila CPU (todas las pistas) ──
  container.appendChild(
    buildRow('CPU', timeline, null, PX, trackW, total, tickStep, procMap)
  );

  // Separador
  const sep = document.createElement('div');
  sep.className = 'gantt-separator';
  container.appendChild(sep);

  // ── Fila por proceso ──
  const pids = [...new Set(timeline.filter(b => b.type === 'run').map(b => b.pid))];
  pids.forEach(pid => {
    container.appendChild(
      buildRow(pid, timeline, pid, PX, trackW, total, tickStep, procMap)
    );
  });

  // ── Leyenda ──
  renderLegend(pids);
}

function addAxisTick(parent, t, PX) {
  const tick = document.createElement('span');
  tick.className = 'axis-tick';
  tick.style.left = (56 + t * PX) + 'px';  // 56px = label offset
  tick.textContent = t;
  parent.appendChild(tick);
}

/**
 * Construye una fila del Gantt.
 * @param {string}      label     - texto a la izquierda
 * @param {Array}       timeline  - todos los bloques
 * @param {string|null} filterPid - si no null, solo colorea ese pid
 * @param {number}      PX        - píxeles por unidad de tiempo
 * @param {number}      trackW    - ancho total de pista
 * @param {number}      total     - tiempo total
 * @param {number}      tickStep  - paso entre ticks
 */
function buildRow(label, timeline, filterPid, PX, trackW, total, tickStep, procMap = {}) {
  const row = document.createElement('div');
  row.className = 'gantt-row';

  // Label
  const lbl = document.createElement('div');
  lbl.className = 'gantt-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  // Track
  const track = document.createElement('div');
  track.className = 'gantt-track';
  track.style.width = trackW + 'px';

  // Líneas de cuadrícula verticales
  const gridStep = tickStep;
  for (let t = 0; t <= total; t += gridStep) {
    const gl = document.createElement('div');
    gl.className = 'g-grid';
    gl.style.left = (t * PX) + 'px';
    track.appendChild(gl);
  }

  // Registrar qué valores de tiempo ya tienen etiqueta visible en esta fila
  // para evitar solapamiento de time-labels
  const labeledTimes = new Set();

  timeline.forEach(b => {
    const x = b.start * PX;
    const w = (b.end - b.start) * PX;

    const block = document.createElement('div');
    block.className = 'gantt-block';
    block.style.left  = x + 'px';
    block.style.width = w + 'px';

    // Color / clase
    if (filterPid === null) {
      // Fila CPU: todo visible
      block.classList.add(colorFor(b.pid));
      if (w > 22) block.textContent = b.type === 'idle' ? '…' : b.type === 'ctx' ? 'CTX' : b.pid;
    } else {
      if (b.pid === filterPid && b.type === 'run') {
        block.classList.add(colorFor(filterPid));
        if (w > 18) block.textContent = filterPid;
      } else {
        block.classList.add('idle');
      }
    }

    const procInfo = procMap[b.pid] || null;
    block.title = b.type === 'run'
      ? `${b.pid}  [${b.start} → ${b.end}]  duración=${b.end - b.start}ms  prioridad=${procInfo ? procInfo.priority : '-'}`
      : `${b.pid}  [${b.start} → ${b.end}]  duración=${b.end - b.start}ms`;

    // ── Time-labels encima del bloque ──
    // Solo mostrar si el bloque es "relevante" (no idle de fila individual)
    const showLabels = filterPid === null
      ? (b.type === 'run' || b.type === 'ctx')
      : (b.pid === filterPid && b.type === 'run');

    if (showLabels) {
      const wrap = document.createElement('div');
      wrap.className = 'time-label-wrap';

      // Label de inicio
      if (!labeledTimes.has(b.start)) {
        const ts = document.createElement('span');
        ts.className = 'tl tl-start';
        ts.textContent = b.start;
        ts.style.position = 'absolute';
        ts.style.left = '0';
        wrap.appendChild(ts);
        labeledTimes.add(b.start);
      }

      // Label de fin
      if (!labeledTimes.has(b.end)) {
        const te = document.createElement('span');
        te.className = 'tl tl-end';
        te.textContent = b.end;
        te.style.position = 'absolute';
        te.style.right = '0';
        wrap.appendChild(te);
        labeledTimes.add(b.end);
      }

      if (wrap.children.length) block.appendChild(wrap);
    }

    track.appendChild(block);
  });

  row.appendChild(track);
  return row;
}

function renderLegend(pids) {
  const leg = $('gantt-legend');
  if (!leg) return;
  leg.innerHTML =
    '<span style="color:var(--muted);font-size:10px;font-family:var(--mono)">LEYENDA:</span>';

  pids.forEach(pid => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('div');
    dot.className = `legend-dot ${colorFor(pid)}`;
    const lbl = document.createElement('span');
    lbl.textContent = pid;
    item.appendChild(dot);
    item.appendChild(lbl);
    leg.appendChild(item);
  });

  // idle
  const idleItem = document.createElement('div');
  idleItem.className = 'legend-item';
  idleItem.innerHTML = '<div class="legend-dot idle"></div><span>IDLE</span>';
  leg.appendChild(idleItem);

  // ctx
  const ctxItem = document.createElement('div');
  ctxItem.className = 'legend-item';
  ctxItem.innerHTML = '<div class="legend-dot ctx"></div><span>CTX SWITCH</span>';
  leg.appendChild(ctxItem);
}

// ─── Render Results ────────────────────────────────────────────────────────
function renderResults(metrics) {
  const tbody = $('results-tbody');
  tbody.innerHTML = '';
  metrics.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell">${m.pid}</td>
      <td>${m.arrival}</td>
      <td>${m.burst}</td>
      <td>${m.priority}</td>
      <td>${m.firstRun}</td>
      <td>${m.finish}</td>
      <td>${m.waitTime}</td>
      <td>${m.turnaround}</td>
      <td>${m.response}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMetrics(metrics, log) {
  const n = metrics.length;
  const avgWait = (metrics.reduce((s, m) => s + m.waitTime,   0) / n).toFixed(2);
  const avgTA   = (metrics.reduce((s, m) => s + m.turnaround, 0) / n).toFixed(2);
  const avgResp = (metrics.reduce((s, m) => s + m.response,   0) / n).toFixed(2);
  const ctxCount = log.filter(l => l.includes('CTX SWITCH')).length;

  $('metrics-bar').innerHTML = `
    <div class="metric"><span class="m-label">Espera Prom.</span><span class="m-value">${avgWait} ms</span></div>
    <div class="metric"><span class="m-label">Retorno Prom.</span><span class="m-value">${avgTA} ms</span></div>
    <div class="metric"><span class="m-label">Respuesta Prom.</span><span class="m-value">${avgResp} ms</span></div>
    <div class="metric"><span class="m-label">Cambios de Ctx.</span><span class="m-value">${ctxCount}</span></div>
  `;
}

// ─── Main ──────────────────────────────────────────────────────────────────
function simulate() {
  const procs = getProcesses();
  if (!procs.length) { alert('Genera la tabla primero.'); return; }

  const ctxTime = parseInt($('ctx-time').value) || 0;
  const quantum  = parseInt($('quantum').value)  || 2;
  const algo     = algoSel();

  Object.keys(pidMap).forEach(k => delete pidMap[k]);

  let result;
  if      (algo === 'fcfs')     result = runFCFS(procs, ctxTime);
  else if (algo === 'sjf')      result = runSJF(procs, ctxTime);
  else if (algo === 'rr')       result = runRR(procs, ctxTime, quantum);
  else if (algo === 'priority') result = runPriority(procs, ctxTime);

  const { timeline, log } = result;
  const metrics = computeMetrics(procs, timeline);

  log.push(`<span class="sep">──────────────────────────────────────────────────────</span>`);
  log.push(`<span class="hdr">RESUMEN POR PROCESO</span>`);
  metrics.forEach(m => {
    log.push(
      `<span class="end-line">  ${m.pid}  llegada=${m.arrival}  ráfaga=${m.burst}  prioridad=${m.priority}  ` +
      `inicio=${m.firstRun}  fin=${m.finish}  espera=${m.waitTime}  ` +
      `retorno=${m.turnaround}  respuesta=${m.response}</span>`
    );
  });

  // mapa pid → proceso para tooltips y etiquetas
  const procMap = {};
  procs.forEach(p => { procMap[p.pid] = p; });
  renderGantt(timeline, procMap);
  renderResults(metrics);
  renderMetrics(metrics, log);
  $('log-box').innerHTML = log.join('<br>');

  ['gantt-panel', 'results-panel', 'log-panel'].forEach(id => $(id).classList.remove('hidden'));
}

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar tema
  initTheme();

  // Mostrar pantalla de inicio al cargar
  showScreen('screen-home');

  // Listener del selector de algoritmo
  const algoEl = document.getElementById('algorithm');
  if (algoEl) {
    algoEl.addEventListener('change', () => {
      document.getElementById('quantum-field').style.display =
        algoSel() === 'rr' ? '' : 'none';
    });
  }
});

/* ============================================================
   MÓDULO ENVEJECIMIENTO — SJF Predictivo (Aging)
   Fórmula: τ(n+1) = α · t(n) + (1 − α) · τ(n)
   ============================================================ */

/** Construye la tabla de entrada de tiempos reales */
function agingBuildTable() {
  const n     = parseInt($('ag-n').value)    || 5;
  const tau0  = parseFloat($('ag-tau0').value) || 45;
  const tbody = $('ag-tbody');
  tbody.innerHTML = '';

  for (let i = 1; i <= n; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell" style="color:var(--teal)">n = ${i}</td>
      <td class="ag-td-input">
        <input type="number" min="0" step="0.1" value="${Math.round(10 + Math.random()*40)}" class="ag-real-input">
      </td>
    `;
    tbody.appendChild(tr);
  }
  agingClear();
}

/** Limpia resultados del módulo aging */
function agingClear() {
  ['ag-results-panel','ag-chart-panel'].forEach(id => $(id).classList.add('hidden'));
}

/** Ejecuta la simulación de envejecimiento y renderiza tabla + gráfico */
function agingSimulate() {
  const alpha = parseFloat($('ag-alpha').value);
  const tau0  = parseFloat($('ag-tau0').value);
  const rows  = Array.from($('ag-tbody').querySelectorAll('tr'));

  if (!rows.length) { alert('Generá la tabla primero.'); return; }
  if (isNaN(alpha) || alpha <= 0 || alpha > 1) {
    alert('α debe estar entre 0 (exclusivo) y 1 (inclusivo).'); return;
  }

  const tReals = rows.map(r => parseFloat(r.querySelector('.ag-real-input').value) || 0);

  // Calcular secuencia de predicciones
  // τ(1) = tau0 (predicción inicial dada)
  // Para n=1: τ(2) = α·t(1) + (1-α)·τ(1)
  // Para n=2: τ(3) = α·t(2) + (1-α)·τ(2)  etc.
  const taus = [tau0]; // taus[0] = τ(1), taus[1] = τ(2), ...
  for (let i = 0; i < tReals.length; i++) {
    const next = alpha * tReals[i] + (1 - alpha) * taus[i];
    taus.push(round4(next));
  }

  // Render tabla de resultados
  const tbody = $('ag-results-tbody');
  tbody.innerHTML = '';

  tReals.forEach((t, i) => {
    const tauN     = taus[i];       // predicción usada en esta ejecución
    const tauNext  = taus[i + 1];   // nueva predicción calculada
    const calcStr  = `${alpha} × ${t} + ${round4(1 - alpha)} × ${tauN} = ${round4(alpha * t)} + ${round4((1 - alpha) * tauN)}`;
    const isLast   = i === tReals.length - 1;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell" style="color:var(--teal)">n = ${i + 1}</td>
      <td>${t}</td>
      <td>${tauN}</td>
      <td class="ag-calc-cell">${calcStr}</td>
      <td class="ag-pred-cell">${tauNext}</td>
    `;
    tbody.appendChild(tr);
  });

  // Fila extra: "próxima ejecución" — solo muestra la predicción disponible
  const trNext = document.createElement('tr');
  trNext.className = 'ag-next-row';
  trNext.innerHTML = `
    <td class="pid-cell" style="color:var(--teal);opacity:0.6">n = ${tReals.length + 1}</td>
    <td style="color:rgba(108,189,181,0.4)">—</td>
    <td style="color:rgba(108,189,181,0.4)">${taus[tReals.length]}</td>
    <td class="ag-calc-cell">Predicción calculada en paso anterior</td>
    <td class="ag-pred-cell">${taus[tReals.length]} ms ✓</td>
  `;
  tbody.appendChild(trNext);

  // Métricas
  const errors = tReals.map((t, i) => Math.abs(t - taus[i]));
  const mae    = round4(errors.reduce((s, e) => s + e, 0) / errors.length);
  const rmse   = round4(Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length));
  const finalPred = taus[tReals.length];

  $('ag-metrics-bar').innerHTML = `
    <div class="metric"><span class="m-label">α utilizado</span><span class="m-value">${alpha}</span></div>
    <div class="metric"><span class="m-label">τ₁ inicial</span><span class="m-value">${tau0} ms</span></div>
    <div class="metric"><span class="m-label">Próxima predicción</span><span class="m-value">${finalPred} ms</span></div>
    <div class="metric"><span class="m-label">Error Absoluto Medio</span><span class="m-value">${mae} ms</span></div>
    <div class="metric"><span class="m-label">RMSE</span><span class="m-value">${rmse} ms</span></div>
  `;

  ['ag-results-panel','ag-chart-panel'].forEach(id => $(id).classList.remove('hidden'));

  // Render gráfico
  agingRenderChart(tReals, taus, alpha);
}

/** Dibuja el gráfico de líneas en el canvas */
function agingRenderChart(tReals, taus, alpha) {
  const canvas = $('ag-canvas');
  const ctx    = canvas.getContext('2d');

  // Ajustar resolución para pantallas HiDPI
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth  || 800;
  const H   = 280;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  const PAD = { top: 24, right: 24, bottom: 40, left: 52 };
  const cW   = W - PAD.left - PAD.right;
  const cH   = H - PAD.top  - PAD.bottom;
  const n    = tReals.length;

  // Dominio X: ejecuciones 1..n
  // Dominio Y: min/max de todos los valores
  const allVals = [...tReals, ...taus];
  const yMin = Math.floor(Math.min(...allVals) * 0.85);
  const yMax = Math.ceil (Math.max(...allVals) * 1.10);

  const xScale = i  => PAD.left + (i / n) * cW;
  const yScale = v  => PAD.top  + cH - ((v - yMin) / (yMax - yMin)) * cH;

  // ── Fondo del área ──
  ctx.fillStyle = '#1a1f1e';
  ctx.fillRect(0, 0, W, H);

  // ── Cuadrícula ──
  ctx.strokeStyle = 'rgba(108,189,181,0.1)';
  ctx.lineWidth   = 1;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (i / yTicks) * (yMax - yMin);
    const y = yScale(v);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(108,189,181,0.5)';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(round4(v), PAD.left - 6, y + 3);
  }

  // ── Ejes ──
  ctx.strokeStyle = 'rgba(108,189,181,0.3)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.lineTo(PAD.left + cW, PAD.top + cH);
  ctx.stroke();

  // ── Labels eje X ──
  ctx.fillStyle = 'rgba(108,189,181,0.5)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  for (let i = 1; i <= n; i++) {
    ctx.fillText(`n=${i}`, xScale(i - 0.5), PAD.top + cH + 16);
  }

  // ── Línea de tiempo real t(n) ──
  ctx.strokeStyle = '#6CBDB5';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  tReals.forEach((t, i) => {
    const x = xScale(i + 0.5);
    const y = yScale(t);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Puntos t(n)
  tReals.forEach((t, i) => {
    const x = xScale(i + 0.5);
    const y = yScale(t);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#6CBDB5';
    ctx.fill();
    ctx.fillStyle = 'rgba(108,189,181,0.8)';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(t, x, y - 9);
  });

  // ── Línea de predicción τ(n) — usamos taus[0..n-1] alineados con los t(n) ──
  ctx.strokeStyle = '#E3DFBA';
  ctx.lineWidth   = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  tReals.forEach((_, i) => {
    const x = xScale(i + 0.5);
    const y = yScale(taus[i]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Puntos τ(n)
  tReals.forEach((_, i) => {
    const x = xScale(i + 0.5);
    const y = yScale(taus[i]);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#E3DFBA';
    ctx.fill();
    ctx.fillStyle = 'rgba(227,223,186,0.8)';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(taus[i], x, y + 16);
  });

  // ── Punto de próxima predicción (fuera del rango real) ──
  const xFut = xScale(n + 0.5);
  if (xFut < PAD.left + cW + 20) {
    const yFut = yScale(taus[n]);
    ctx.beginPath();
    ctx.arc(xFut, yFut, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6CBDB5';
    ctx.strokeStyle = '#E3DFBA';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(108,189,181,0.9)';
    ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`τ(${n+1})=${taus[n]}`, xFut, yFut - 10);
    ctx.fillStyle = 'rgba(108,189,181,0.4)';
    ctx.font = '9px Courier New';
    ctx.fillText(`n=${n+1}`, xFut, PAD.top + cH + 16);
  }

  // ── Título del eje Y ──
  ctx.save();
  ctx.translate(12, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(108,189,181,0.4)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('Tiempo (ms)', 0, 0);
  ctx.restore();
}

function round4(v) { return Math.round(v * 10000) / 10000; }

// La tabla de aging se inicializa al abrir el módulo (ver openModule)