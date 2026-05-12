/**
 * ForceGraph — Phase 9.2
 * Pure-JS force-directed graph layout engine. No D3, no external deps.
 *
 * Graph direction: prerequisite → topic  (same as knowledge_graph_service.py)
 *
 * Usage:
 *   const fg = new ForceGraph(nodes, edges, width, height);
 *   const positioned = fg.simulate(300);
 *   // positioned[i] = { ...originalNode, x, y }
 */

export class ForceGraph {
  /**
   * @param {Array<{id:string, label:string, [key:string]:any}>} nodes
   * @param {Array<{source:string, target:string}>} edges
   * @param {number} width   canvas width  (px)
   * @param {number} height  canvas height (px)
   * @param {object} [opts]  optional tuning overrides
   */
  constructor(nodes, edges, width, height, opts = {}) {
    this.width  = width;
    this.height = height;
    this.cx     = width  / 2;
    this.cy     = height / 2;

    // Tuning constants — all overridable
    this.repulsionStrength  = opts.repulsionStrength  ?? 2000;
    this.attractionStrength = opts.attractionStrength ?? 0.05;
    this.idealEdgeLength    = opts.idealEdgeLength    ?? 130;
    this.gravityStrength    = opts.gravityStrength    ?? 0.005;
    this.damping            = opts.damping            ?? 0.85;
    this.padding            = opts.padding            ?? 60;

    // Clone nodes and add physics state
    this.nodes = nodes.map((n, i) => ({
      ...n,
      // Spread initial positions in a circle to reduce early overlap
      x:  this.cx + Math.cos((i / nodes.length) * 2 * Math.PI) * (Math.min(width, height) * 0.3),
      y:  this.cy + Math.sin((i / nodes.length) * 2 * Math.PI) * (Math.min(width, height) * 0.3),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
    }));

    // Build id → index map for O(1) edge lookups
    this._idxMap = {};
    this.nodes.forEach((n, i) => { this._idxMap[n.id] = i; });

    // Resolve edges to index pairs (skip unknown ids)
    this.edges = edges
      .map(e => ({
        si: this._idxMap[e.source],
        ti: this._idxMap[e.target],
        ...e,
      }))
      .filter(e => e.si !== undefined && e.ti !== undefined);
  }

  // ── Single iteration ────────────────────────────────────────────────────────

  applyForces() {
    const { nodes, edges, cx, cy } = this;
    const n = nodes.length;

    // ── 1. REPULSION — every pair pushes apart ──────────────────────────────
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx   = nodes[i].x - nodes[j].x;
        const dy   = nodes[i].y - nodes[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f    = this.repulsionStrength / (dist * dist);
        const fx   = f * dx / dist;
        const fy   = f * dy / dist;

        nodes[i].vx += fx;
        nodes[i].vy += fy;
        nodes[j].vx -= fx;
        nodes[j].vy -= fy;
      }
    }

    // ── 2. ATTRACTION — connected nodes pull toward ideal distance ──────────
    for (const e of edges) {
      const u = nodes[e.si];
      const v = nodes[e.ti];
      const dx   = v.x - u.x;
      const dy   = v.y - u.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f    = (dist - this.idealEdgeLength) * this.attractionStrength;
      const fx   = f * dx / dist;
      const fy   = f * dy / dist;

      u.vx += fx;
      u.vy += fy;
      v.vx -= fx;
      v.vy -= fy;
    }

    // ── 3. GRAVITY — pull all nodes toward canvas center ────────────────────
    for (const node of nodes) {
      node.vx += (cx - node.x) * this.gravityStrength;
      node.vy += (cy - node.y) * this.gravityStrength;
    }

    // ── 4. DAMPING — friction to bleed off kinetic energy ───────────────────
    for (const node of nodes) {
      node.vx *= this.damping;
      node.vy *= this.damping;
    }

    // ── 5. INTEGRATE + CLAMP to canvas bounds ───────────────────────────────
    const { padding, width, height } = this;
    for (const node of nodes) {
      node.x = Math.max(padding, Math.min(width  - padding, node.x + node.vx));
      node.y = Math.max(padding, Math.min(height - padding, node.y + node.vy));
    }
  }

  // ── Full simulation ─────────────────────────────────────────────────────────

  /**
   * Run `iterations` force steps and return the final node array.
   * Each node has { ...original, x, y } (vx/vy stripped from output).
   *
   * @param {number} [iterations=300]
   * @returns {Array<{id:string, x:number, y:number, [key:string]:any}>}
   */
  simulate(iterations = 300) {
    for (let i = 0; i < iterations; i++) {
      this.applyForces();
    }
    return this.nodes.map(({ vx, vy, ...rest }) => rest);
  }

  /**
   * Run a partial simulation (useful for incremental animation).
   * @param {number} steps
   */
  step(steps = 10) {
    for (let i = 0; i < steps; i++) this.applyForces();
  }

  /** Return current node positions without stripping velocity. */
  getPositions() {
    return this.nodes;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a quadratic bezier control point for a curved edge.
 * Curves edges slightly so bidirectional pairs don't overlap.
 *
 * @param {{x:number,y:number}} src
 * @param {{x:number,y:number}} tgt
 * @param {number} [curvature=0.2]
 * @returns {{cx:number, cy:number}}  SVG Q control point
 */
export function bezierControl(src, tgt, curvature = 0.2) {
  const mx = (src.x + tgt.x) / 2;
  const my = (src.y + tgt.y) / 2;
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  // Perpendicular offset
  return {
    cx: mx - dy * curvature,
    cy: my + dx * curvature,
  };
}

/**
 * Map an IRT theta value to a mastery colour.
 * @param {number|null} theta
 * @param {boolean} [hasGap]
 * @returns {string} hex colour
 */
export function thetaToColor(theta, hasGap = false) {
  if (theta === null || theta === undefined) return '#475569'; // gray — not assessed
  if (hasGap)  return '#EF4444'; // red — gap detected
  if (theta >  0.5) return '#10B981'; // green — mastered
  if (theta >= -0.5) return '#F59E0B'; // amber — in progress
  return '#EF4444'; // red — needs work
}

/**
 * Map topic weightage_percent to node radius (12–24 px).
 * @param {number} weightage  0–100
 * @returns {number}
 */
export function weightageToRadius(weightage) {
  const w = Math.max(1, Math.min(weightage || 5, 20));
  return 12 + (w / 20) * 12; // 12–24 px
}
