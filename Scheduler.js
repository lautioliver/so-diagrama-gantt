/* ╔══════════════════════════════════════════════════════════════════╗
   ║  CPU SIM — Simulador de Planificación de Procesos               ║
   ║  Autor: NumérikaAI · UCASAL · Salta · 2026                      ║
   ║                                                                  ║
   ║  Módulos:                                                        ║
   ║    1. Planificación clásica (FCFS, SJF, RR, Prioridad)          ║
   ║    2. Envejecimiento — SJF Predictivo (Aging)                    ║
   ║    3. Eficiencia y Sobrecarga                                    ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ================================================================
   §1  TEMA — dark / light con localStorage
   ================================================================ */

const THEME_KEY = 'cpusim-theme';

/**
 * Aplica un tema al documento y actualiza el icono del toggle.
 * @param {'dark'|'light'} theme - Tema a aplicar.
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-toggle');
  if (icon) {
    icon.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
    icon.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }
  localStorage.setItem(THEME_KEY, theme);
}

/** Alterna entre tema oscuro y claro. */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/** Inicializa el tema usando preferencia guardada o la del sistema. */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}


/* ================================================================
   §2  NAVEGACIÓN — Sistema de pantallas / módulos
   ================================================================ */

/** IDs de todas las pantallas registradas en la app */
const SCREENS = ['screen-home', 'screen-scheduler', 'screen-aging', 'screen-overload', 'screen-exercises'];

/**
 * Muestra solo la pantalla indicada y oculta las demás.
 * @param {string} id - ID del elemento-pantalla a mostrar.
 */
