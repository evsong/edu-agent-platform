/**
 * TanStack React Query functions for teacher dashboard data fetching.
 */
import { apiFetch } from "@/lib/api";

/* ── Types ── */

export interface StatOverview {
  active_students: number;
  active_students_trend: number[];
  qa_accuracy: number;
  qa_accuracy_delta: number;
  warning_count: number;
  warning_avatars: string[];
  ai_interactions: number;
  ai_breakdown: string;
}

export interface KnowledgeMastery {
  name: string;
  mastery: number;
  level: "high" | "medium" | "low";
}

export interface WarningStudent {
  id: string;
  name: string;
  avatar: string;
  weak_points: { name: string; mastery: number }[];
  risk_level: "high" | "medium" | "low";
}

export interface GraphNode {
  id: string;
  name: string;
  course: string;
  color?: string;
  val?: number;
  difficulty?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "prerequisite" | "cross-course";
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Submission {
  id: string;
  student_name: string;
  student_avatar: string;
  assignment_title: string;
  submitted_at: string;
  status: "pending" | "ai_graded" | "teacher_graded";
  score?: number;
}

export interface Annotation {
  id: string;
  line_start: number;
  line_end: number;
  severity: "error" | "warning" | "info";
  comment: string;
  correction: string;
  knowledge_point: string;
}

export interface GradingDetail {
  id: string;
  student_name: string;
  assignment_title: string;
  content: string;
  score: number;
  annotations: Annotation[];
}

export interface Course {
  id: string;
  name: string;
  description: string;
  student_count: number;
  updated_at: string;
  icon?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  course_id: string;
  course_name: string;
  status: "running" | "configuring" | "stopped";
  model: string;
  temperature: number;
  knowledge_base: string;
  grading_rules: string;
  icon: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  size: number;
  uploaded_at: string;
  status: "indexed" | "processing" | "failed";
}

export interface AnalyticsData {
  mastery_distribution: { range: string; count: number }[];
  top_errors: { point: string; error_count: number; avg_mastery: number }[];
}

/* ── Query Functions ── */

export function fetchStatOverview() {
  return apiFetch<StatOverview>("/api/analytics/overview");
}

export function fetchKnowledgeMastery(courseId: string) {
  return apiFetch<KnowledgeMastery[]>(
    `/api/analytics/mastery/${courseId}`,
  );
}

export async function fetchWarnings(courseId: string) {
  const res = await apiFetch<{ course_id: string; warnings: WarningStudent[] }>(
    `/api/analytics/warnings/${courseId}?threshold=0.3`,
  );
  return res.warnings;
}

export async function fetchKnowledgeGraph(courseId: string, documentId?: string) {
  const url = documentId
    ? `/api/knowledge/graph/${courseId}?document_id=${encodeURIComponent(documentId)}`
    : `/api/knowledge/graph/${courseId}`;
  const res = await apiFetch<{ nodes: any[]; edges: any[] }>(url);
  return {
    nodes: res.nodes.map((n: any) => ({
      ...n,
      course: n.course_id || n.group,
      val: n.difficulty || 1,
    })),
    links: (res.edges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
      type: e.type === "CROSS_COURSE" ? "cross-course" : "prerequisite",
    })),
  } as KnowledgeGraphData;
}

export function fetchSubmissions(assignmentId?: string) {
  const id = assignmentId || "00000000-0000-4000-c000-000000000001";
  return apiFetch<Submission[]>(
    `/api/assignments/${id}/submissions`,
  );
}

export async function fetchGradingDetail(submissionId: string): Promise<GradingDetail> {
  const res = await apiFetch<{
    submission_id: string;
    student_name: string;
    assignment_title: string;
    content: string;
    score: number;
    status: string;
    annotations: any;
  }>(`/api/grading/result/${submissionId}`);

  // Extract annotations array from the JSONB field
  let rawAnnotations: any[] = [];
  if (res.annotations) {
    if (Array.isArray(res.annotations)) {
      rawAnnotations = res.annotations;
    } else if (res.annotations.annotations && Array.isArray(res.annotations.annotations)) {
      rawAnnotations = res.annotations.annotations;
    } else if (res.annotations.feedback) {
      // Seed data format: {auto_graded: true, feedback: "..."}
      rawAnnotations = [{
        paragraph_id: "P1",
        severity: "info",
        comment: res.annotations.feedback,
        correction: "",
        knowledge_point: "",
      }];
    }
  }

  return {
    id: submissionId,
    student_name: res.student_name || "",
    assignment_title: res.assignment_title || "",
    content: res.content || "",
    score: res.score || 0,
    annotations: rawAnnotations.map((a: any, i: number) => ({
      id: `ann-${i}`,
      line_start: parseInt(a.paragraph_id?.replace("P", "") || "1"),
      line_end: parseInt(a.paragraph_id?.replace("P", "") || "1"),
      severity: a.severity || a.type || "info",
      comment: a.comment || "",
      correction: a.correction || "",
      knowledge_point: a.knowledge_point || "",
    })),
  };
}

export function fetchCourses() {
  return apiFetch<Course[]>("/api/courses");
}

export function fetchCourse(id: string) {
  return apiFetch<Course>(`/api/courses/${id}`);
}

export function fetchAgents() {
  return apiFetch<AgentConfig[]>("/api/agents");
}

export function fetchKnowledgeDocs(courseId: string) {
  return apiFetch<KnowledgeDocument[]>(
    `/api/knowledge/docs/${courseId}`,
  ).catch(() => []);
}

export async function fetchCourseAnalytics(courseId: string) {
  const res = await apiFetch<{
    top_errors: any[];
    teaching_suggestions: string;
    total_interactions: number;
  }>(`/api/analytics/report/${courseId}`);
  return {
    mastery_distribution: [],
    top_errors: (res.top_errors || []).map((e: any) => ({
      point: e.knowledge_point || e.name || "Unknown",
      error_count: e.count || 0,
      avg_mastery: e.avg_mastery || 0,
    })),
  } as AnalyticsData;
}

export function submitAIGrading(ids: string[]) {
  return Promise.all(
    ids.map((id) =>
      apiFetch("/api/grading/submit", {
        method: "POST",
        body: JSON.stringify({ submission_id: id }),
      }),
    ),
  );
}

export function rebuildIndex(courseId: string) {
  return apiFetch<{ status: string }>(
    `/api/knowledge/rebuild/${courseId}`,
    { method: "POST" },
  ).catch(() => ({ status: "ok" }));
}
