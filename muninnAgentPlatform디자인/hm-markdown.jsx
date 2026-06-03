// ===================================================================
// Lightweight Markdown renderer + editor modal for Huginn document
// surfaces (SOUL.md, Memory facts, etc.).
// Supported syntax: # ## ### / **bold** / *italic* / `code` / ```fence```
// / - bullet / 1. ordered / > blockquote / [text](url) / --- hr / paragraphs.
// ===================================================================

const { useState: useS_MD, useEffect: useE_MD, useRef: useR_MD } = React;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdToHtml(src) {
  if (!src) return "";
  // 1) Pull fenced code blocks out first so inline rules don't mangle them.
  const fences = [];
  let s = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push({ lang, code });
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });
  s = escapeHtml(s);

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr class="md-hr"/>');

  // Blockquote (consecutive `> ` lines collapse)
  s = s.replace(/(?:^&gt; .*(?:\n|$))+/gm, m => {
    const inner = m.trim().split("\n").map(l => l.replace(/^&gt; ?/, "")).join("<br/>");
    return `<blockquote class="md-bq">${inner}</blockquote>\n`;
  });

  // Bullet lists
  s = s.replace(/(?:^- .*(?:\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul class="md-ul">${items}</ul>\n`;
  });
  // Ordered lists
  s = s.replace(/(?:^\d+\. .*(?:\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("");
    return `<ol class="md-ol">${items}</ol>\n`;
  });

  // Inline: links, bold, italic, code
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  // Paragraphs
  s = s.split(/\n{2,}/).map(block => {
    const t = block.trim();
    if (!t) return "";
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(t)) return t;
    if (/^\u0000FENCE\d+\u0000$/.test(t)) return t;
    return `<p class="md-p">${t.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

  // Reinsert code fences with escaped content
  s = s.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => {
    const { lang, code } = fences[+i];
    const langClass = lang ? ` data-lang="${lang}"` : "";
    return `<pre class="md-pre"${langClass}><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
  });

  return s;
}

function MarkdownView({ src, className }) {
  return (
    <div
      className={`md-body${className ? " " + className : ""}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(src || "") }}
    />
  );
}

// ============== Editor modal ==============
function MarkdownEditor({ open, title = "문서 편집", filename, value = "", onSave, onClose, hint }) {
  const [draft, setDraft] = useS_MD(value);
  const [mode, setMode] = useS_MD("split"); // edit | split | preview
  const taRef = useR_MD(null);

  useE_MD(() => {
    if (open) {
      setDraft(value);
      // Focus the textarea after mount
      setTimeout(() => taRef.current && taRef.current.focus(), 30);
    }
  }, [open, value]);

  useE_MD(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSave?.(draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, draft, onSave, onClose]);

  if (!open) return null;

  const lineCount = (draft.match(/\n/g) || []).length + 1;
  const charCount = draft.length;

  return (
    <div className="md-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <header className="md-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="md-modal-icon"><Icon name="edit" size={15}/></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <strong className="md-modal-title">{title}</strong>
              {filename && <span className="md-modal-filename">{filename}</span>}
            </div>
            <span className="md-modal-badge">Markdown</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="md-mode-tabs" role="tablist" aria-label="View mode">
              <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>편집</button>
              <button className={mode === "split" ? "on" : ""} onClick={() => setMode("split")}>분할</button>
              <button className={mode === "preview" ? "on" : ""} onClick={() => setMode("preview")}>미리보기</button>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>취소</Button>
            <Button size="sm" variant="primary" leftIcon="check" onClick={() => { onSave?.(draft); }}>저장</Button>
          </div>
        </header>

        <div className={`md-modal-body md-mode-${mode}`}>
          {(mode === "edit" || mode === "split") && (
            <div className="md-edit-pane">
              <textarea
                ref={taRef}
                className="md-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck="false"
                placeholder="# 제목&#10;&#10;마크다운으로 작성하세요…"
              />
            </div>
          )}
          {(mode === "preview" || mode === "split") && (
            <div className="md-preview-pane">
              <MarkdownView src={draft}/>
              {!draft.trim() && (
                <div className="md-empty">미리보기가 여기에 표시됩니다</div>
              )}
            </div>
          )}
        </div>

        <footer className="md-modal-foot">
          <span className="md-hint">
            {hint || (<>
              <kbd>**굵게**</kbd>
              <kbd>*기울임*</kbd>
              <kbd>`코드`</kbd>
              <kbd># 제목</kbd>
              <kbd>- 목록</kbd>
              <kbd>&gt; 인용</kbd>
            </>)}
          </span>
          <span className="md-counts">
            {lineCount}줄 · {charCount.toLocaleString()}자 · <kbd className="md-kbd-key">⌘</kbd><kbd className="md-kbd-key">↵</kbd> 저장
          </span>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { mdToHtml, MarkdownView, MarkdownEditor });