function showScreen(id) {
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  // Botón "volver": visible solo fuera del home
  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.classList.toggle('hidden', id === 'screen-home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Abre un módulo por nombre y prepara su tabla si es necesario.
 * @param {'scheduler'|'aging'|'overload'} name
 */
function openModule(name) {
  if (name === 'scheduler') {
    showScreen('screen-scheduler');
    if (!document.querySelector('#proc-tbody tr')) buildTable();
  } else if (name === 'aging') {
    showScreen('screen-aging');
    if (!document.querySelector('#ag-tbody tr')) agingBuildTable();
  } else if (name === 'overload') {
    showScreen('screen-overload');
    overloadBuildTable();
  } else if (name === 'exercises') {
    showScreen('screen-exercises');
    if (!document.querySelector('#ex-tbody tr')) exBuildTable();
  }
}

/** Vuelve al menú principal. */
function goHome() {
  showScreen('screen-home');
}


/* ================================================================
   §3  UTILIDADES GENERALES
   ================================================================ */

/** Atajo para document.getElementById */
const $ = id => document.getElementById(id);

/** Devuelve el valor actual del selector de algoritmo. */
const algoSel = () => { const el = $('algorithm'); return el ? el.value : 'fcfs'; };

/** Redondea a 4 decimales para visualización. */
function round4(v) { return Math.round(v * 10000) / 10000; }


/* ================================================================
   §4  MÓDULO 1 — PLANIFICACIÓN CLÁSICA
   ================================================================ */

/* ── 4.1  Tabla de entrada ─────────────────────────────────────── */

/**
 * Genera la tabla de procesos según la cantidad indicada en #num-procs.
 * Cada fila incluye PID, llegada, ráfaga y prioridad.
 */
function buildTable() {
  const n = parseInt($('num-procs').value) || 4;
  const tbody = $('proc-tbody');
  if (!tbody) return;

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

/**
 * Lee los procesos de la tabla y devuelve un arreglo de objetos.
 * @returns {Array<{id:number, pid:string, arrival:number, burst:number, priority:number}>}
 */
function getProcesses() {
  return Array.from($('proc-tbody').querySelectorAll('tr')).map((r, i) => ({
    id:       i,
    pid:      `P${i}`,
    arrival:  parseFloat(r.querySelector('.arr-input').value)   || 0,
    burst:    parseFloat(r.querySelector('.burst-input').value) || 1,
    priority: r.querySelector('.prio-input')
                ? Math.max(1, parseInt(r.querySelector('.prio-input').value) || 1)
                : 1,
  }));
}

/** Oculta los paneles de resultados del scheduler. */
function clearResults() {
  ['gantt-panel', 'results-panel', 'log-panel'].forEach(id => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}


/* ── 4.2  Algoritmos de planificación ──────────────────────────── */

/**
 * FCFS — First Come First Served.
 * Desempate de llegada simultánea: mayor prioridad primero.
 * @param {Array} procs  - Lista de procesos.
 * @param {number} ctxTime - Tiempo de cambio de contexto (ms).
 * @returns {{timeline: Array, log: Array}}
 */
function runFCFS(procs, ctxTime) {
  const timeline = [], log = [];
  const rem = procs.map(p => ({ ...p, done: false }));
  let time = 0, lastPid = null;

  log.push(`<span class="hdr">=== FCFS — First Come First Served ===</span>`);
  log.push(`<span class="hdr">   (desempate de llegada simultánea: mayor prioridad primero)</span>`);

  while (rem.some(p => !p.done)) {
    const avail = rem.filter(p => !p.done && p.arrival <= time);

    if (!avail.length) {
      const nextArr = Math.min(...rem.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: nextArr, type: 'idle' });
      log.push(`<span class="run-line">  t=${time}–${nextArr}  [IDLE]</span>`);
      time = nextArr; continue;
    }

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

/**
 * SJF — Shortest Job First (No Preemptivo).
 * Criterio: menor ráfaga → mayor prioridad → menor llegada → menor id.
 */
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

/**
 * Round Robin — Turno Circular con quantum estricto.
 * Si el proceso termina antes del quantum, el tiempo restante se marca como idle.
 * @param {number} quantum - Quantum de tiempo (ms).
 */
function runRR(procs, ctxTime, quantum) {
  const timeline = [], log = [];
  const queue = procs.map(p => ({ ...p, rem: p.burst, firstRun: -1, done: false }))
                     .sort((a, b) => a.arrival - b.arrival);

  log.push(`<span class="hdr">=== ROUND ROBIN — Quantum = ${quantum}ms (estricto) ===</span>`);

  let time = 0, lastPid = null;
  const readyQueue = [];
  const arrived = new Set();

  /** Encola procesos recién llegados al tiempo t */
  const enqueue = t => {
    const newArrivals = queue.filter(p => !arrived.has(p.id) && p.arrival <= t && !p.done);
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

    // Quantum estricto: slice real + idle sobrante
    const slice      = Math.min(quantum, p.rem);
    const runEnd     = time + slice;
    const quantumEnd = time + quantum;

    timeline.push({ pid: p.pid, start: time, end: runEnd, type: 'run' });
    log.push(`<span class="run-line">  t=${time}–${runEnd}  [EJECUTANDO] ${p.pid}  slice=${slice}ms  rest=${p.rem - slice}ms  prioridad=${p.priority}</span>`);

    p.rem -= slice;

    if (p.rem === 0) {
      p.done = true;
      log.push(`<span class="end-line">  t=${runEnd}  [FIN] ${p.pid}</span>`);

      const idleSlice = quantum - slice;
      if (idleSlice > 0) {
        timeline.push({ pid: 'idle', start: runEnd, end: quantumEnd, type: 'idle' });
        log.push(`<span class="run-line">  t=${runEnd}–${quantumEnd}  [IDLE-QUANTUM] quantum no consumido (+${idleSlice}ms)</span>`);
      }
      time = quantumEnd;
    } else {
      time = quantumEnd;
      readyQueue.push(p);
    }

    lastPid = p.pid;
    enqueue(time);
  }
  return { timeline, log };
}

/**
 * Round Robin Estándar (académico) — sin idle-padding al final del quantum.
 * Si el proceso termina antes del quantum, el tiempo sobrante NO se marca como idle;
 * el siguiente proceso arranca inmediatamente.
 * @param {Array}  procs   - Lista de procesos.
 * @param {number} ctxTime - Tiempo de cambio de contexto.
 * @param {number} quantum - Quantum de tiempo.
 */
function runRR_Standard(procs, ctxTime, quantum) {
  const timeline = [], log = [];
  const queue = procs.map(p => ({ ...p, rem: p.burst, firstRun: -1, done: false }))
                     .sort((a, b) => a.arrival - b.arrival || a.id - b.id);

  log.push(`<span class="hdr">=== ROUND ROBIN (Estándar) — Quantum = ${quantum} ===</span>`);

  let time = 0, lastPid = null;
  const readyQueue = [];
  const arrived = new Set();

  const enqueue = t => {
    const newArrivals = queue.filter(p => !arrived.has(p.id) && p.arrival <= t && !p.done);
    newArrivals.sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    newArrivals.forEach(p => { arrived.add(p.id); readyQueue.push(p); });
  };

  enqueue(0);
  while (queue.some(p => !p.done)) {
    if (!readyQueue.length) {
      const next = Math.min(...queue.filter(p => !p.done).map(p => p.arrival));
      timeline.push({ pid: 'idle', start: time, end: next, type: 'idle' });
      log.push(`<span class="run-line">  t=${round4(time)}–${round4(next)}  [IDLE] cola vacía</span>`);
      time = next; enqueue(time); continue;
    }

    const p = readyQueue.shift();
    if (p.firstRun < 0) p.firstRun = time;

    if (lastPid !== null && lastPid !== p.pid && ctxTime > 0) {
      timeline.push({ pid: 'ctx', start: time, end: time + ctxTime, type: 'ctx' });
      log.push(`<span class="ctx-line">  t=${round4(time)}–${round4(time + ctxTime)}  [CTX SWITCH] ${lastPid} → ${p.pid}  (+${ctxTime})</span>`);
      time += ctxTime; enqueue(time);
    }

    const slice = Math.min(quantum, p.rem);
    const runEnd = time + slice;

    timeline.push({ pid: p.pid, start: time, end: runEnd, type: 'run' });
    log.push(`<span class="run-line">  t=${round4(time)}–${round4(runEnd)}  [EJECUTANDO] ${p.pid}  slice=${slice}  rest=${round4(p.rem - slice)}</span>`);

    p.rem -= slice;
    time = runEnd;

    // Encolar nuevas llegadas ANTES de re-encolar el proceso actual
    enqueue(time);

    if (p.rem === 0) {
      p.done = true;
      log.push(`<span class="end-line">  t=${round4(runEnd)}  [FIN] ${p.pid}</span>`);
    } else {
      readyQueue.push(p);
    }

    lastPid = p.pid;
  }
  return { timeline, log };
}

/**
 * Prioridad — No Preemptivo (número mayor = mayor prioridad).
 */
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


/* ── 4.3  Métricas por proceso ─────────────────────────────────── */

/**
 * Calcula métricas individuales por proceso a partir del timeline.
 * @param {Array} procs    - Procesos originales.
 * @param {Array} timeline - Línea de tiempo resultante.
 * @returns {Array<{pid, arrival, burst, priority, firstRun, finish, waitTime, turnaround, response}>}
 */
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

/**
 * Calcula la eficiencia del CPU para la simulación actual.
 * 
 * Fórmula:  η = (Σ duración de bloques de color / Tiempo total) × 100
 * 
 * "Bloques de color" = bloques de tipo 'run' (ejecución efectiva).
 * "Tiempo total"     = incluye idle + ctx switch + run (todo el timeline).
 *
 * @param {Array} timeline - Línea de tiempo resultante de la simulación.
 * @returns {{colorTime: number, totalTime: number, efficiency: number}}
 */
function computeEfficiency(timeline) {
  if (!timeline.length) return { colorTime: 0, totalTime: 0, efficiency: 0 };

  const totalTime = Math.max(...timeline.map(b => b.end));
  const colorTime = timeline
    .filter(b => b.type === 'run')
    .reduce((sum, b) => sum + (b.end - b.start), 0);

  const efficiency = totalTime > 0 ? (colorTime / totalTime) * 100 : 0;
  return { colorTime, totalTime, efficiency };
}


/* ── 4.4  Renderizado del Gantt ────────────────────────────────── */

/** Paleta de clases CSS para colorear procesos */
const PID_COLORS = ['p0','p1','p2','p3','p4','p5','p6','p7','p8','p9'];
const pidMap = {};

/**
 * Devuelve la clase CSS de color para un PID.
 * @param {string} pid
 * @returns {string}
 */
function colorFor(pid) {
  if (pid === 'idle') return 'idle';
  if (pid === 'ctx')  return 'ctx';
  if (!(pid in pidMap)) pidMap[pid] = PID_COLORS[Object.keys(pidMap).length % PID_COLORS.length];
  return pidMap[pid];
}

/**
 * Dibuja el diagrama de Gantt usando posicionamiento absoluto.
 * Cada bloque se ubica con left = start * PX y width = (end-start) * PX.
 * @param {Array}  timeline - Bloques del timeline.
 * @param {Object} procMap  - Mapa pid → proceso para tooltips.
 */
function renderGantt(timeline, procMap) {
  const total = Math.max(...timeline.map(b => b.end));
  const PX = Math.max(28, Math.min(80, Math.floor(1100 / total)));
  const trackW = total * PX;

  const container = $('gantt-rows');
  container.innerHTML = '';

  // ── Eje temporal ──
  const axisRow = document.createElement('div');
  axisRow.className = 'gantt-axis-row';
  axisRow.style.width = (trackW + 56) + 'px';

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

/**
 * Agrega un tick numérico al eje temporal.
 * @param {HTMLElement} parent
 * @param {number} t  - Valor de tiempo.
 * @param {number} PX - Píxeles por unidad.
 */
function addAxisTick(parent, t, PX) {
  const tick = document.createElement('span');
  tick.className = 'axis-tick';
  tick.style.left = (56 + t * PX) + 'px';
  tick.textContent = t;
  parent.appendChild(tick);
}

/**
 * Construye una fila del diagrama de Gantt (CPU o individual).
 * @param {string}      label     - Texto a la izquierda.
 * @param {Array}       timeline  - Todos los bloques.
 * @param {string|null} filterPid - Si no null, solo colorea ese PID.
 * @param {number}      PX        - Píxeles por unidad de tiempo.
 * @param {number}      trackW    - Ancho total de la pista (px).
 * @param {number}      total     - Tiempo total de la simulación.
 * @param {number}      tickStep  - Paso entre ticks de la cuadrícula.
 * @param {Object}      procMap   - Mapa pid → proceso.
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

  // Líneas de cuadrícula
  for (let t = 0; t <= total; t += tickStep) {
    const gl = document.createElement('div');
    gl.className = 'g-grid';
    gl.style.left = (t * PX) + 'px';
    track.appendChild(gl);
  }

  // Registro de tiempos ya etiquetados (anti-solapamiento)
  const labeledTimes = new Set();

  timeline.forEach(b => {
    const x = b.start * PX;
    const w = (b.end - b.start) * PX;

    const block = document.createElement('div');
    block.className = 'gantt-block';
    block.style.left  = x + 'px';
    block.style.width = w + 'px';

    // Asignación de color/clase
    if (filterPid === null) {
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

    // Tooltip
    const procInfo = procMap[b.pid] || null;
    block.title = b.type === 'run'
      ? `${b.pid}  [${b.start} → ${b.end}]  duración=${b.end - b.start}ms  prioridad=${procInfo ? procInfo.priority : '-'}`
      : `${b.pid}  [${b.start} → ${b.end}]  duración=${b.end - b.start}ms`;

    // Time-labels encima del bloque
    const showLabels = filterPid === null
      ? (b.type === 'run' || b.type === 'ctx')
      : (b.pid === filterPid && b.type === 'run');

    if (showLabels) {
      const wrap = document.createElement('div');
      wrap.className = 'time-label-wrap';

      if (!labeledTimes.has(b.start)) {
        const ts = document.createElement('span');
        ts.className = 'tl tl-start';
        ts.textContent = b.start;
        ts.style.position = 'absolute';
        ts.style.left = '0';
        wrap.appendChild(ts);
        labeledTimes.add(b.start);
      }

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

/** Renderiza la leyenda del Gantt (colores + idle + ctx). */
function renderLegend(pids, containerId = 'gantt-legend') {
  const leg = $(containerId);
  if (!leg) return;
  leg.innerHTML = '<span style="color:var(--muted);font-size:10px;font-family:var(--mono)">LEYENDA:</span>';

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

  const idleItem = document.createElement('div');
  idleItem.className = 'legend-item';
  idleItem.innerHTML = '<div class="legend-dot idle"></div><span>IDLE</span>';
  leg.appendChild(idleItem);

  const ctxItem = document.createElement('div');
  ctxItem.className = 'legend-item';
  ctxItem.innerHTML = '<div class="legend-dot ctx"></div><span>CTX SWITCH</span>';
  leg.appendChild(ctxItem);
}


/* ── 4.5  Tablas de resultados y métricas ──────────────────────── */

/** Renderiza la tabla detallada de resultados por proceso. */
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

/**
 * Renderiza la barra de métricas resumen (promedios + eficiencia).
 * @param {Array}  metrics    - Métricas por proceso.
 * @param {Array}  log        - Log de ejecución (para contar ctx switches).
 * @param {Object} efficiency - Resultado de computeEfficiency().
 */
function renderMetrics(metrics, log, efficiency) {
  const n = metrics.length;
  const avgWait = (metrics.reduce((s, m) => s + m.waitTime,   0) / n).toFixed(2);
  const avgTA   = (metrics.reduce((s, m) => s + m.turnaround, 0) / n).toFixed(2);
  const avgResp = (metrics.reduce((s, m) => s + m.response,   0) / n).toFixed(2);
  const ctxCount = log.filter(l => l.includes('CTX SWITCH')).length;

  // Elegir color según nivel de eficiencia
  let effClass = '';
  if      (efficiency.efficiency >= 80) effClass = 'eff-high';
  else if (efficiency.efficiency >= 50) effClass = 'eff-mid';
  else                                  effClass = 'eff-low';

  $('metrics-bar').innerHTML = `
    <div class="metric">
      <span class="m-label">Espera Prom.</span>
      <span class="m-value">${avgWait} ms</span>
    </div>
    <div class="metric">
      <span class="m-label">Retorno Prom.</span>
      <span class="m-value">${avgTA} ms</span>
    </div>
    <div class="metric">
      <span class="m-label">Respuesta Prom.</span>
      <span class="m-value">${avgResp} ms</span>
    </div>
    <div class="metric">
      <span class="m-label">Cambios de Ctx.</span>
      <span class="m-value">${ctxCount}</span>
    </div>
    <div class="metric metric-efficiency ${effClass}">
      <span class="m-label">Eficiencia (η)</span>
      <span class="m-value">${efficiency.efficiency.toFixed(2)}%</span>
      <span class="m-detail">${efficiency.colorTime}ms útil / ${efficiency.totalTime}ms total</span>
    </div>
  `;
}


/* ── 4.6  Motor principal: simulate() ──────────────────────────── */

/**
 * Función principal del módulo scheduler.
 * Lee la configuración, ejecuta el algoritmo seleccionado,
 * calcula métricas + eficiencia, y renderiza todo.
 */
function simulate() {
  if (!$('proc-tbody') || !$('gantt-rows')) {
    console.error('simulate(): elementos del DOM no encontrados');
    return;
  }

  const procs = getProcesses();
  if (!procs.length) { alert('Genera la tabla primero.'); return; }

  const ctxTime = parseInt($('ctx-time').value) || 0;
  const quantum = parseInt($('quantum').value)  || 2;
  const algo    = algoSel();

  // Reset color map
  Object.keys(pidMap).forEach(k => delete pidMap[k]);

  // Ejecutar algoritmo
  let result;
  if      (algo === 'fcfs')     result = runFCFS(procs, ctxTime);
  else if (algo === 'sjf')      result = runSJF(procs, ctxTime);
  else if (algo === 'rr')       result = runRR(procs, ctxTime, quantum);
  else if (algo === 'priority') result = runPriority(procs, ctxTime);

  const { timeline, log } = result;
  const metrics    = computeMetrics(procs, timeline);
  const efficiency = computeEfficiency(timeline);

  // Log de resumen
  log.push(`<span class="sep">──────────────────────────────────────────────────────</span>`);
  log.push(`<span class="hdr">RESUMEN POR PROCESO</span>`);
  metrics.forEach(m => {
    log.push(
      `<span class="end-line">  ${m.pid}  llegada=${m.arrival}  ráfaga=${m.burst}  prioridad=${m.priority}  ` +
      `inicio=${m.firstRun}  fin=${m.finish}  espera=${m.waitTime}  ` +
      `retorno=${m.turnaround}  respuesta=${m.response}</span>`
    );
  });

  // Log de eficiencia
  log.push(`<span class="sep">──────────────────────────────────────────────────────</span>`);
  log.push(`<span class="hdr">EFICIENCIA DEL CPU</span>`);
  log.push(`<span class="run-line">  Tiempo útil (bloques de color): ${efficiency.colorTime} ms</span>`);
  log.push(`<span class="run-line">  Tiempo total (incluyendo idle/ctx): ${efficiency.totalTime} ms</span>`);
  log.push(`<span class="ctx-line">  η = ${efficiency.colorTime} / ${efficiency.totalTime} × 100 = ${efficiency.efficiency.toFixed(2)}%</span>`);

  // Mapa pid → proceso para tooltips
  const procMap = {};
  procs.forEach(p => { procMap[p.pid] = p; });

  // Renderizar todo
  renderGantt(timeline, procMap);
  renderResults(metrics);
  renderMetrics(metrics, log, efficiency);
  $('log-box').innerHTML = log.join('<br>');

  ['gantt-panel', 'results-panel', 'log-panel'].forEach(id => $(id).classList.remove('hidden'));
}


/* ================================================================
   §5  INICIALIZACIÓN
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  showScreen('screen-home');
});


/* ================================================================
   §8  MÓDULO 4 — RESOLUCIÓN DE EJERCICIOS
   Comparación lado a lado de algoritmos FCFS, SJF, RR
   con soporte para tiempos decimales y auto-quantum.
   ================================================================ */

/**
 * Genera la tabla de procesos del módulo de ejercicios.
 * Soporta nombres personalizados (A, B, C...) y tiempos decimales.
 */
function exBuildTable() {
  const n = parseInt($('ex-num-procs').value) || 3;
  const tbody = $('ex-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < n; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${letters[i] || 'P' + i}" class="ex-name-input" style="width:50px;text-align:center;font-weight:bold"></td>
      <td><input type="number" min="0" step="0.1" value="${i}" class="ex-arr-input"></td>
      <td><input type="number" min="0.1" step="0.1" value="${Math.floor(Math.random() * 5) + 2}" class="ex-burst-input"></td>
    `;
    tbody.appendChild(tr);
  }
  exClearResults();
}

/**
 * Lee los procesos del módulo de ejercicios.
 * @returns {Array<{id, pid, arrival, burst, priority}>}
 */
function exGetProcesses() {
  return Array.from($('ex-tbody').querySelectorAll('tr')).map((r, i) => ({
    id:       i,
    pid:      r.querySelector('.ex-name-input').value.trim() || `P${i}`,
    arrival:  parseFloat(r.querySelector('.ex-arr-input').value)   || 0,
    burst:    parseFloat(r.querySelector('.ex-burst-input').value) || 1,
    priority: 1,
  }));
}

/** Oculta todos los paneles de resultados del módulo de ejercicios. */
function exClearResults() {
  ['ex-comparison-panel', 'ex-gantt-panel-1', 'ex-gantt-panel-2', 'ex-results-panel', 'ex-log-panel', 'ex-formulas-panel'].forEach(id => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}

/**
 * Calcula el quantum óptimo para un conjunto de procesos.
 * "El mayor quantum pequeño que no cause cambios de contexto innecesarios."
 * 
 * Esto es: el quantum = mínimo burst entre todos los procesos.
 * Si Q = min(burst), los procesos con esa ráfaga terminan en un solo quantum,
 * y los demás se dividen en slices exactos o casi exactos.
 * 
 * @param {Array} procs
 * @returns {number}
 */
function exAutoQuantum(procs) {
  const bursts = procs.map(p => p.burst);
  return Math.min(...bursts);
}

/**
 * Motor principal del módulo de ejercicios.
 * Ejecuta los algoritmos seleccionados, compara resultados, y renderiza.
 */
function exSimulate() {
  const procs = exGetProcesses();
  if (!procs.length) { alert('Generá la tabla primero.'); return; }

  const mode = $('ex-mode').value;  // 'non-preemptive' | 'round-robin'
  const ctxTime = parseFloat($('ex-ctx-time').value) || 0;

  // Reset color map
  Object.keys(pidMap).forEach(k => delete pidMap[k]);

  let result1, result2, label1, label2;
  let quantum = null;

  if (mode === 'non-preemptive') {
    // FCFS + SJF, ambos non-preemptive, sin ctx switch
    result1 = runFCFS(procs, ctxTime);
    result2 = runSJF(procs, ctxTime);
    label1 = 'FCFS (No Preemptivo)';
    label2 = 'SJF (No Preemptivo)';
  } else {
    // FCFS + SJF como planificación a largo plazo, RR como corto plazo
    quantum = parseFloat($('ex-quantum').value);
    if (!quantum || quantum <= 0) {
      quantum = exAutoQuantum(procs);
      $('ex-quantum').value = quantum;
    }

    // FCFS order + RR: ordenar por llegada (FCFS) y simular con RR
    const procsFCFS = [...procs].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    result1 = runRR_Standard(procsFCFS, ctxTime, quantum);

    // SJF order + RR: el orden SJF se respeta en los desempates de la cola RR
    // pero el RR estándar ya maneja esto naturalmente
    const procsSJF = [...procs].sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.id - b.id);
    result2 = runRR_Standard(procsSJF, ctxTime, quantum);

    label1 = `FCFS + Round Robin (Q=${quantum})`;
    label2 = `SJF + Round Robin (Q=${quantum})`;
  }

  const metrics1 = computeMetrics(procs, result1.timeline);
  const metrics2 = computeMetrics(procs, result2.timeline);
  const eff1 = computeEfficiency(result1.timeline);
  const eff2 = computeEfficiency(result2.timeline);

  // Procesos map para Gantt
  const procMap = {};
  procs.forEach(p => { procMap[p.pid] = p; });

  // Renderizar comparación
  exRenderComparison(label1, label2, metrics1, metrics2, eff1, eff2, quantum);

  // Renderizar Gantt 1
  Object.keys(pidMap).forEach(k => delete pidMap[k]);
  exRenderGantt('ex-gantt-rows-1', result1.timeline, procMap, label1, 'ex-gantt-legend-1');
  $('ex-gantt-title-1').textContent = `Diagrama de Gantt — ${label1}`;

  // Renderizar Gantt 2
  Object.keys(pidMap).forEach(k => delete pidMap[k]);
  exRenderGantt('ex-gantt-rows-2', result2.timeline, procMap, label2, 'ex-gantt-legend-2');
  $('ex-gantt-title-2').textContent = `Diagrama de Gantt — ${label2}`;

  // Tabla detallada de resultados
  exRenderResultsTable(procs, metrics1, metrics2, label1, label2);

  // Log detallado
  const fullLog = [
    ...result1.log,
    `<span class="sep">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>`,
    ...result2.log
  ];
  $('ex-log-box').innerHTML = fullLog.join('<br>');

  // Llenar Fórmulas
  let qHtml = '';
  if (quantum !== null) {
      qHtml = `
      <div style="margin-top: 4px;">
        <strong style="color:var(--teal)">Auto-Quantum (Q):</strong><br>
        <div class="math-block" style="margin-top:6px;">
          <span class="math-var">Q</span> = min( <span class="math-var">T</span><span class="math-sub">servicio</span> ) = ${quantum} <span class="math-var">ms</span>
        </div>
        <div style="color:var(--muted); font-size: 11px; margin-top:6px;">Calculado como el menor tiempo de servicio para evitar cortes innecesarios en ráfagas pequeñas.</div>
      </div>`;
  }
  
  $('ex-formulas-box').innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      
      <div>
        <strong style="color:var(--teal)">Tiempo de Retorno (Turnaround):</strong><br>
        <div class="math-block">
          <span class="math-var">T</span><span class="math-sub">retorno</span> = <span class="math-var">T</span><span class="math-sub">fin</span> − <span class="math-var">T</span><span class="math-sub">llegada</span>
        </div>
        <div style="color:var(--muted); font-size: 11px; margin-top:6px;">Es el tiempo total desde que el proceso llega a la cola hasta que finaliza por completo su ejecución.</div>
      </div>

      <div>
        <strong style="color:var(--teal)">Tiempo de Respuesta (Response):</strong><br>
        <div class="math-block">
          <span class="math-var">T</span><span class="math-sub">respuesta</span> = <span class="math-var">T</span><span class="math-sub">1ª ejecución</span> − <span class="math-var">T</span><span class="math-sub">llegada</span>
        </div>
        <div style="color:var(--muted); font-size: 11px; margin-top:6px;">Mide cuánto tarda el proceso en ser atendido por el CPU por primera vez.</div>
      </div>

      <div>
        <strong style="color:var(--teal)">Tiempo de Espera (Wait):</strong><br>
        <div class="math-block">
          <span class="math-var">T</span><span class="math-sub">espera</span> = <span class="math-var">T</span><span class="math-sub">retorno</span> − <span class="math-var">T</span><span class="math-sub">servicio</span>
        </div>
        <div style="color:var(--muted); font-size: 11px; margin-top:6px;">Tiempo total que el proceso pasó en la cola de listos (Ready) sin ser ejecutado activamente por el CPU.</div>
      </div>

      <div>
        <strong style="color:var(--teal)">Eficiencia (η):</strong><br>
        <div class="math-block">
          <span class="math-var">η</span> = 
          <div class="math-frac">
            <div class="math-num">∑ <span class="math-var">T</span><span class="math-sub">útil</span></div>
            <div class="math-den"><span class="math-var">T</span><span class="math-sub">simulación total</span></div>
          </div>
          × 100
        </div>
        <div style="color:var(--muted); font-size: 11px; margin-top:6px;">Porcentaje del tiempo total en el que el CPU estuvo ejecutando procesos (descontando tiempos de inactividad o cambios de contexto).</div>
      </div>

      ${qHtml}
    </div>
  `;

  // Mostrar paneles
  ['ex-comparison-panel', 'ex-gantt-panel-1', 'ex-gantt-panel-2', 'ex-results-panel', 'ex-log-panel', 'ex-formulas-panel'].forEach(id => {
    $(id).classList.remove('hidden');
  });
}

/**
 * Renderiza la comparación lado a lado de dos algoritmos.
 */
function exRenderComparison(label1, label2, metrics1, metrics2, eff1, eff2, quantum) {
  const n1 = metrics1.length, n2 = metrics2.length;
  const avgTA1   = (metrics1.reduce((s, m) => s + m.turnaround, 0) / n1);
  const avgTA2   = (metrics2.reduce((s, m) => s + m.turnaround, 0) / n2);
  const avgResp1 = (metrics1.reduce((s, m) => s + m.response, 0)   / n1);
  const avgResp2 = (metrics2.reduce((s, m) => s + m.response, 0)   / n2);
  const avgWait1 = (metrics1.reduce((s, m) => s + m.waitTime, 0)   / n1);
  const avgWait2 = (metrics2.reduce((s, m) => s + m.waitTime, 0)   / n2);

  const better = (a, b) => a < b ? 'ex-better' : a > b ? 'ex-worse' : '';

  // Build detailed turnaround breakdown for each algorithm
  let detailHtml1 = metrics1.map(m => `${m.pid}: ${round4(m.turnaround)}`).join(' + ');
  let detailHtml2 = metrics2.map(m => `${m.pid}: ${round4(m.turnaround)}`).join(' + ');
  let sumTA1 = round4(metrics1.reduce((s, m) => s + m.turnaround, 0));
  let sumTA2 = round4(metrics2.reduce((s, m) => s + m.turnaround, 0));

  const container = $('ex-comparison-body');
  container.innerHTML = `
    <div class="ex-compare-grid">
      <div class="ex-compare-header">Métrica</div>
      <div class="ex-compare-header">${label1}</div>
      <div class="ex-compare-header">${label2}</div>

      <div class="ex-compare-label">T. Retorno Prom.</div>
      <div class="ex-compare-val ${better(avgTA1, avgTA2)}">${round4(avgTA1)}</div>
      <div class="ex-compare-val ${better(avgTA2, avgTA1)}">${round4(avgTA2)}</div>

      <div class="ex-compare-label">T. Respuesta Prom.</div>
      <div class="ex-compare-val ${better(avgResp1, avgResp2)}">${round4(avgResp1)}</div>
      <div class="ex-compare-val ${better(avgResp2, avgResp1)}">${round4(avgResp2)}</div>

      <div class="ex-compare-label">T. Espera Prom.</div>
      <div class="ex-compare-val ${better(avgWait1, avgWait2)}">${round4(avgWait1)}</div>
      <div class="ex-compare-val ${better(avgWait2, avgWait1)}">${round4(avgWait2)}</div>

      <div class="ex-compare-label">Eficiencia (η)</div>
      <div class="ex-compare-val ${better(eff2.efficiency, eff1.efficiency)}">${eff1.efficiency.toFixed(2)}%</div>
      <div class="ex-compare-val ${better(eff1.efficiency, eff2.efficiency)}">${eff2.efficiency.toFixed(2)}%</div>
    </div>

    <div class="ex-detail-section">
      <div class="ex-detail-block">
        <div class="ex-detail-title">${label1} — Detalle de Retorno</div>
        <div class="ex-detail-formula">${detailHtml1}</div>
        <div class="ex-detail-calc">Suma = ${sumTA1} / ${n1} = <strong>${round4(avgTA1)}</strong></div>
      </div>
      <div class="ex-detail-block">
        <div class="ex-detail-title">${label2} — Detalle de Retorno</div>
        <div class="ex-detail-formula">${detailHtml2}</div>
        <div class="ex-detail-calc">Suma = ${sumTA2} / ${n2} = <strong>${round4(avgTA2)}</strong></div>
      </div>
    </div>

    ${quantum !== null ? `<div class="ex-quantum-note"><span class="ex-q-badge">Q = ${quantum}</span> Quantum utilizado — el mayor valor que no produce cambios de contexto innecesarios.</div>` : ''}
  `;
}

/**
 * Renderiza un diagrama de Gantt en un contenedor arbitrario.
 */
function exRenderGantt(containerId, timeline, procMap, label, legendId = null) {
  if (!timeline.length) return;
  const total = Math.max(...timeline.map(b => b.end));

  // Para tiempos decimales, usar más PX por unidad
  const hasDecimals = timeline.some(b => b.start % 1 !== 0 || b.end % 1 !== 0);
  const PX = hasDecimals
    ? Math.max(50, Math.min(120, Math.floor(1100 / total)))
    : Math.max(28, Math.min(80, Math.floor(1100 / total)));
  const trackW = Math.ceil(total * PX);

  const container = $(containerId);
  container.innerHTML = '';

  // Eje temporal
  const axisRow = document.createElement('div');
  axisRow.className = 'gantt-axis-row';
  axisRow.style.width = (trackW + 56) + 'px';

  // Collect all unique times from timeline
  const allTimes = new Set();
  timeline.forEach(b => { allTimes.add(b.start); allTimes.add(b.end); });
  const sortedTimes = [...allTimes].sort((a, b) => a - b);

  sortedTimes.forEach(t => {
    const tick = document.createElement('span');
    tick.className = 'axis-tick';
    tick.style.left = (56 + t * PX) + 'px';
    tick.textContent = Number.isInteger(t) ? t : t.toFixed(1);
    axisRow.appendChild(tick);
  });
  container.appendChild(axisRow);

  // Fila CPU
  const tickStep = 1;
  container.appendChild(
    buildRow('CPU', timeline, null, PX, trackW, total, tickStep, procMap)
  );

  // Separador
  const sep = document.createElement('div');
  sep.className = 'gantt-separator';
  container.appendChild(sep);

  // Fila por proceso
  const pids = [...new Set(timeline.filter(b => b.type === 'run').map(b => b.pid))];
  pids.forEach(pid => {
    container.appendChild(
      buildRow(pid, timeline, pid, PX, trackW, total, tickStep, procMap)
    );
  });
  
  if (legendId) {
    renderLegend(pids, legendId);
  }
}

/**
 * Renderiza la tabla comparativa de resultados por proceso.
 */
function exRenderResultsTable(procs, metrics1, metrics2, label1, label2) {
  const tbody = $('ex-results-tbody');
  tbody.innerHTML = '';

  procs.forEach(p => {
    const m1 = metrics1.find(m => m.pid === p.pid);
    const m2 = metrics2.find(m => m.pid === p.pid);
    if (!m1 || !m2) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell">${p.pid}</td>
      <td>${p.arrival}</td>
      <td>${p.burst}</td>
      <td>${round4(m1.finish)}</td>
      <td>${round4(m1.turnaround)}</td>
      <td>${round4(m1.response)}</td>
      <td>${round4(m1.waitTime)}</td>
      <td class="ex-col-sep">${round4(m2.finish)}</td>
      <td>${round4(m2.turnaround)}</td>
      <td>${round4(m2.response)}</td>
      <td>${round4(m2.waitTime)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Carga un ejercicio predefinido en la tabla del módulo.
 * @param {string} exerciseId - ID del ejercicio ('ex10' o 'ex11').
 */
function exLoadPreset(exerciseId) {
  let data, mode;

  if (exerciseId === 'ex10-np') {
    data = [
      { name: 'A', arrival: 0,   burst: 4 },
      { name: 'B', arrival: 0.6, burst: 3 },
      { name: 'C', arrival: 0.8, burst: 2 },
    ];
    mode = 'non-preemptive';
    $('ex-ctx-time').value = '0';
    $('ex-quantum').value = '';
  } else if (exerciseId === 'ex10-rr') {
    data = [
      { name: 'A', arrival: 0,   burst: 4 },
      { name: 'B', arrival: 0.6, burst: 3 },
      { name: 'C', arrival: 0.8, burst: 2 },
    ];
    mode = 'round-robin';
    $('ex-ctx-time').value = '0';
    // Auto-quantum will be calculated
    $('ex-quantum').value = '';
  } else if (exerciseId === 'ex11') {
    data = [
      { name: 'A', arrival: 0, burst: 3 },
      { name: 'B', arrival: 2, burst: 6 },
      { name: 'C', arrival: 2, burst: 4 },
      { name: 'D', arrival: 3, burst: 5 },
      { name: 'E', arrival: 4, burst: 2 },
    ];
    mode = 'round-robin';
    $('ex-ctx-time').value = '0';
    $('ex-quantum').value = '';
  }

  if (!data) return;

  $('ex-num-procs').value = data.length;
  $('ex-mode').value = mode;
  exBuildTable();

  // Fill the data
  const rows = Array.from($('ex-tbody').querySelectorAll('tr'));
  data.forEach((d, i) => {
    if (!rows[i]) return;
    rows[i].querySelector('.ex-name-input').value = d.name;
    rows[i].querySelector('.ex-arr-input').value = d.arrival;
    rows[i].querySelector('.ex-burst-input').value = d.burst;
  });

  exUpdateModeUI();
  exClearResults();
}

/**
 * Muestra/oculta el campo de quantum según el modo seleccionado.
 */
function exUpdateModeUI() {
  const mode = $('ex-mode').value;
  const qField = $('ex-quantum-field');
  if (qField) {
    qField.style.display = mode === 'round-robin' ? '' : 'none';
  }
}


/* ================================================================
   §6  MÓDULO 2 — ENVEJECIMIENTO (SJF Predictivo / Aging)
   Fórmula: τ(n+1) = α · t(n) + (1 − α) · τ(n)
   ================================================================ */

/**
 * Genera la tabla de entrada con tiempos reales aleatorios.
 */
function agingBuildTable() {
  const n     = parseInt($('ag-n').value)    || 5;
  const tau0  = parseFloat($('ag-tau0').value) || 45;
  const tbody = $('ag-tbody');
  if (!tbody) return;
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

/** Oculta resultados del módulo aging. */
function agingClear() {
  ['ag-results-panel','ag-chart-panel'].forEach(id => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}

/**
 * Ejecuta la simulación de envejecimiento, calcula predicciones,
 * renderiza tabla de resultados, métricas y gráfico.
 */
function agingSimulate() {
  const alpha = parseFloat($('ag-alpha').value);
  const tau0  = parseFloat($('ag-tau0').value);
  const rows  = Array.from($('ag-tbody').querySelectorAll('tr'));

  if (!rows.length) { alert('Generá la tabla primero.'); return; }
  if (isNaN(alpha) || alpha <= 0 || alpha > 1) {
    alert('α debe estar entre 0 (exclusivo) y 1 (inclusivo).'); return;
  }

  const tReals = rows.map(r => parseFloat(r.querySelector('.ag-real-input').value) || 0);

  // Secuencia de predicciones: τ(1) = tau0, τ(n+1) = α·t(n) + (1-α)·τ(n)
  const taus = [tau0];
  for (let i = 0; i < tReals.length; i++) {
    taus.push(round4(alpha * tReals[i] + (1 - alpha) * taus[i]));
  }

  // Tabla de resultados
  const tbody = $('ag-results-tbody');
  tbody.innerHTML = '';

  tReals.forEach((t, i) => {
    const tauN    = taus[i];
    const tauNext = taus[i + 1];
    const calcStr = `${alpha} × ${t} + ${round4(1 - alpha)} × ${tauN} = ${round4(alpha * t)} + ${round4((1 - alpha) * tauN)}`;

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

  // Fila de próxima predicción
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

  // Métricas de error
  const errors = tReals.map((t, i) => Math.abs(t - taus[i]));
  const mae    = round4(errors.reduce((s, e) => s + e, 0) / errors.length);
  const rmse   = round4(Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length));

  $('ag-metrics-bar').innerHTML = `
    <div class="metric"><span class="m-label">α utilizado</span><span class="m-value">${alpha}</span></div>
    <div class="metric"><span class="m-label">τ₁ inicial</span><span class="m-value">${tau0} ms</span></div>
    <div class="metric"><span class="m-label">Próxima predicción</span><span class="m-value">${taus[tReals.length]} ms</span></div>
    <div class="metric"><span class="m-label">Error Absoluto Medio</span><span class="m-value">${mae} ms</span></div>
    <div class="metric"><span class="m-label">RMSE</span><span class="m-value">${rmse} ms</span></div>
  `;

  ['ag-results-panel','ag-chart-panel'].forEach(id => $(id).classList.remove('hidden'));
  agingRenderChart(tReals, taus, alpha);
}

/**
 * Dibuja el gráfico de líneas comparando tiempo real vs predicción.
 * @param {Array}  tReals - Tiempos reales t(n).
 * @param {Array}  taus   - Predicciones τ(n).
 * @param {number} alpha  - Valor de α usado.
 */
function agingRenderChart(tReals, taus, alpha) {
  const canvas = $('ag-canvas');
  const ctx    = canvas.getContext('2d');

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
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;
  const n   = tReals.length;

  const allVals = [...tReals, ...taus];
  const yMin = Math.floor(Math.min(...allVals) * 0.85);
  const yMax = Math.ceil (Math.max(...allVals) * 1.10);

  const xScale = i => PAD.left + (i / n) * cW;
  const yScale = v => PAD.top  + cH - ((v - yMin) / (yMax - yMin)) * cH;

  // Fondo
  ctx.fillStyle = '#1a1f1e';
  ctx.fillRect(0, 0, W, H);

  // Cuadrícula
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

  // Ejes
  ctx.strokeStyle = 'rgba(108,189,181,0.3)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.lineTo(PAD.left + cW, PAD.top + cH);
  ctx.stroke();

  // Labels eje X
  ctx.fillStyle = 'rgba(108,189,181,0.5)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  for (let i = 1; i <= n; i++) {
    ctx.fillText(`n=${i}`, xScale(i - 0.5), PAD.top + cH + 16);
  }

  // Línea de tiempo real t(n)
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

  // Línea de predicción τ(n) (dashed)
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

  // Punto de próxima predicción
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

  // Título eje Y
  ctx.save();
  ctx.translate(12, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(108,189,181,0.4)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('Tiempo (ms)', 0, 0);
  ctx.restore();
}


/* ================================================================
   §7  MÓDULO 3 — EFICIENCIA Y SOBRECARGA
   Fórmula: η = T_útil / (T_útil + S) × 100
   ================================================================ */

/** Inicializa el módulo de sobrecarga (oculta paneles). */
function overloadBuildTable() {
  $('ov-results-panel').classList.add('hidden');
  $('ov-chart-panel').classList.add('hidden');
}

/**
 * Calcula y renderiza la tabla de eficiencia para distintos casos de Quantum.
 * Compara Q = ∞, Q > T, Q = T, S < Q < T, Q = S, Q → 0.
 */
function overloadSimulate() {
  const T = parseFloat($('ov-t').value);
  const S = parseFloat($('ov-s').value);

  if (isNaN(T) || T <= 0 || isNaN(S) || S <= 0) {
    alert('T y S deben ser valores positivos.'); return;
  }

  // Limpiar tabla
  const tbody = $('ov-results-tbody');
  tbody.innerHTML = '';

  // Definición de los casos del ejercicio
  const casos = [
    { label: 'Q = ∞',      val: Infinity,   desc: 'El proceso termina su ráfaga T siempre.' },
    { label: 'Q > T',      val: T * 1.5,    desc: 'Quantum mayor a la ráfaga (Q=1.5T).' },
    { label: 'Q = T',      val: T,          desc: 'Quantum igual a la ráfaga.' },
    { label: 'S < Q < T',  val: (S + T) / 2, desc: 'Quantum intermedio.' },
    { label: 'Q = S',      val: S,          desc: 'Sobrecarga igual al trabajo útil.' },
    { label: 'Q → 0',      val: 0.1,        desc: 'Quantum extremadamente pequeño.' }
  ];

  const dataGrafico = [];

  casos.forEach(caso => {
    let tUtil, eficiencia, formula;
    const Q = caso.val;

    if (Q >= T) {
      tUtil = T;
      formula = `T / (T + S) = ${T} / (${T} + ${S})`;
    } else {
      tUtil = Q;
      formula = `Q / (Q + S) = ${Q} / (${Q} + ${S})`;
    }

    eficiencia = (tUtil / (tUtil + S)) * 100;
    dataGrafico.push({ x: caso.label, y: eficiencia, q: Q });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pid-cell" style="color:var(--teal)">${caso.label}</td>
      <td>${Q === Infinity ? '∞' : Q.toFixed(1)} ms</td>
      <td>${tUtil.toFixed(1)} ms</td>
      <td class="ag-calc-cell">${formula}</td>
      <td class="ag-pred-cell" style="color:${eficiencia < 50 ? 'var(--red, #ff5555)' : 'var(--teal)'}">
        ${eficiencia.toFixed(2)}%
      </td>
    `;
    tbody.appendChild(tr);
  });

  $('ov-results-panel').classList.remove('hidden');
  $('ov-chart-panel').classList.remove('hidden');
  overloadRenderChart(dataGrafico, T, S);
}

/**
 * Dibuja un gráfico de barras comparativo de eficiencia.
 * @param {Array}  data - Datos [{x, y, q}].
 * @param {number} T    - Tiempo de ráfaga.
 * @param {number} S    - Tiempo de sobrecarga.
 */
function overloadRenderChart(data, T, S) {
  const canvas = $('ov-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 800;
  const H = 280;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#1a1f1e';
  ctx.fillRect(0, 0, W, H);

  const PAD = { top: 40, right: 30, bottom: 50, left: 60 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // Ejes
  ctx.strokeStyle = 'rgba(108,189,181,0.3)';
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.lineTo(PAD.left + cW, PAD.top + cH);
  ctx.stroke();

  // Barras
  const barW = (cW / data.length) * 0.6;
  const gap  = (cW / data.length) * 0.4;

  data.forEach((d, i) => {
    const x = PAD.left + i * (barW + gap) + gap / 2;
    const h = (d.y / 100) * cH;
    const y = PAD.top + cH - h;

    // Degradado según eficiencia
    const grad = ctx.createLinearGradient(x, y, x, PAD.top + cH);
    grad.addColorStop(0, d.y > 50 ? '#6CBDB5' : '#ff5555');
    grad.addColorStop(1, '#1a1f1e');

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, h);

    // Porcentaje encima
    ctx.fillStyle = '#fff';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(d.y.toFixed(1) + '%', x + barW / 2, y - 10);

    // Labels X
    ctx.fillStyle = 'rgba(108,189,181,0.7)';
    ctx.fillText(d.x, x + barW / 2, PAD.top + cH + 20);
  });

  // Título eje Y
  ctx.save();
  ctx.translate(20, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(108,189,181,0.7)';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('EFICIENCIA %', 0, 0);
  ctx.restore();
}