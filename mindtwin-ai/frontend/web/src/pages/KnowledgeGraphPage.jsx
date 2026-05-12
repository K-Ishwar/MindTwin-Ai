/**
 * KnowledgeGraphPage — Phase 9.2
 * Interactive knowledge graph visualization with force-directed layout,
 * zoom/pan, node selection side panel, and sortable list view.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ForceGraph, bezierControl, thetaToColor, weightageToRadius } from '../utils/forceGraph';
import { knowledgeGraphApi } from '../api/knowledgeGraphApi';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = {
  Mathematics: '#6366F1', Physics: '#3B82F6', Chemistry: '#10B981',
  Biology: '#F59E0B', Science: '#06B6D4', History: '#EC4899',
  English: '#8B5CF6', default: '#64748B',
};

const BOARDS  = ['CBSE', 'JEE', 'NEET'];
const GRADES  = ['Class 10', 'Class 11', 'Class 12', 'Main', 'UG'];

const MASTERY_LEGEND = [
  { color: '#10B981', label: 'Mastered',      desc: 'theta > 0.5' },
  { color: '#F59E0B', label: 'In Progress',   desc: '-0.5 to 0.5' },
  { color: '#EF4444', label: 'Needs Work',    desc: 'theta < -0.5 or gap' },
  { color: '#475569', label: 'Not Assessed',  desc: 'no quiz taken' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function truncate(str, max = 22) {
  return str && str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function masteryLabel(theta, hasGap) {
  if (theta === null || theta === undefined) return 'Not Assessed';
  if (hasGap || theta < -0.5) return 'Needs Work';
  if (theta >= 0.5) return 'Mastered';
  return 'In Progress';
}

function thetaPct(theta) {
  if (theta === null || theta === undefined) return null;
  return Math.round(((theta + 3) / 6) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH SVG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const CANVAS_W = 900;
const CANVAS_H = 620;

function KnowledgeGraphSVG({ graphData, thetaMap, gapSet, selectedId, onSelectNode, highlightPath }) {
  const [positions, setPositions]   = useState([]);
  const [viewBox, setViewBox]       = useState({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });
  const [isPanning, setIsPanning]   = useState(false);
  const panStart = useRef(null);
  const svgRef   = useRef(null);

  // ── Build and simulate graph on data change ─────────────────────────────
  useEffect(() => {
    if (!graphData?.topics?.length) { setPositions([]); return; }

    const nodes = graphData.topics.map(t => ({
      id:         t.topic_id,
      label:      t.name || t.topic_name,
      weightage:  t.weightage_percent || 5,
      difficulty: t.difficulty_level  || 3,
      subject:    graphData.subject,
    }));

    const edges = graphData.topics.flatMap(t =>
      (t.prerequisites || []).map(prereqId => ({
        source: prereqId,
        target: t.topic_id,
        type:   'prerequisite',
      }))
    );

    // Run simulation in a microtask so UI doesn't freeze
    const fg = new ForceGraph(nodes, edges, CANVAS_W, CANVAS_H, {
      repulsionStrength:  2000,
      attractionStrength: 0.05,
      idealEdgeLength:    130,
      gravityStrength:    0.005,
      damping:            0.85,
      padding:            70,
    });
    const result = fg.simulate(300);
    setPositions(result);
    setViewBox({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });
  }, [graphData]);

  // ── Build edge list from topics ─────────────────────────────────────────
  const edges = useMemo(() => {
    if (!graphData?.topics) return [];
    return graphData.topics.flatMap(t =>
      (t.prerequisites || []).map(prereqId => ({
        source: prereqId,
        target: t.topic_id,
      }))
    );
  }, [graphData]);

  // ── Position map for O(1) lookup ────────────────────────────────────────
  const posMap = useMemo(() => {
    const m = {};
    positions.forEach(p => { m[p.id] = p; });
    return m;
  }, [positions]);

  // ── Zoom via wheel ──────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    setViewBox(vb => {
      const newW = Math.max(300, Math.min(CANVAS_W * 2, vb.w * factor));
      const newH = Math.max(200, Math.min(CANVAS_H * 2, vb.h * factor));
      const dx = (vb.w - newW) / 2;
      const dy = (vb.h - newH) / 2;
      return { x: vb.x + dx, y: vb.y + dy, w: newW, h: newH };
    });
  }, []);

  // ── Pan via drag ────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.kg-node')) return; // don't pan when clicking nodes
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } };
  }, [viewBox]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning || !panStart.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = panStart.current.vb.w / rect.width;
    const scaleY = panStart.current.vb.h / rect.height;
    const dx = (e.clientX - panStart.current.x) * scaleX;
    const dy = (e.clientY - panStart.current.y) * scaleY;
    setViewBox({
      ...panStart.current.vb,
      x: panStart.current.vb.x - dx,
      y: panStart.current.vb.y - dy,
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => { setIsPanning(false); }, []);

  const resetView = () => setViewBox({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });

  if (!positions.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        {graphData ? 'Simulating layout…' : 'Select a subject to view the graph'}
      </div>
    );
  }

  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div className="relative w-full h-full">
      {/* Reset zoom button */}
      <button
        onClick={resetView}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition"
      >
        ⊙ Reset View
      </button>

      <svg
        ref={svgRef}
        viewBox={vbStr}
        className="w-full h-full"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', userSelect: 'none' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          {/* Arrowhead marker */}
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#334155" />
          </marker>
          <marker id="arrow-hi" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6366F1" />
          </marker>
          {/* Pulse animation for gap nodes */}
          <style>{`
            @keyframes kg-pulse {
              0%,100% { opacity:0.6; r:0; }
              50%      { opacity:0;   r:10; }
            }
            .kg-pulse-ring { animation: kg-pulse 1.8s ease-out infinite; }
          `}</style>
        </defs>

        {/* ── EDGES ── */}
        {edges.map((e, i) => {
          const src = posMap[e.source];
          const tgt = posMap[e.target];
          if (!src || !tgt) return null;

          const isHighlighted = selectedId === e.source || selectedId === e.target
            || (highlightPath && (highlightPath.includes(e.source) && highlightPath.includes(e.target)));
          const { cx, cy } = bezierControl(src, tgt, 0.18);

          // Shorten line to not overlap node circles
          const srcR = weightageToRadius(posMap[e.source]?.weightage || 5);
          const tgtR = weightageToRadius(posMap[e.target]?.weightage || 5) + 6; // +6 for arrowhead

          const dx = tgt.x - src.x, dy = tgt.y - src.y;
          const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const sx = src.x + (dx / len) * srcR;
          const sy = src.y + (dy / len) * srcR;
          const ex = tgt.x - (dx / len) * tgtR;
          const ey = tgt.y - (dy / len) * tgtR;

          return (
            <path
              key={i}
              d={`M ${sx},${sy} Q ${cx},${cy} ${ex},${ey}`}
              fill="none"
              stroke={isHighlighted ? '#6366F1' : '#334155'}
              strokeWidth={isHighlighted ? 2 : 1.5}
              markerEnd={isHighlighted ? 'url(#arrow-hi)' : 'url(#arrow)'}
              opacity={selectedId && !isHighlighted ? 0.25 : 0.8}
            />
          );
        })}

        {/* ── NODES ── */}
        {positions.map(node => {
          const theta   = thetaMap[node.id] ?? null;
          const hasGap  = gapSet.has(node.id);
          const color   = thetaToColor(theta, hasGap);
          const r       = weightageToRadius(node.weightage);
          const isSelected = selectedId === node.id;
          const inPath  = highlightPath?.includes(node.id);
          const dimmed  = selectedId && !isSelected && !inPath;

          return (
            <g
              key={node.id}
              className="kg-node"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectNode(node.id === selectedId ? null : node.id)}
            >
              {/* Gap pulse ring */}
              {hasGap && (
                <circle
                  cx={node.x} cy={node.y}
                  r={r + 4}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="2"
                  className="kg-pulse-ring"
                />
              )}

              {/* Selection ring */}
              {isSelected && (
                <circle cx={node.x} cy={node.y} r={r + 6}
                  fill="none" stroke="#6366F1" strokeWidth="2.5" opacity="0.9" />
              )}

              {/* Main circle */}
              <circle
                cx={node.x} cy={node.y} r={r}
                fill={color}
                stroke={isSelected ? '#6366F1' : '#0F172A'}
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={dimmed ? 0.3 : 1}
              />

              {/* Label */}
              <text
                x={node.x} y={node.y + r + 13}
                textAnchor="middle"
                fill={dimmed ? '#334155' : '#CBD5E1'}
                fontSize="10"
                fontWeight={isSelected ? '700' : '500'}
                style={{ pointerEvents: 'none' }}
              >
                {truncate(node.label, 20)}
              </text>

              {/* Difficulty dot inside circle */}
              <text
                x={node.x} y={node.y + 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontSize={r > 16 ? '10' : '8'}
                fontWeight="700"
                style={{ pointerEvents: 'none' }}
              >
                {node.difficulty}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE TOOLTIP (hover)
// ─────────────────────────────────────────────────────────────────────────────

function NodeTooltip({ node, theta, hasGap, style }) {
  if (!node) return null;
  const pct = thetaPct(theta);
  const color = thetaToColor(theta, hasGap);
  return (
    <div
      className="absolute z-30 pointer-events-none bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs"
      style={{ minWidth: 180, maxWidth: 240, ...style }}
    >
      <p className="font-bold text-white text-sm mb-1 leading-tight">{node.label}</p>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span style={{ color }}>{masteryLabel(theta, hasGap)}</span>
        {pct !== null && <span className="text-slate-400 ml-auto">{pct}% mastery</span>}
      </div>
      {theta !== null && theta !== undefined && (
        <p className="text-slate-500">θ = {theta.toFixed(3)}</p>
      )}
      {hasGap && (
        <p className="text-red-400 font-semibold mt-1">⚠ Gap detected</p>
      )}
      <p className="text-slate-600 mt-1">Difficulty: {'★'.repeat(node.difficulty || 3)}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTED NODE SIDE PANEL
// ─────────────────────────────────────────────────────────────────────────────

function NodeSidePanel({ nodeId, graphData, thetaMap, gapSet, onClose, onSelectNode }) {
  const navigate = useNavigate();

  const topic = useMemo(() => {
    if (!nodeId || !graphData?.topics) return null;
    return graphData.topics.find(t => t.topic_id === nodeId);
  }, [nodeId, graphData]);

  if (!topic) return null;

  const theta   = thetaMap[nodeId] ?? null;
  const hasGap  = gapSet.has(nodeId);
  const color   = thetaToColor(theta, hasGap);
  const pct     = thetaPct(theta);

  const prereqs = (topic.prerequisites || []).map(pid =>
    graphData.topics.find(t => t.topic_id === pid)
  ).filter(Boolean);

  const unlocks = graphData.topics.filter(t =>
    (t.prerequisites || []).includes(nodeId)
  );

  const handleAddToPlan = async () => {
    try {
      const { default: api } = await import('../api/axios');
      await api.post('/api/scheduler/replan', {
        reason: 'gap_detected',
        gap_topic_ids: [nodeId],
      });
      alert('Added to study plan!');
    } catch {
      alert('Could not update plan — try from the Study Plan page.');
    }
  };

  return (
    <div
      className="absolute top-0 right-0 h-full w-72 bg-slate-900 border-l border-slate-700 flex flex-col z-20 overflow-hidden"
      style={{ transition: 'transform 0.25s ease' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-700">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{graphData.subject}</p>
          <h3 className="text-white font-bold text-sm leading-tight">{topic.name || topic.topic_name}</h3>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none mt-0.5">✕</button>
      </div>

      {/* Mastery status */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm"
            style={{ background: color }}>
            {pct !== null ? `${pct}%` : '?'}
          </div>
          <div>
            <p className="text-white font-semibold text-sm" style={{ color }}>{masteryLabel(theta, hasGap)}</p>
            {theta !== null && <p className="text-slate-500 text-xs">θ = {theta.toFixed(3)}</p>}
          </div>
        </div>
        {/* Mini mastery bar */}
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct ?? 0}%`, background: color }} />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>Difficulty: {'★'.repeat(topic.difficulty_level || 3)}</span>
          <span>{topic.weightage_percent || 5}% weight</span>
        </div>
      </div>

      {/* Prerequisites */}
      {prereqs.length > 0 && (
        <div className="p-4 border-b border-slate-700/50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prerequisites</p>
          <div className="space-y-1.5">
            {prereqs.map(p => {
              const pTheta = thetaMap[p.topic_id] ?? null;
              const pColor = thetaToColor(pTheta, gapSet.has(p.topic_id));
              return (
                <button
                  key={p.topic_id}
                  onClick={() => onSelectNode(p.topic_id)}
                  className="w-full flex items-center gap-2 text-left hover:bg-slate-800 rounded-lg px-2 py-1.5 transition"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pColor }} />
                  <span className="text-slate-300 text-xs truncate">{p.name || p.topic_name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unlocks */}
      {unlocks.length > 0 && (
        <div className="p-4 border-b border-slate-700/50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Unlocks</p>
          <div className="space-y-1.5">
            {unlocks.slice(0, 4).map(u => {
              const uColor = thetaToColor(thetaMap[u.topic_id] ?? null, gapSet.has(u.topic_id));
              return (
                <button
                  key={u.topic_id}
                  onClick={() => onSelectNode(u.topic_id)}
                  className="w-full flex items-center gap-2 text-left hover:bg-slate-800 rounded-lg px-2 py-1.5 transition"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: uColor }} />
                  <span className="text-slate-300 text-xs truncate">{u.name || u.topic_name}</span>
                </button>
              );
            })}
            {unlocks.length > 4 && (
              <p className="text-slate-600 text-xs px-2">+{unlocks.length - 4} more</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 mt-auto space-y-2">
        <button
          onClick={() => navigate('/quiz', { state: { autoStart: nodeId, topicName: topic.name || topic.topic_name } })}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition"
        >
          🧠 Take Quiz
        </button>
        <button
          onClick={handleAddToPlan}
          className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition"
        >
          📋 Add to Plan
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────────────────────────────────────

function GraphLegend({ showPath, onTogglePath }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-slate-700/50 bg-slate-900/60">
      {MASTERY_LEGEND.map(l => (
        <div key={l.label} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
          <span className="text-xs text-slate-400">{l.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="text-xs text-slate-500">Size = weightage</span>
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <span className="text-xs text-slate-500">Number = difficulty</span>
      </div>
      <button
        onClick={onTogglePath}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
          showPath ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
        }`}
      >
        🗺 Your Path
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────────────────────────────────────────

function ListView({ graphData, thetaMap, gapSet }) {
  const navigate = useNavigate();
  const [sortKey,    setSortKey]    = useState('name');
  const [sortAsc,    setSortAsc]    = useState(true);
  const [gapsOnly,   setGapsOnly]   = useState(false);
  const [search,     setSearch]     = useState('');

  const topics = useMemo(() => {
    if (!graphData?.topics) return [];
    let list = graphData.topics.map(t => ({
      ...t,
      theta:    thetaMap[t.topic_id] ?? null,
      hasGap:   gapSet.has(t.topic_id),
      masteryPct: thetaPct(thetaMap[t.topic_id] ?? null),
    }));
    if (gapsOnly) list = list.filter(t => t.hasGap);
    if (search)   list = list.filter(t => (t.name || t.topic_name || '').toLowerCase().includes(search.toLowerCase()));

    list.sort((a, b) => {
      let va, vb;
      if (sortKey === 'name')       { va = (a.name || a.topic_name || ''); vb = (b.name || b.topic_name || ''); }
      else if (sortKey === 'theta') { va = a.theta ?? -99; vb = b.theta ?? -99; }
      else if (sortKey === 'mastery') { va = a.masteryPct ?? -1; vb = b.masteryPct ?? -1; }
      else if (sortKey === 'difficulty') { va = a.difficulty_level || 3; vb = b.difficulty_level || 3; }
      else if (sortKey === 'weightage')  { va = a.weightage_percent || 0; vb = b.weightage_percent || 0; }
      else { va = 0; vb = 0; }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [graphData, thetaMap, gapSet, sortKey, sortAsc, gapsOnly, search]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortTh = ({ k, label }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-white select-none"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50 flex-wrap">
        <input
          type="text"
          placeholder="Search topics…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => setGapsOnly(g => !g)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            gapsOnly ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          {gapsOnly ? '✕ Gaps Only' : '⚠ Show Gaps Only'}
        </button>
        <span className="text-xs text-slate-500">{topics.length} topics</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-700">
            <tr>
              <SortTh k="name"       label="Topic" />
              <SortTh k="mastery"    label="Mastery" />
              <SortTh k="theta"      label="θ Score" />
              <SortTh k="difficulty" label="Difficulty" />
              <SortTh k="weightage"  label="Weight" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Gap</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t, i) => {
              const color = thetaToColor(t.theta, t.hasGap);
              return (
                <tr key={t.topic_id} className={`border-b border-slate-800 hover:bg-slate-800/50 transition ${i % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                  <td className="px-3 py-2.5">
                    <span className="text-white font-medium">{t.name || t.topic_name}</span>
                    {(t.prerequisites || []).length > 0 && (
                      <span className="ml-2 text-xs text-slate-600">{(t.prerequisites || []).length} prereqs</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${t.masteryPct ?? 0}%`, background: color }} />
                      </div>
                      <span className="text-xs" style={{ color }}>
                        {t.masteryPct !== null ? `${t.masteryPct}%` : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color }}>
                    {t.theta !== null ? t.theta.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {'★'.repeat(t.difficulty_level || 3)}{'☆'.repeat(5 - (t.difficulty_level || 3))}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{t.weightage_percent || 5}%</td>
                  <td className="px-3 py-2.5">
                    {t.hasGap
                      ? <span className="text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">Gap</span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => navigate('/quiz', { state: { autoStart: t.topic_id, topicName: t.name || t.topic_name } })}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                    >
                      {t.hasGap ? 'Fix Gap →' : 'Practice →'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {topics.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500 text-sm">No topics match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const navigate = useNavigate();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [board,   setBoard]   = useState('CBSE');
  const [grade,   setGrade]   = useState('Class 12');
  const [subject, setSubject] = useState(null);
  const [view,    setView]    = useState('graph'); // 'graph' | 'list'

  // ── Graph interaction state ───────────────────────────────────────────────
  const [selectedId,  setSelectedId]  = useState(null);
  const [showPath,    setShowPath]    = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: availableData } = useQuery({
    queryKey: ['kg-available'],
    queryFn:  knowledgeGraphApi.listAvailable,
    staleTime: 10 * 60 * 1000,
  });

  const { data: subjectsData } = useQuery({
    queryKey: ['kg-subjects', board, grade],
    queryFn:  () => knowledgeGraphApi.getAvailableSubjects(board, grade),
    staleTime: 10 * 60 * 1000,
    enabled:  !!board && !!grade,
  });

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['kg-graph', subject, board, grade],
    queryFn:  () => knowledgeGraphApi.getGraph(subject, board, grade),
    staleTime: 10 * 60 * 1000,
    enabled:  !!subject && !!board && !!grade,
  });

  const { data: masteryData } = useQuery({
    queryKey: ['kg-mastery'],
    queryFn:  knowledgeGraphApi.getMastery,
    staleTime: 5 * 60 * 1000,
  });

  const { data: quizData } = useQuery({
    queryKey: ['kg-quiz-attempts'],
    queryFn:  knowledgeGraphApi.getQuizAttempts,
    staleTime: 5 * 60 * 1000,
  });

  // ── Auto-select first subject when board/grade changes ───────────────────
  useEffect(() => {
    const subs = subjectsData?.subjects || [];
    if (subs.length > 0) setSubject(subs[0].subject);
    else setSubject(null);
    setSelectedId(null);
  }, [subjectsData]);

  // ── Build theta map and gap set from quiz data ────────────────────────────
  const { thetaMap, gapSet } = useMemo(() => {
    const thetaMap = {};
    const gapSet   = new Set();
    const topics   = quizData?.all_topics || quizData?.gaps || [];
    topics.forEach(t => {
      const id = t.topic_id || t.id;
      if (id) {
        if (t.theta !== undefined && t.theta !== null) thetaMap[id] = t.theta;
        if (t.gap_detected) gapSet.add(id);
      }
    });
    return { thetaMap, gapSet };
  }, [quizData]);

  // ── "Your Path" — recommended learning order for weakest topics ──────────
  const highlightPath = useMemo(() => {
    if (!showPath || !graphData?.topics) return null;
    // Find topics with gaps or low theta, get their prerequisite chains
    const weakIds = graphData.topics
      .filter(t => gapSet.has(t.topic_id) || (thetaMap[t.topic_id] ?? 0) < -0.3)
      .map(t => t.topic_id);
    if (weakIds.length === 0) return null;
    // Include all prerequisites of weak topics
    const pathSet = new Set(weakIds);
    graphData.topics.forEach(t => {
      if (weakIds.includes(t.topic_id)) {
        (t.prerequisites || []).forEach(p => pathSet.add(p));
      }
    });
    return [...pathSet];
  }, [showPath, graphData, thetaMap, gapSet]);

  // ── Available subjects for current board+grade ────────────────────────────
  const availableSubjects = subjectsData?.subjects || [];

  // ── Stats for header ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!graphData?.topics) return null;
    const total   = graphData.topics.length;
    const assessed = graphData.topics.filter(t => thetaMap[t.topic_id] !== undefined).length;
    const mastered = graphData.topics.filter(t => (thetaMap[t.topic_id] ?? -99) > 0.5).length;
    const gaps     = graphData.topics.filter(t => gapSet.has(t.topic_id)).length;
    return { total, assessed, mastered, gaps };
  }, [graphData, thetaMap, gapSet]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 55%)' }} />

      <div className="relative z-10 flex flex-col h-screen max-h-screen">

        {/* ── HEADER ── */}
        <header className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-slate-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <Link to="/dashboard" className="text-slate-500 text-xs hover:text-slate-300 transition mb-1 block">← Dashboard</Link>
              <h1 className="text-2xl font-black text-white">Knowledge Map</h1>
              <p className="text-slate-400 text-xs mt-0.5">Explore your subject graph and mastery</p>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
                {['graph', 'list'].map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${
                      view === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {v === 'graph' ? '🕸 Graph View' : '☰ List View'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Board dropdown */}
            <select
              value={board}
              onChange={e => { setBoard(e.target.value); setSubject(null); }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            {/* Grade dropdown */}
            <select
              value={grade}
              onChange={e => { setGrade(e.target.value); setSubject(null); }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            {/* Subject pills */}
            <div className="flex flex-wrap gap-2">
              {availableSubjects.length === 0 && (
                <span className="text-xs text-slate-500 italic">No graphs for this board/grade</span>
              )}
              {availableSubjects.map(s => {
                const color = SUBJECT_COLORS[s.subject] || SUBJECT_COLORS.default;
                const isActive = subject === s.subject;
                return (
                  <button
                    key={s.subject}
                    onClick={() => { setSubject(s.subject); setSelectedId(null); }}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition border"
                    style={isActive
                      ? { background: color + '30', borderColor: color + '80', color }
                      : { background: 'transparent', borderColor: '#334155', color: '#64748B' }}
                  >
                    {s.subject}
                    <span className="ml-1.5 opacity-60">{s.topic_count}</span>
                  </button>
                );
              })}
            </div>

            {/* Stats pills */}
            {stats && (
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full text-slate-400">
                  {stats.total} topics
                </span>
                <span className="text-xs bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full text-emerald-400">
                  {stats.mastered} mastered
                </span>
                {stats.gaps > 0 && (
                  <span className="text-xs bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-full text-red-400">
                    {stats.gaps} gaps
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 overflow-hidden relative">
          {graphLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900/60">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-400 text-sm">Building knowledge graph…</p>
              </div>
            </div>
          )}

          {!subject && !graphLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <span className="text-5xl">🕸</span>
                <p className="text-white font-bold text-lg">Select a subject above</p>
                <p className="text-slate-500 text-sm">Choose a board, grade, and subject to explore the knowledge graph</p>
              </div>
            </div>
          )}

          {subject && !graphLoading && (
            view === 'graph' ? (
              <div className="relative h-full flex flex-col">
                {/* Graph canvas */}
                <div className="flex-1 relative overflow-hidden">
                  <KnowledgeGraphSVG
                    graphData={graphData}
                    thetaMap={thetaMap}
                    gapSet={gapSet}
                    selectedId={selectedId}
                    onSelectNode={setSelectedId}
                    highlightPath={highlightPath}
                  />

                  {/* Side panel */}
                  {selectedId && (
                    <NodeSidePanel
                      nodeId={selectedId}
                      graphData={graphData}
                      thetaMap={thetaMap}
                      gapSet={gapSet}
                      onClose={() => setSelectedId(null)}
                      onSelectNode={setSelectedId}
                    />
                  )}
                </div>

                {/* Legend bar */}
                <GraphLegend showPath={showPath} onTogglePath={() => setShowPath(p => !p)} />
              </div>
            ) : (
              <ListView
                graphData={graphData}
                thetaMap={thetaMap}
                gapSet={gapSet}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
