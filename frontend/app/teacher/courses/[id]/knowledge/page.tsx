"use client";

import { use, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import KnowledgeGraph from "@/components/teacher/KnowledgeGraph";
import {
  fetchKnowledgeDocs,
  fetchKnowledgeGraph,
  rebuildIndex,
} from "@/lib/queries";
import type { KnowledgeDocument, KnowledgeGraphData } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface UploadTask {
  id: string;
  filename: string;
  status: "uploading" | "queued" | "extracting" | "indexing" | "completed" | "error";
  progress?: string; // "3/5" chunks uploaded, or status detail
  uploadPct?: number; // 0-100 for chunk upload progress
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
const CHUNK_THRESHOLD = 10 * 1024 * 1024; // files > 10MB use chunked upload

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
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: docs } = useQuery({
    queryKey: ["knowledge-docs", id],
    queryFn: () => fetchKnowledgeDocs(id),
  });

  const { data: graphData } = useQuery({
    queryKey: ["knowledge-graph", id],
    queryFn: () => fetchKnowledgeGraph(id),
  });

  const pollTask = useCallback((taskId: string, localId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/knowledge/upload-status/${taskId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) throw new Error("status fetch failed");
        const status = await res.json() as { status: string; message?: string };
        setUploads(prev => prev.map(u => u.id === localId ? {
          ...u,
          status: status.status as UploadTask["status"],
          progress: status.message,
        } : u));
        if (status.status === "completed" || status.status === "error") {
          clearInterval(interval);
          queryClient.invalidateQueries({ queryKey: ["knowledge-docs"] });
        }
      } catch {
        clearInterval(interval);
        setUploads(prev => prev.map(u => u.id === localId ? { ...u, status: "error" } : u));
      }
    }, 3000);
  }, [queryClient]);

  const uploadChunked = useCallback(async (file: File, localId: string): Promise<string | null> => {
    const token = localStorage.getItem("token");
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init session
    const initForm = new FormData();
    initForm.append("course_id", id);
    initForm.append("filename", file.name);
    initForm.append("total_chunks", String(totalChunks));
    initForm.append("file_size", String(file.size));
    const initRes = await fetch("/api/knowledge/upload/init", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: initForm,
    });
    if (!initRes.ok) throw new Error("init failed");
    const { upload_id } = await initRes.json() as { upload_id: string };

    // 2. Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);
      const chunkForm = new FormData();
      chunkForm.append("chunk_index", String(i));
      chunkForm.append("chunk", chunkBlob, `chunk_${i}`);
      const chunkRes = await fetch(`/api/knowledge/upload/chunk/${upload_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: chunkForm,
      });
      if (!chunkRes.ok) throw new Error(`chunk ${i} failed`);
      const uploadPct = Math.round(((i + 1) / totalChunks) * 100);
      setUploads(prev => prev.map(u => u.id === localId ? {
        ...u,
        uploadPct,
        progress: `${i + 1}/${totalChunks} 块`,
      } : u));
    }

    // 3. Complete
    const completeRes = await fetch(`/api/knowledge/upload/complete/${upload_id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!completeRes.ok) throw new Error("complete failed");
    const { task_id } = await completeRes.json() as { task_id: string };
    return task_id;
  }, [id]);

  const uploadSimple = useCallback(async (file: File, localId: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append("course_id", id);
    formData.append("file", file);
    const res = await fetch("/api/knowledge/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: formData,
    });
    if (!res.ok) throw new Error("upload failed");
    setUploads(prev => prev.map(u => u.id === localId ? { ...u, uploadPct: 100 } : u));
    const { task_id } = await res.json() as { task_id: string };
    return task_id;
  }, [id]);

  const handleFiles = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const localId = crypto.randomUUID();
      setUploads(prev => [...prev, { id: localId, filename: file.name, status: "uploading", uploadPct: 0 }]);

      try {
        const taskId = file.size > CHUNK_THRESHOLD
          ? await uploadChunked(file, localId)
          : await uploadSimple(file, localId);
        if (taskId) {
          setUploads(prev => prev.map(u => u.id === localId ? { ...u, status: "queued" } : u));
          pollTask(taskId, localId);
        }
      } catch (err) {
        console.error("upload failed", err);
        setUploads(prev => prev.map(u => u.id === localId ? { ...u, status: "error" } : u));
      }
    }
  }, [uploadChunked, uploadSimple, pollTask]);

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

  const docList = docs ?? [];
  const graph = graphData ?? { nodes: [], links: [] };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-ink-text-muted">
        <Link href="/teacher/courses" className="hover:text-ink-primary transition-colors">
          课程管理
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <Link
          href={`/teacher/courses/${id}`}
          className="hover:text-ink-primary transition-colors"
        >
          课程详情
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <span className="text-ink-text font-medium">知识库</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
            知识库管理
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            上传课程资料并管理知识图谱
          </p>
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-ink-primary hover:bg-ink-primary-dark text-white disabled:opacity-50 transition-colors"
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
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.xlsx,.xls,.html,.htm,.csv,.json,.xml,.rtf,.epub"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ""; } }}
      />

      {/* Upload Dropzone */}
      <div
        onDragEnter={() => setIsDragActive(true)}
        onDragLeave={() => setIsDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); setIsDragActive(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
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
              <button
                type="button"
                className="text-ink-primary hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                浏览上传
              </button>
            </p>
            <p className="mt-1 text-xs text-ink-text-light">
              支持 PDF, DOCX, PPTX, XLSX, CSV, HTML, EPUB 等格式，单文件最大 500MB（大文件自动分片上传）
            </p>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(u => {
            const statusLabel =
              u.status === "uploading" ? `上传中 ${u.uploadPct ?? 0}%${u.progress ? ` · ${u.progress}` : ""}` :
              u.status === "queued" ? "已入队，等待处理" :
              u.status === "extracting" ? "提取文本中..." :
              u.status === "indexing" ? "建立索引中..." :
              u.status === "completed" ? "导入完成" : "导入失败";
            const icon =
              u.status === "completed" ? "ri-checkbox-circle-fill text-ink-success" :
              u.status === "error" ? "ri-error-warning-fill text-ink-error" :
              "ri-loader-4-line animate-spin text-ink-primary";
            const showBar = u.status === "uploading" && u.uploadPct !== undefined;
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-ink-border bg-white p-3">
                <i className={icon} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-text truncate">{u.filename}</p>
                  <p className="text-xs text-ink-text-muted">{statusLabel}</p>
                  {showBar && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-ink-surface overflow-hidden">
                      <div className="h-full bg-ink-primary rounded-full transition-all"
                           style={{ width: `${u.uploadPct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
