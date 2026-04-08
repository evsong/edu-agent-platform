"use client";

import { useState } from "react";

const DEMO_PLATFORMS = [
  {
    id: "chaoxing",
    name: "超星学习通",
    icon: "ri-book-2-line",
    color: "#2563EB",
    embedType: "popup",
    description: "弹窗模式 - 浮动按钮 + 聊天面板",
  },
  {
    id: "dingtalk",
    name: "钉钉工作台",
    icon: "ri-message-3-line",
    color: "#3370FF",
    embedType: "sidebar",
    description: "侧栏模式 - 右侧固定面板",
  },
] as const;

function MockChaoxingUI() {
  return (
    <div className="flex flex-col h-full">
      {/* Mock header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#2563EB] text-white">
        <i className="ri-arrow-left-line text-lg" />
        <span className="text-sm font-medium">高等数学 A</span>
        <span className="ml-auto text-xs opacity-70">超星学习通</span>
      </div>
      {/* Mock content */}
      <div className="flex-1 bg-[#F5F6FA] p-4 space-y-3 overflow-auto">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <i className="ri-video-line text-[#2563EB]" />
            <span className="text-sm font-medium text-gray-800">第三章 定积分</span>
          </div>
          <div className="bg-gray-100 rounded-lg h-28 flex items-center justify-center">
            <i className="ri-play-circle-line text-3xl text-gray-400" />
          </div>
          <p className="mt-2 text-xs text-gray-500">时长 45:20 | 已学习 62%</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <i className="ri-file-list-3-line text-[#2563EB]" />
            <span className="text-sm font-medium text-gray-800">课后作业</span>
          </div>
          <p className="text-xs text-gray-500">截止时间: 2026-04-14 23:59</p>
          <div className="mt-2 flex gap-2">
            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[11px] rounded-full">待完成</span>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[11px] rounded-full">5 道题</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <i className="ri-discuss-line text-[#2563EB]" />
            <span className="text-sm font-medium text-gray-800">讨论区</span>
          </div>
          <p className="text-xs text-gray-500">12 条新讨论</p>
        </div>
      </div>
    </div>
  );
}

function MockDingtalkUI() {
  return (
    <div className="flex flex-col h-full">
      {/* Mock header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <div className="w-8 h-8 bg-[#3370FF] rounded-lg flex items-center justify-center">
          <i className="ri-apps-line text-white text-sm" />
        </div>
        <div>
          <span className="text-sm font-medium text-gray-800">教务工作台</span>
          <p className="text-[10px] text-gray-400">钉钉</p>
        </div>
      </div>
      {/* Mock content */}
      <div className="flex-1 bg-[#F5F6FA] p-4 space-y-3 overflow-auto">
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: "ri-calendar-check-line", label: "考勤", color: "#10B981" },
            { icon: "ri-file-text-line", label: "成绩", color: "#F59E0B" },
            { icon: "ri-notification-3-line", label: "通知", color: "#EF4444" },
            { icon: "ri-user-settings-line", label: "管理", color: "#8B5CF6" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${item.color}15` }}
              >
                <i className={`${item.icon} text-lg`} style={{ color: item.color }} />
              </div>
              <span className="text-[11px] text-gray-600">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-800 mb-2">待办事项</p>
          {[
            "批改 3-2 班定积分作业",
            "审核张同学的请假申请",
            "准备周五答辩材料",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
              <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-600">{item}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-800 mb-2">班级动态</p>
          <p className="text-xs text-gray-500">3-2 班 28/35 人已提交作业</p>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div className="bg-[#3370FF] h-2 rounded-full" style={{ width: "80%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmbedDemoPage() {
  const [activeTab, setActiveTab] = useState<"split" | "chaoxing" | "dingtalk">("split");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-primary text-white">
              <i className="ri-brain-line text-lg" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                EduAgent 平台嵌入演示
              </h1>
              <p className="text-xs text-gray-500">
                展示 AI 智能助教如何无缝嵌入主流教育平台
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-4">
            {[
              { id: "split" as const, label: "双栏对比", icon: "ri-layout-column-line" },
              { id: "chaoxing" as const, label: "超星学习通", icon: "ri-book-2-line" },
              { id: "dingtalk" as const, label: "钉钉工作台", icon: "ri-message-3-line" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-ink-primary text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <i className={tab.icon} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Demo content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === "split" && (
          <div className="grid grid-cols-2 gap-6">
            {/* Chaoxing popup demo */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-xs text-gray-500 ml-2">超星学习通 - 弹窗模式 (popup)</span>
                <span className="ml-auto px-2 py-0.5 bg-ink-primary-lighter text-ink-primary text-[10px] rounded-full font-medium">
                  iframe 嵌入
                </span>
              </div>
              <div className="relative">
                <div className="h-[600px] overflow-hidden">
                  <MockChaoxingUI />
                </div>
                {/* Overlay the actual popup iframe */}
                <iframe
                  src="/embed/popup?course_id=math-101"
                  className="absolute inset-0 w-full h-full"
                  style={{ background: "transparent" }}
                  title="EduAgent Popup Demo"
                />
              </div>
            </div>

            {/* Dingtalk sidebar demo */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-xs text-gray-500 ml-2">钉钉工作台 - 侧栏模式 (sidebar)</span>
                <span className="ml-auto px-2 py-0.5 bg-ink-primary-lighter text-ink-primary text-[10px] rounded-full font-medium">
                  iframe 嵌入
                </span>
              </div>
              <iframe
                src="/embed/sidebar?course_id=math-101"
                className="w-full h-[600px] border-0"
                title="EduAgent Sidebar Demo"
              />
            </div>
          </div>
        )}

        {activeTab === "chaoxing" && (
          <div className="max-w-lg mx-auto rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-500 ml-2">超星学习通 | 高等数学 A</span>
            </div>
            <div className="relative h-[700px]">
              <MockChaoxingUI />
              <iframe
                src="/embed/popup?course_id=math-101"
                className="absolute inset-0 w-full h-full"
                style={{ background: "transparent" }}
                title="EduAgent Popup Demo Full"
              />
            </div>
          </div>
        )}

        {activeTab === "dingtalk" && (
          <div className="max-w-3xl mx-auto rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-500 ml-2">钉钉工作台 | 教务系统</span>
            </div>
            <div className="flex h-[700px]">
              {/* Mock left content */}
              <div className="flex-1">
                <MockDingtalkUI />
              </div>
              {/* Sidebar iframe */}
              <iframe
                src="/embed/sidebar?course_id=math-101"
                className="w-[380px] h-full border-0 border-l border-gray-200"
                title="EduAgent Sidebar Demo Full"
              />
            </div>
          </div>
        )}

        {/* Integration info */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            {
              icon: "ri-code-s-slash-line",
              title: "一行代码嵌入",
              desc: "通过 iframe 或 LTI 1.3 协议，一行代码即可将 AI 助教嵌入任何教育平台",
            },
            {
              icon: "ri-shield-check-line",
              title: "安全认证",
              desc: "支持 JWT Token 和 LTI 1.3 标准认证，确保用户身份和数据安全",
            },
            {
              icon: "ri-settings-4-line",
              title: "课程自适应",
              desc: "通过 course_id 参数自动加载课程知识库，提供精准的课程相关答疑",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-primary-lighter text-ink-primary mb-3">
                <i className={`${item.icon} text-lg`} />
              </div>
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
