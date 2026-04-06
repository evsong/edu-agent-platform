"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import KnowledgeGraph from "@/components/teacher/KnowledgeGraph";
import {
  fetchKnowledgeDocs,
  fetchKnowledgeGraph,
  rebuildIndex,
} from "@/lib/queries";
import type { KnowledgeDocument, KnowledgeGraphData } from "@/lib/queries";
import { cn } from "@/lib/utils";

const mockDocs: KnowledgeDocument[] = [
  {
    id: "1",
    filename: "高等数学_第三版_上册.pdf",
    size: 12_400_000,
    uploaded_at: "2026-03-28T10:00:00Z",
    status: "indexed",
  },
  {
    id: "2",
    filename: "微积分习题精解.docx",
    size: 3_200_000,
    uploaded_at: "2026-04-01T14:30:00Z",
    status: "indexed",
  },
  {
    id: "3",
    filename: "线性代数补充材料.pdf",
    size: 8_700_000,
    uploaded_at: "2026-04-03T09:15:00Z",
    status: "processing",
  },
];

const mockGraph: KnowledgeGraphData = {
  nodes: [
    { id: "1", name: "极限", course: "math", val: 5 },
    { id: "2", name: "连续性", course: "math", val: 4 },
    { id: "3", name: "导数", course: "math", val: 6 },
    { id: "4", name: "微分", course: "math", val: 4 },
    { id: "5", name: "积分", course: "math", val: 6 },
    { id: "6", name: "级数", course: "math", val: 3 },
    { id: "7", name: "多元函数", course: "math", val: 5 },
    { id: "8", name: "运动学", course: "physics", val: 4 },
    { id: "9", name: "力学", course: "physics", val: 5 },
    { id: "10", name: "向量空间", course: "math", val: 4 },
  ],
  links: [
    { source: "1", target: "2", type: "prerequisite" },
    { source: "2", target: "3", type: "prerequisite" },
    { source: "3", target: "4", type: "prerequisite" },
    { source: "3", target: "5", type: "prerequisite" },
    { source: "5", target: "6", type: "prerequisite" },
    { source: "5", target: "7", type: "prerequisite" },
    { source: "3", target: "8", type: "cross-course" },
    { source: "5", target: "9", type: "cross-course" },
    { source: "7", target: "10", type: "prerequisite" },
  ],
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusConfig = {
  indexed: { label: "已索引", cls: "bg-ink-success-light text-ink-success" },
  processing: { label: "处理中", cls: "bg-ink-warning-light text-ink-warning" },
  failed: { label: "失败", cls: "bg-ink-error-light text-ink-error" },
};

export default function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [isDragActive, setIsDragActive] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["knowledge-docs", id],
    queryFn: () => fetchKnowledgeDocs(id),
    placeholderData: mockDocs,
  });

  const { data: graphData } = useQuery({
    queryKey: ["knowledge-graph", id],
    queryFn: () => fetchKnowledgeGraph(id),
    placeholderData: mockGraph,
  });

  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    try {
      await rebuildIndex(id);
    } catch {
      // Demo mode - ignore errors
    } finally {
      setTimeout(() => setRebuilding(false), 2000);
    }
  }, [id]);

  const docList = docs ?? mockDocs;
  const graph = graphData ?? mockGraph;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-ink-text-muted">
        <Link href="/courses" className="hover:text-ink-primary transition-colors">
          课程管理
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <Link
          href={`/courses/${id}`}
          className="hover:text-ink-primary transition-colors"
        >
          课程详情
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <span className="text-ink-text font-medium">知识库</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-ink-text">
            知识库管理
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            上传课程资料并管理知识图谱
          </p>
        </div>
        <Button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="bg-ink-primary hover:bg-ink-primary-dark text-white"
        >
          {rebuilding ? (
            <>
              <i className="ri-loader-4-line animate-spin mr-2" />
              重建中...
            </>
          ) : (
            <>
              <i className="ri-refresh-line mr-2" />
              重建索引
            </>
          )}
        </Button>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragEnter={() => setIsDragActive(true)}
        onDragLeave={() => setIsDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => setIsDragActive(false)}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragActive
            ? "border-ink-primary bg-ink-primary-lighter"
            : "border-ink-border bg-ink-surface hover:border-ink-primary/30",
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-primary-lighter">
            <i className="ri-upload-cloud-2-line text-2xl text-ink-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-text">
              拖拽文件到此处或{" "}
              <button className="text-ink-primary hover:underline">
                浏览上传
              </button>
            </p>
            <p className="mt-1 text-xs text-ink-text-light">
              支持 PDF, DOCX, TXT, MD 格式，单文件最大 50MB
            </p>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="rounded-xl border border-ink-border bg-white overflow-hidden">
        <div className="border-b border-ink-border bg-ink-surface px-4 py-3">
          <h3 className="text-sm font-heading font-semibold text-ink-text">
            已上传文档 ({docList.length})
          </h3>
        </div>
        <div className="divide-y divide-ink-border">
          {docList.map((doc) => {
            const status = statusConfig[doc.status];
            return (
              <div
                key={doc.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-ink-surface/50 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-primary-lighter">
                  <i
                    className={cn(
                      "text-ink-primary",
                      doc.filename.endsWith(".pdf")
                        ? "ri-file-pdf-2-line"
                        : "ri-file-word-line",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-text truncate">
                    {doc.filename}
                  </p>
                  <p className="text-xs text-ink-text-light">
                    {formatSize(doc.size)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    status.cls,
                  )}
                >
                  {status.label}
                </span>
                <button className="shrink-0 text-ink-text-light hover:text-ink-error transition-colors">
                  <i className="ri-delete-bin-6-line" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Knowledge Graph */}
      <div>
        <h2 className="mb-3 text-lg font-heading font-semibold text-ink-text">
          知识图谱
        </h2>
        <KnowledgeGraph data={graph} />
      </div>
    </motion.div>
  );
}
