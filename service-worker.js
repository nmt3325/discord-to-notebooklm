const safeFilename = (value = "discord-export") =>
  String(value)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90)
    .trim() || "discord-export";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "D2N_OPEN_NOTEBOOKLM") {
    chrome.storage.local
      .set({ pendingImport: { ...message.payload, savedAt: new Date().toISOString() } })
      .then(() => {
        // Open NotebookLM and then also try to open existing source page
        return chrome.tabs.create({ url: "https://notebooklm.google.com/" });
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "D2N_DOWNLOAD") {
    const payload = message.payload || {};
    const filename = `${safeFilename(payload.title)}.md`;
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(payload.markdown || "")}`;
    chrome.downloads
      .download({ url, filename, saveAs: true })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
