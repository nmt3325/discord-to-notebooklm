(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const safeFilename = (value) => String(value || "discord-export")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90)
    .trim() || "discord-export";
  const textMatches = (element, labels) => {
    const value = normalize(`${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`);
    return labels.some((label) => value.includes(normalize(label)));
  };
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const findClickable = (labels) => [...document.querySelectorAll('button, [role="button"], [role="menuitem"]')].find((element) => visible(element) && textMatches(element, labels));

  async function waitFor(find, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = find();
      if (value) return value;
      await sleep(160);
    }
    return null;
  }

  async function copyText(markdown) {
    await navigator.clipboard.writeText(markdown);
  }

  function setInputValue(element, value) {
    if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return;
    }
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function attemptImport(payload, updateStatus) {
    updateStatus("ソース追加画面を探しています…");
    const addSource = findClickable(["add source", "ソースを追加", "source を追加", "add sources"]);
    if (addSource) {
      addSource.click();
      await sleep(650);
    }

    const fileInput = await waitFor(() => [...document.querySelectorAll('input[type="file"]')].find((element) => !element.disabled), 2200);
    if (fileInput) {
      updateStatus("Markdownファイルをアップロードしています…");
      const file = new File([payload.markdown], `${safeFilename(payload.title)}.md`, { type: "text/markdown" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(900);
      return { ok: true, method: "file" };
    }

    const copiedText = await waitFor(() => findClickable(["copied text", "貼り付けたテキスト", "paste text", "text source", "テキスト"]), 2800);
    if (copiedText) {
      copiedText.click();
      await sleep(450);
    }
    const editor = await waitFor(() => [...document.querySelectorAll('textarea, [contenteditable="true"]')].find(visible), 2800);
    if (!editor) {
      await copyText(payload.markdown);
      return { ok: false, copied: true, error: "入力欄を自動検出できませんでした。内容はクリップボードにコピー済みです。" };
    }
    updateStatus("テキストを入力しています…");
    editor.focus();
    setInputValue(editor, payload.markdown);
    await sleep(300);
    const submit = findClickable(["insert", "挿入", "import", "インポート", "add", "追加"]);
    if (!submit) {
      await copyText(payload.markdown);
      return { ok: false, copied: true, error: "確定ボタンを自動検出できませんでした。内容はクリップボードにコピー済みです。" };
    }
    submit.click();
    return { ok: true, method: "text" };
  }

  function createPanel(payload) {
    document.getElementById("d2n-notebooklm-panel")?.remove();
    const panel = document.createElement("aside");
    panel.id = "d2n-notebooklm-panel";
    panel.setAttribute("aria-label", "Discord import assistant");
    panel.innerHTML = `
      <h2>Discord履歴を取り込む</h2>
      <p>取り込み先のノートブックを開いてから実行してください。</p>
      <div class="d2n-file"></div>
      <div class="d2n-actions">
        <button class="d2n-primary" type="button">このノートブックへ追加</button>
        <button class="d2n-secondary" type="button">Markdownをコピー</button>
        <button class="d2n-clear" type="button">取り込みを破棄</button>
      </div>
      <p class="d2n-status" aria-live="polite"></p>
    `;
    panel.querySelector(".d2n-file").textContent = payload.title;
    const status = panel.querySelector(".d2n-status");
    const updateStatus = (text) => { status.textContent = text; };
    panel.querySelector(".d2n-primary").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        const result = await attemptImport(payload, updateStatus);
        if (result.ok) {
          updateStatus("追加を開始しました。NotebookLM側の完了表示を確認してください。");
          await chrome.storage.local.remove("pendingImport");
        } else {
          updateStatus(result.error);
        }
      } catch (error) {
        updateStatus(`自動取り込みに失敗しました: ${error.message}`);
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    panel.querySelector(".d2n-secondary").addEventListener("click", async () => {
      await copyText(payload.markdown);
      updateStatus("Markdownをコピーしました。『貼り付けたテキスト』へ貼り付けてください。");
    });
    panel.querySelector(".d2n-clear").addEventListener("click", async () => {
      await chrome.storage.local.remove("pendingImport");
      panel.remove();
    });
    document.body.append(panel);
  }

  async function boot() {
    if (!globalThis.chrome?.storage?.local) return;
    const { pendingImport } = await chrome.storage.local.get("pendingImport");
    if (pendingImport?.markdown) createPanel(pendingImport);
  }

  if (globalThis.chrome?.storage?.local) boot();
  if (globalThis.__D2N_ENABLE_TEST_HOOKS__) globalThis.__D2N_NOTEBOOK_TEST__ = { attemptImport, setInputValue };
})();