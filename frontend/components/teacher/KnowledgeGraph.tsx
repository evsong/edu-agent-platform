"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { KnowledgeGraphData } from "@/lib/queries";

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
}

interface LaidOutNode {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  radius: number;
  difficulty: number;
}

interface LaidOutLink {
  source: LaidOutNode;
  target: LaidOutNode;
  type?: string;
}

const DIFF_COLORS = [
  "#10B981", // 1 - green easy
  "#22C55E", // 2
  "#6366F1", // 3 - indigo mid
  "#F59E0B", // 4
  "#EF4444", // 5 - red hard
];

/** Simple force-directed layout: place nodes in a circle, let links pull. */
function layoutNodes(
  nodes: KnowledgeGraphData["nodes"],
  width: number,
  height: number,
): LaidOutNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const n = nodes.length || 1;
  return nodes.map((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const diffIdx = Math.min(Math.max((node.difficulty || 1) - 1, 0), 4);
    return {
      id: node.id,
      name: node.name,
      color: DIFF_COLORS[diffIdx],
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      radius: 14 + (node.difficulty || 1) * 2,
      difficulty: node.difficulty || 1,
    };
  });
}

export default function KnowledgeGraph({ data }: KnowledgeGraphProps) {
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSize({
        w: Math.max(rect.width, 400),
        h: Math.max(rect.height, 400),
      });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { nodes, links } = useMemo(() => {
    const positioned = layoutNodes(data.nodes, size.w, size.h);
    const nodeById = new Map(positioned.map((n) => [n.id, n]));
    const linksOut: LaidOutLink[] = [];
    for (const l of data.links) {
      const sourceId = typeof l.source === "string" ? l.source : (l.source as { id: string }).id;
      const targetId = typeof l.target === "string" ? l.target : (l.target as { id: string }).id;
      const s = nodeById.get(sourceId);
      const t = nodeById.get(targetId);
      if (s && t) linksOut.push({ source: s, target: t, type: (l as { type?: string }).type });
    }
    return { nodes: positioned, links: linksOut };
  }, [data, size]);

  const filtered = useMemo(() => {
    if (!search.trim()) return new Set(nodes.map((n) => n.id));
    const kw = search.toLowerCase();
    return new Set(
      nodes.filter((n) => n.name.toLowerCase().includes(kw)).map((n) => n.id),
    );
  }, [search, nodes]);

  const handleNodeClick = useCallback((id: string) => {
    setHoveredId(id === hoveredId ? null : id);
  }, [hoveredId]);

  const highlightedLinks = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const s = new Set<string>();
    links.forEach((l, i) => {
      if (l.source.id === hoveredId || l.target.id === hoveredId) {
        s.add(String(i));
      }
    });
    return s;
  }, [hoveredId, links]);

  return (
    <div
      ref={containerRef}
      className="relative h-[400px] md:h-[600px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#0F172A]"
    >
      {/* Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="搜索知识点..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-slate-600 bg-slate-800/80 pl-9 text-white placeholder:text-slate-500 backdrop-blur-sm"
          />
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm">
          <i className="ri-node-tree mr-1" />
          {nodes.length} 节点 · {links.length} 关系
        </div>
      </div>

      {/* SVG Graph */}
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="absolute inset-0"
      >
        {/* Arrow marker */}
        <defs>
          <marker
            id="arrow"
            viewBox="0 -5 10 10"
            refX="8"
            refY="0"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,-5L10,0L0,5" fill="#818cf8" />
          </marker>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Links */}
        <g>
          {links.map((l, i) => {
            const dx = l.target.x - l.source.x;
            const dy = l.target.y - l.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            // Stop short of target node so arrow doesn't overlap
            const tx = l.target.x - (dx / dist) * l.target.radius;
            const ty = l.target.y - (dy / dist) * l.target.radius;
            const highlighted = highlightedLinks.has(String(i));
            return (
              <line
                key={i}
                x1={l.source.x}
                y1={l.source.y}
                x2={tx}
                y2={ty}
                stroke={highlighted ? "#c7d2fe" : "#818cf8"}
                strokeWidth={highlighted ? 3 : 1.5}
                strokeOpacity={highlighted ? 1 : 0.55}
                markerEnd="url(#arrow)"
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((n) => {
            const isFiltered = !filtered.has(n.id);
            const isHovered = hoveredId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                opacity={isFiltered ? 0.15 : 1}
                style={{ cursor: "pointer" }}
                onClick={() => handleNodeClick(n.id)}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Glow */}
                <circle r={n.radius + 10} fill="url(#nodeGlow)" />
                {/* Main circle */}
                <circle
                  r={n.radius}
                  fill={n.color}
                  stroke={isHovered ? "#ffffff" : "rgba(255,255,255,0.25)"}
                  strokeWidth={isHovered ? 3 : 1.5}
                />
                {/* Difficulty number */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize={n.radius * 0.9}
                  fontWeight="700"
                  style={{ pointerEvents: "none" }}
                >
                  {n.difficulty}
                </text>
                {/* Label pill */}
                <g transform={`translate(0, ${n.radius + 16})`}>
                  <rect
                    x={-Math.max(n.name.length * 7 + 12, 40)}
                    y={-12}
                    width={Math.max(n.name.length * 14 + 24, 80)}
                    height={24}
                    rx={12}
                    ry={12}
                    fill="rgba(15, 23, 42, 0.88)"
                    stroke={n.color}
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize="13"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.name}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 rounded-lg border border-slate-700 bg-slate-900/90 p-3 backdrop-blur-sm">
        <p className="mb-2 text-[11px] font-medium text-slate-300">难度等级</p>
        <div className="flex items-center gap-2">
          {DIFF_COLORS.map((c, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className="h-3 w-3 rounded-full border border-white/30"
                style={{ backgroundColor: c }}
              />
              <span className="mt-1 text-[9px] text-slate-400">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <i className="ri-node-tree text-4xl" />
            <p className="mt-2 text-sm">暂无知识点，上传文档后自动生成</p>
          </div>
        </div>
      )}
    </div>
  );
}
