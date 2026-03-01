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
    .btn-discord { background: #5865F2; }
    .btn-discord:hover { background: #4752c4; }
    .btn-youtube { background: #ff0033; }
    .btn-youtube:hover { background: #cc0029; }
    .share-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .share-card { border: 1px solid #2f2f2f; border-radius: 10px; padding: 12px; background: #202020; }
    .share-card h4 { margin: 0 0 6px 0; font-size: 14px; }
    .share-card p { margin: 0 0 8px 0; color: #aaa; font-size: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .field label { font-size: 12px; color: #bcbcbc; }
    .input, .textarea, .select {
      border: 1px solid #3a3a3a;
      background: #171717;
      color: #f0f0f0;
      border-radius: 6px;
      font-size: 13px;
      padding: 8px;
      width: 100%;
    }
    .textarea { min-height: 72px; resize: vertical; }
    .status { margin-top: 8px; font-size: 12px; min-height: 18px; }
    .status.info { color: #9ca3af; }
    .status.success { color: #4ade80; }
    .status.error { color: #fb7185; }
    .status.warn { color: #fbbf24; }
    .status-link { color: #86efac; text-decoration: underline; cursor: pointer; }
    .btn-row { display: flex; gap: 8px; }
    @media (max-width: 900px) {
      .share-grid { grid-template-columns: 1fr; }
    }
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
  <div class="share-grid">
    <section class="share-card">
      <h4>Discord</h4>
      <p>Direct upload using your configured webhook.</p>
      <div class="field">
        <label for="discordMessage">Message</label>
        <textarea id="discordMessage" class="textarea" placeholder="Optional message"></textarea>
      </div>
      <button class="btn btn-discord" id="discordShareBtn">Upload to Discord</button>
      <div class="status" id="discordStatus"></div>
    </section>

    <section class="share-card">
      <h4>YouTube</h4>
      <p id="youtubeConnectionText">Upload to your connected YouTube account.</p>
      <div class="field">
        <label for="youtubeTitle">Title</label>
        <input id="youtubeTitle" class="input" maxlength="100" />
      </div>
      <div class="field">
        <label for="youtubeDescription">Description</label>
        <textarea id="youtubeDescription" class="textarea" maxlength="5000"></textarea>
      </div>
      <div class="field">
        <label for="youtubeTags">Tags (comma separated)</label>
        <input id="youtubeTags" class="input" placeholder="clipvault, gaming, highlights" />
      </div>
      <div class="field">
        <label for="youtubePrivacy">Privacy</label>
        <select id="youtubePrivacy" class="select">
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
      </div>
      <button class="btn btn-youtube" id="youtubeShareBtn">Upload to YouTube</button>
      <div class="status" id="youtubeStatus"></div>
    </section>
  </div>
  <script>
    const api = window.exportPreviewAPI;
    const filePath = '{{ESCAPED_FILE_PATH}}';
    const shareConfig = {{SAFE_SHARE_CONFIG}};

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

    function setStatus(elementId, text, kind = 'info') {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.className = 'status ' + kind;
      el.textContent = text;
    }

    function setStatusWithLink(elementId, text, url) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.className = 'status success';
      el.innerHTML = '';
      const textNode = document.createElement('span');
      textNode.textContent = text + ' ';
      const link = document.createElement('a');
      link.textContent = 'Open';
      link.className = 'status-link';
      link.href = '#';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        void api.openExternal(url);
      });
      el.appendChild(textNode);
      el.appendChild(link);
    }

    // Handle drag start - send IPC to main process for native drag
    const dragHint = document.getElementById('dragHint');
    dragHint.addEventListener('dragstart', (e) => {
      e.preventDefault();
      // Send IPC to main process to initiate native drag
      api.startDrag(filePath);
    });

    function openFolder(buttonEl) {
      api.openFolder(filePath);
      flashButton(buttonEl, 'Opened');
    }

    const discordMessageEl = document.getElementById('discordMessage');
    const youtubeTitleEl = document.getElementById('youtubeTitle');
    const youtubeDescriptionEl = document.getElementById('youtubeDescription');
    const youtubeTagsEl = document.getElementById('youtubeTags');
    const youtubePrivacyEl = document.getElementById('youtubePrivacy');
    const discordShareBtn = document.getElementById('discordShareBtn');
    const youtubeShareBtn = document.getElementById('youtubeShareBtn');
    const youtubeConnectionText = document.getElementById('youtubeConnectionText');

    discordMessageEl.value = shareConfig.defaultDiscordMessage || '';
    youtubeTitleEl.value = shareConfig.defaultYouTubeTitle || '';
    youtubeDescriptionEl.value = shareConfig.defaultYouTubeDescription || '';
    youtubeTagsEl.value = (shareConfig.defaultYouTubeTags || []).join(', ');
    youtubePrivacyEl.value = shareConfig.defaultYouTubePrivacy || 'unlisted';

    if (!shareConfig.discordConfigured) {
      discordShareBtn.disabled = true;
      setStatus('discordStatus', 'Configure Discord webhook in Settings > Social Sharing.', 'warn');
    }

    if (!shareConfig.youtubeConnected) {
      youtubeShareBtn.disabled = true;
      if (youtubeConnectionText) {
        youtubeConnectionText.textContent = 'Connect your YouTube account in Settings > Social Sharing.';
      }
      setStatus('youtubeStatus', 'YouTube account not connected.', 'warn');
    } else if (shareConfig.youtubeChannelTitle && youtubeConnectionText) {
      youtubeConnectionText.textContent = 'Connected as: ' + shareConfig.youtubeChannelTitle;
    }

    discordShareBtn?.addEventListener('click', async () => {
      discordShareBtn.disabled = true;
      setStatus('discordStatus', 'Uploading to Discord...', 'info');
      try {
        const result = await api.shareDiscord({
          filePath,
          message: discordMessageEl.value,
        });

        if (result?.success) {
          if (result.attachmentUrl) {
            setStatusWithLink('discordStatus', 'Upload complete.', result.attachmentUrl);
          } else if (result.messageUrl) {
            setStatusWithLink('discordStatus', 'Upload complete.', result.messageUrl);
          } else {
            setStatus('discordStatus', 'Upload complete.', 'success');
          }
        } else {
          setStatus('discordStatus', result?.error || 'Discord upload failed.', 'error');
        }
      } catch (error) {
        setStatus('discordStatus', error?.message || 'Discord upload failed.', 'error');
      } finally {
        discordShareBtn.disabled = !shareConfig.discordConfigured;
      }
    });

    youtubeShareBtn?.addEventListener('click', async () => {
      youtubeShareBtn.disabled = true;
      setStatus('youtubeStatus', 'Uploading to YouTube... this can take a while.', 'info');
      try {
        const tags = youtubeTagsEl.value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

        const result = await api.shareYouTube({
          filePath,
          title: youtubeTitleEl.value,
          description: youtubeDescriptionEl.value,
          tags,
          privacy: youtubePrivacyEl.value,
        });

        if (result?.success && result?.videoUrl) {
          setStatusWithLink('youtubeStatus', 'Upload complete.', result.videoUrl);
        } else if (result?.success) {
          setStatus('youtubeStatus', 'Upload complete.', 'success');
        } else {
          setStatus('youtubeStatus', result?.error || 'YouTube upload failed.', 'error');
        }
      } catch (error) {
        setStatus('youtubeStatus', error?.message || 'YouTube upload failed.', 'error');
      } finally {
        youtubeShareBtn.disabled = !shareConfig.youtubeConnected;
      }
    });
  </script>
</body>
</html>`
