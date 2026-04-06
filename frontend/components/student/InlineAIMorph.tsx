"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InlineAIMorphProps {
  onAction: (action: string, text: string) => void;
}

export default function InlineAIMorph({ onAction }: InlineAIMorphProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectedText(text);
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    setVisible(true);
  }, []);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        setVisible(false);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleMouseUp, handleClickOutside]);

  const actions = [
    { key: "hint", icon: "ri-lightbulb-line", label: "提示我" },
    { key: "steps", icon: "ri-list-ordered-2", label: "拆解步骤" },
    { key: "similar", icon: "ri-file-copy-line", label: "类似题" },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={toolbarRef}
          initial={{ opacity: 0, scale: 0.8, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="fixed z-50 flex items-center gap-1 rounded-lg border border-ink-border bg-white p-1 shadow-lg shadow-black/10"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              onClick={() => {
                onAction(action.key, selectedText);
                setVisible(false);
                window.getSelection()?.removeAllRanges();
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-text-muted transition-colors hover:bg-ink-primary-lighter hover:text-ink-primary"
            >
              <i className={action.icon} />
              {action.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
