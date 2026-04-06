(function () {
  "use strict";

  // Embed URL — the (embed) route group popup page at /popup
  var EMBED_URL = "https://eduagent.inspiredjinyao.com/popup";

  // Prevent double injection
  if (document.getElementById("eduagent-host")) return;

  // Create shadow host for style isolation
  var host = document.createElement("div");
  host.id = "eduagent-host";
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: "closed" });

  // Brain SVG icon
  var brainIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.43-.56 2"/>' +
    '<path d="M12 2a4 4 0 0 0-4 4c0 .74.2 1.43.56 2"/>' +
    '<path d="M15.44 8A4 4 0 0 1 20 12c0 1.5-.83 2.8-2.06 3.47"/>' +
    '<path d="M8.56 8A4 4 0 0 0 4 12c0 1.5.83 2.8 2.06 3.47"/>' +
    '<path d="M17.94 15.47A4 4 0 0 1 16 22"/>' +
    '<path d="M6.06 15.47A4 4 0 0 0 8 22"/>' +
    '<path d="M12 2v6"/>' +
    '<path d="M12 14v4"/>' +
    "</svg>";

  var closeIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="18" y1="6" x2="6" y2="18"/>' +
    '<line x1="6" y1="6" x2="18" y2="18"/>' +
    "</svg>";

  // Inject styles into shadow DOM
  var style = document.createElement("style");
  style.textContent = [
    ".eduagent-btn {",
    "  position: fixed; bottom: 20px; right: 20px; z-index: 999999;",
    "  width: 52px; height: 52px; border-radius: 50%;",
    "  background: #4338CA; color: white; border: none; cursor: pointer;",
    "  box-shadow: 0 4px 16px rgba(67,56,202,0.3);",
    "  font-size: 24px; display: flex; align-items: center; justify-content: center;",
    "  transition: transform 0.2s, box-shadow 0.2s;",
    "  padding: 0;",
    "}",
    ".eduagent-btn:hover {",
    "  transform: scale(1.1);",
    "  box-shadow: 0 6px 24px rgba(67,56,202,0.4);",
    "}",
    ".eduagent-btn:active { transform: scale(0.95); }",
    ".eduagent-frame {",
    "  position: fixed; bottom: 80px; right: 20px; z-index: 999998;",
    "  width: 380px; height: 520px; border: none; border-radius: 12px;",
    "  box-shadow: 0 8px 30px rgba(0,0,0,0.15);",
    "  background: #fff;",
    "  display: none;",
    "  overflow: hidden;",
    "}",
    ".eduagent-frame.open { display: block; }",
    "@media (max-width: 480px) {",
    "  .eduagent-frame {",
    "    width: calc(100vw - 24px);",
    "    height: calc(100vh - 120px);",
    "    right: 12px;",
    "    bottom: 76px;",
    "    border-radius: 16px;",
    "  }",
    "  .eduagent-btn {",
    "    bottom: 16px;",
    "    right: 16px;",
    "    width: 48px;",
    "    height: 48px;",
    "  }",
    "}",
  ].join("\n");
  shadow.appendChild(style);

  // Create floating button
  var btn = document.createElement("button");
  btn.className = "eduagent-btn";
  btn.innerHTML = brainIcon;
  btn.title = "EduAgent AI 助教";
  shadow.appendChild(btn);

  // Create iframe
  var iframe = document.createElement("iframe");
  iframe.className = "eduagent-frame";
  iframe.src = EMBED_URL;
  iframe.setAttribute("allow", "clipboard-write");
  shadow.appendChild(iframe);

  // Toggle state
  var isOpen = false;
  btn.addEventListener("click", function () {
    isOpen = !isOpen;
    iframe.classList.toggle("open", isOpen);
    btn.innerHTML = isOpen ? closeIcon : brainIcon;
    btn.title = isOpen ? "关闭 AI 助教" : "EduAgent AI 助教";
  });

  // Close on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
      iframe.classList.remove("open");
      btn.innerHTML = brainIcon;
      btn.title = "EduAgent AI 助教";
    }
  });
})();
