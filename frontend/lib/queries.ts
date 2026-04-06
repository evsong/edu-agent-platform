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

export function fetchStatOverview(courseId?: string) {
  const qs = courseId ? `?course_id=${courseId}` : "";
  return apiFetch<StatOverview>(`/api/analytics/overview${qs}`);
}

export function fetchKnowledgeMastery(courseId: string) {
  return apiFetch<KnowledgeMastery[]>(
    `/api/analytics/report/${courseId}`,
  );
}

export function fetchWarnings(courseId: string) {
  return apiFetch<WarningStudent[]>(
    `/api/analytics/warnings/${courseId}`,
  );
}

export function fetchKnowledgeGraph(courseId: string) {
  return apiFetch<KnowledgeGraphData>(
    `/api/knowledge/graph/${courseId}`,
  );
}

export function fetchSubmissions(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<Submission[]>(`/api/grading/submissions${qs}`);
}

export function fetchGradingDetail(submissionId: string) {
  return apiFetch<GradingDetail>(
    `/api/grading/annotations/${submissionId}`,
  );
}

export function fetchCourses() {
  return apiFetch<Course[]>("/api/courses/");
}

export function fetchCourse(id: string) {
  return apiFetch<Course>(`/api/courses/${id}`);
}

export function fetchAgents() {
  return apiFetch<AgentConfig[]>("/api/agents/");
}

export function fetchKnowledgeDocs(courseId: string) {
  return apiFetch<KnowledgeDocument[]>(
    `/api/knowledge/documents/${courseId}`,
  );
}

export function fetchCourseAnalytics(courseId: string) {
  return apiFetch<AnalyticsData>(
    `/api/analytics/course/${courseId}`,
  );
}

export function submitAIGrading(submissionIds: string[]) {
  return apiFetch<{ status: string }>("/api/grading/submit", {
    method: "POST",
    body: JSON.stringify({ submission_ids: submissionIds }),
  });
}

export function rebuildIndex(courseId: string) {
  return apiFetch<{ status: string }>(
    `/api/knowledge/rebuild/${courseId}`,
    { method: "POST" },
  );
}
