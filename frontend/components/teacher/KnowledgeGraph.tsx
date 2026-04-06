"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeGraphData } from "@/lib/queries";

// Dynamic import with ssr: false since react-force-graph-3d requires browser APIs
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-slate-400">
      <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
      加载知识图谱...
    </div>
  ),
});

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
}

const courseColorMap: Record<string, string> = {
  math: "#6366F1",
  physics: "#10B981",
  chemistry: "#F59E0B",
  biology: "#EC4899",
  cs: "#8B5CF6",
  default: "#94A3B8",
};

export default function KnowledgeGraph({ data }: KnowledgeGraphProps) {
  const [search, setSearch] = useState("");
  const [is3D, setIs3D] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const filteredData = {
    nodes: data.nodes.map((n) => ({
      ...n,
      color: courseColorMap[n.course] || courseColorMap.default,
      val: n.val || 4,
    })),
    links: data.links.map((l) => ({
      ...l,
    })),
  };

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (!value.trim()) return;
      const node = data.nodes.find(
        (n) => n.name.toLowerCase().includes(value.toLowerCase()),
      );
      if (node && graphRef.current) {
        graphRef.current.zoomToFit(400);
      }
    },
    [data.nodes],
  );

  return (
    <div className="relative h-[300px] md:h-[600px] w-full overflow-hidden rounded-2xl bg-[#0F172A]">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 z-10 flex flex-wrap items-center gap-2 md:gap-3">
        <div className="relative flex-1 max-w-xs">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="搜索知识点..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-9 border-slate-600 bg-slate-800/80 pl-9 text-white placeholder:text-slate-500 backdrop-blur-sm"
          />
        </div>
        <div className="flex rounded-lg border border-slate-600 bg-slate-800/80 backdrop-blur-sm">
          <button
            onClick={() => setIs3D(false)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors rounded-l-lg",
              !is3D ? "bg-ink-primary text-white" : "text-slate-400 hover:text-white",
            )}
          >
            2D
          </button>
          <button
            onClick={() => setIs3D(true)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors rounded-r-lg",
              is3D ? "bg-ink-primary text-white" : "text-slate-400 hover:text-white",
            )}
          >
            3D
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => graphRef.current?.zoomToFit(400)}
          className="text-slate-400 hover:text-white hover:bg-slate-700"
        >
          <i className="ri-focus-3-line mr-1" />
          适配
        </Button>
      </div>

      {/* Graph */}
      <ForceGraph3D
        ref={graphRef}
        graphData={filteredData}
        backgroundColor="#0F172A"
        nodeLabel="name"
        nodeColor="color"
        nodeVal="val"
        linkColor={() => "rgba(148, 163, 184, 0.3)"}
        linkWidth={(link: Record<string, unknown>) =>
          (link as { type?: string }).type === "prerequisite" ? 1.5 : 0.5
        }
        enableNodeDrag={true}
        enableNavigationControls={true}
        numDimensions={is3D ? 3 : 2}
        width={typeof window !== "undefined" ? (window.innerWidth < 768 ? window.innerWidth - 32 : window.innerWidth - 280) : 1000}
        height={typeof window !== "undefined" && window.innerWidth < 768 ? 300 : 600}
      />

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 rounded-lg border border-slate-700 bg-slate-800/90 p-3 backdrop-blur-sm">
        <p className="mb-2 text-xs font-medium text-slate-300">图例</p>
        <div className="space-y-1.5">
          {Object.entries(courseColorMap)
            .filter(([k]) => k !== "default")
            .slice(0, 4)
            .map(([name, color]) => (
              <div key={name} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-slate-400 capitalize">
                  {name}
                </span>
              </div>
            ))}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-px w-4 bg-slate-400" />
              <span className="text-[10px] text-slate-400">前置关系</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-px w-4 border-t border-dashed border-slate-400" />
              <span className="text-[10px] text-slate-400">跨课程关联</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
