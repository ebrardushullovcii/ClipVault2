export const exportPreviewTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #1a1a1a; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-y: auto; }
    video { width: 100%; border-radius: 8px; max-height: 480px; object-fit: contain; background: #000; }
    .drag-hint { text-align: center; padding: 15px; background: #2a2a2a; border-radius: 8px; margin-top: 10px; cursor: grab; user-select: none; }
    .drag-hint:active { cursor: grabbing; }
    .drag-hint h3 { margin: 0 0 8px 0; font-size: 16px; color: #4ade80; }
    .drag-hint p { margin: 0; font-size: 13px; color: #aaa; }
    .file-icon { font-size: 24px; margin-bottom: 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .btn { flex: 1; padding: 10px; background: #3a3a3a; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: background 0.2s ease; }
    .btn:hover { background: #4a4a4a; }
    .btn:disabled { cursor: not-allowed; opacity: 0.6; }
    .btn-primary { background: #4ade80; color: #0f0f0f; }
    .btn-primary:hover { background: #22c55e; }
  </style>
</head>
<body>
  <video src="{{VIDEO_URL}}" controls autoplay></video>
  <div class="drag-hint" id="dragHint" draggable="true">
    <div class="file-icon">📹</div>
    <h3>Export Complete!</h3>
    <p>Drag from here to share the file anywhere</p>
  </div>
  <div class="actions">
    <button class="btn" onclick="copyPath(this)">Copy Path</button>
    <button class="btn btn-primary" onclick="openFolder(this)">Open Folder</button>
  </div>
  <script>
    const api = window.exportPreviewAPI;
    const filePath = '{{ESCAPED_FILE_PATH}}';

    function flashButton(buttonEl, text) {
      if (!buttonEl) return;
      const originalText = buttonEl.textContent;
      buttonEl.textContent = text;
      setTimeout(() => {
        buttonEl.textContent = originalText;
      }, 1500);
    }

    function copyPath(buttonEl) {
      try {
        api.copyPath(filePath);
      } catch {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(filePath).catch(() => {});
        }
      }
      flashButton(buttonEl, 'Copied!');
    }

    const dragHint = document.getElementById('dragHint');
    dragHint.addEventListener('dragstart', (e) => {
      e.preventDefault();
      api.startDrag(filePath);
    });

    function openFolder(buttonEl) {
      api.openFolder(filePath);
      flashButton(buttonEl, 'Opened');
    }
  </script>
</body>
</html>`
