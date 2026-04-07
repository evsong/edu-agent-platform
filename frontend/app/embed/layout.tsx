"use client";

import { CopilotKit } from "@copilotkit/react-core";
import type { CopilotKitCSSProperties } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

const themeStyle: CopilotKitCSSProperties = {
  "--copilot-kit-primary-color": "#4338CA",
  "--copilot-kit-contrast-color": "#FFFFFF",
  "--copilot-kit-background-color": "#FFFFFF",
  "--copilot-kit-input-background-color": "#FAFAFA",
  "--copilot-kit-secondary-color": "#F3F4F6",
  "--copilot-kit-secondary-contrast-color": "#1F2937",
  "--copilot-kit-separator-color": "#F3F4F6",
  "--copilot-kit-muted-color": "#9CA3AF",
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <div className="min-h-screen bg-white" style={themeStyle}>
        {children}
      </div>
    </CopilotKit>
  );
}
