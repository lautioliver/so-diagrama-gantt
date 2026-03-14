/* ============================================================
   SIMULADOR DE PLANIFICACIÓN DE PROCESOS — scheduler.js
   ============================================================ */

// ─── Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const algoSel = () => $('algorithm').value;

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
  // Orden principal: tiempo de llegada.
  // Desempate (misma llegada): mayor prioridad primero, luego id original.
  const sorted = [...procs].sort((a, b) =>
    a.arrival - b.arrival || b.priority - a.priority || a.id - b.id
  );
  return runNonPreemptive(sorted, ctxTime, 'FCFS — First Come First Served');
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
    // Criterio: menor ráfaga → mayor prioridad → menor llegada
    avail.sort((a, b) => a.burst - b.burst || b.priority - a.priority || a.arrival - b.arrival);
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
    // Recoger todos los que llegan en este instante (no encolados aún)
    const newArrivals = queue.filter(p => !arrived.has(p.id) && p.arrival <= t && !p.done);
    // Ordenar por prioridad descendente para que el de mayor prioridad
    // quede primero dentro del lote de llegadas simultáneas
    newArrivals.sort((a, b) => b.priority - a.priority || a.arrival - b.arrival || a.id - b.id);
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
    avail.sort((a, b) => b.priority - a.priority || a.arrival - b.arrival);  // mayor número = mayor prioridad
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
  $('algorithm').addEventListener('change', () => {
    $('quantum-field').style.display = algoSel() === 'rr' ? '' : 'none';
    buildTable();
  });
  buildTable();
});