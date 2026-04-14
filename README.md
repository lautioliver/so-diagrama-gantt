# CPU SIM — Simulador de Planificación de Procesos

> Simulador interactivo de algoritmos de planificación para procesador mononúcleo.  
> **Sistemas Operativos · UCASAL · Salta · 2026**

---

## 📋 Módulos

### Módulo 01 — Planificación de Procesos
Simulación de los algoritmos clásicos de scheduling con diagrama de Gantt interactivo:
- **FCFS** — First Come First Served
- **SJF** — Shortest Job First (No Preemptivo)
- **Round Robin** — Turno Circular con quantum estricto
- **Prioridad** — No Preemptivo (número mayor = mayor prioridad)

Incluye cálculo de **eficiencia del CPU (η)** para cada simulación:

```
η = (Σ duración bloques de ejecución / Tiempo total) × 100
```

### Módulo 02 — Envejecimiento (SJF Predictivo)
Predicción del tiempo de ráfaga mediante media exponencial ponderada:

```
τ(n+1) = α · t(n) + (1 − α) · τ(n)
```

Incluye gráfico en tiempo real de predicción vs realidad, y métricas de error (MAE, RMSE).

### Módulo 03 — Eficiencia y Sobrecarga
Análisis de la eficiencia del CPU según la relación quantum/sobrecarga:

```
η = T_útil / (T_útil + S) × 100
```

Compara 6 escenarios: Q=∞, Q>T, Q=T, S<Q<T, Q=S, Q→0.

### Módulo 04 — Resolución de Ejercicios
Resolución de ejercicios de examen con comparación lado a lado de algoritmos:
- Comparación en paralelo de **FCFS vs SJF** y sus variantes con **Round Robin**.
- Soporte para tiempos decimales y nombramiento personalizado (Ej: A, B, C...).
- **Algoritmo Auto-Quantum**: Busca heurísticamente el quantum máximo posible que beneficie a los procesos cortos minimizando los cambios de contexto.
- **Fórmulas de Rendimiento**: Exposición dinámica de las fórmulas utilizadas al momento de procesar una simulación (mostradas con estilo similar a LaTeX) incluyendo tiempo de respuesta, tiempo de retorno, tiempo de espera, y eficiencia.

### Referencias 📚
Este proyecto utiliza como base teórica el libro "Sistemas Operativos Modernos" de Andrew S. Tanenbaum. 
Se modelaron conceptos como:
- Exclusión mutua (Alternancia estricta)
- Planificación de procesos (Algoritmos de corto y largo plazo)
- Análisis de eficiencia por sobrecarga de conmutación ($S$)

---

## 🚀 Cómo usar

1. Abrí `index.html` en tu navegador (no necesita servidor).
2. Seleccioná un módulo desde la pantalla de inicio.
3. Configurá los parámetros y hacé clic en el respectivo botón para accionar.

---

## 📂 Estructura del proyecto

```
├── index.html      # Estructura HTML de cada uno de los 4 módulos
├── Scheduler.js    # Lógica: algoritmos, control de simulación y renderizado DOM
├── styles.css      # Sistema de diseño de variables base y utilidades LaTeX/Gantt
└── README.md       # Esta documentación
```

---

## 🎨 Características principales

- **Tema oscuro/claro** con persistencia local
- **Diagramas de Gantt** independientes con scroll horizontal relativo
- **Fórmulas estilizadas** similares al set de herramientas de tipado académico
- **Arquitectura liviana** en base de Vanilla JS/CSS puro

---

*By NumérikaAI*

