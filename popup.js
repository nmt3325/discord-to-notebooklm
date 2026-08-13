(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    tab: null,
    token: null,
    user: null,
    guilds: [],
    channels: [],
    selectedGuildId: null,
    selectedChannelId: null,
    busy: false,
    useApi: false,
  };

  const tokenInput = $("tokenInput");
  const tokenLoadButton = $("tokenLoadButton");
  const tokenClearButton = $("tokenClearButton");
  const tokenStatus = $("tokenStatus");
  const statusCard = $("statusCard");
  const statusTitle = $("statusTitle");
  const statusDetail = $("statusDetail");
  const sourceHint = $("sourceHint");
  const serverSelect = $("serverSelect");
  const channelSelect = $("channelSelect");
  const importButton = $("importButton");
  const downloadButton = $("downloadButton");
  const openChannelButton = $("openChannelButton");
  const refreshButton = $("refreshButton");
  const progress = $("progress");
  const progressBar = $("progressBar");
  const progressText = $("progressText");

  function setStatus(kind, title, detail) {
    statusCard.className = `status-card ${kind || ""}`.trim();
    statusTitle.textContent = title;
    statusDetail.textContent = detail;
  }

  function setProgress(percent, text) {
    progress.classList.remove("hidden");
    progressBar.style.width = `${Math.max(5, Math.min(100, percent))}%`;
    progressText.textContent = text;
  }

  function setEnabled(enabled) {
    importButton.disabled = !enabled || state.busy;
    downloadButton.disabled = !enabled || state.busy;
    serverSelect.disabled = !enabled || state.busy;
    channelSelect.disabled = !enabled || state.busy;
    openChannelButton.disabled = !enabled || state.busy || !state.selectedChannelId;
  }

  function fillSelect(select, items, selectedId, emptyText) {
    select.replaceChildren();
    if (!items.length) {
      const option = document.createElement("option");
      option.textContent = emptyText || "なし";
      option.value = "";
      select.append(option);
      return;
    }
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      option.dataset.href = item.href || "";
      option.selected = item.id === selectedId;
      select.append(option);
    }
  }

  function apiHeaders() {
    if (!state.token) throw new Error("トークンが設定されていません。");
    return { Authorization: state.token };
  }

  async function apiFetch(path) {
    const res = await fetch(`{{https://discord.com/api/v10${path}}}`, { headers: apiHeaders() });
    if (!res.ok) {
      if (res.status === 401) throw new Error("トークンが無効です。再発行してください。");
      if (res.status === 429) throw new Error("レート制限中。しばらく待ってください。");
      throw new Error(`API エラー: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async function loadGuildsApi() {
    const guilds = await apiFetch("/users/@me/guilds");
    state.guilds = guilds.map((g) => ({ id: g.id, name: g.name, href: `/channels/${g.id}` })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  async function loadChannelsApi(guildId) {
    const channels = await apiFetch(`/guilds/${guildId}/channels`);
    state.channels = channels.filter((c) => [0, 5].includes(c.type)).map((c) => ({ id: c.id, name: `# ${c.name}`, href: `/channels/${guildId}/${c.id}` })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  async function fetchMessagesApi(channelId, options) {
    const maxMessages = options.maxMessages || 1000;
    const sinceMs = options.since ? new Date(`${options.since}T00:00:00`).getTime() : null;
    const collected = [];
    let before = null;
    while (collected.length < maxMessages) {
      const limit = Math.min(100, maxMessages - collected.length);
      let url = `/channels/${channelId}/messages?limit=${limit}`;
      if (before) url += `&before=${before}`;
      const batch = await apiFetch(url);
      if (!batch.length) break;
      for (const m of batch) {
        const ts = new Date(m.timestamp).getTime();
        if (sinceMs && ts < sinceMs) { before = null; break; }
        collected.push({ id: m.id, author: m.author.global_name || m.author.username, timestamp: m.timestamp, content: m.content || "", attachments: (m.attachments || []).map((a) => a.url), reactions: (m.reactions || []).map((r) => `${r.emoji.name || "?"}×${r.count}`), permalink: `{{https://discord.com/channels/${state.selectedGuildId}}}/${channelId}/${m.id}`, reply: null });
        before = m.id;
      }
      if (batch.length < limit || before === null) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return collected.reverse();
  }

  async function sendToDiscord(message) {
    if (!state.tab?.id) throw new Error("Discordタブが見つかりません。");
    return chrome.tabs.sendMessage(state.tab.id, message);
  }

  async function discoverDom() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    if (!tab?.url?.startsWith("https://discord.com/channels/")) { setStatus("warn", "Discordタブを開いてください", ""); setEnabled(false); return; }
    const result = await sendToDiscord({ type: "D2N_DISCOVER" });
    if (!result?.ok) throw new Error(result?.error || "Discord画面を読み取れませんでした。");
    const ctx = result.context;
    state.guilds = ctx.servers || [];
    state.channels = ctx.channels || [];
    state.selectedGuildId = ctx.currentGuildId;
    state.selectedChannelId = ctx.currentChannelId;
    fillSelect(serverSelect, state.guilds, state.selectedGuildId, "サーバーを検出できません");
    fillSelect(channelSelect, state.channels, state.selectedChannelId, "チャンネルを検出できません");
    setStatus("ready", "Discord (DOM) に接続済み", `#${ctx.currentChannelName || "現在のチャンネル"} を書き出せます。`);
    sourceHint.textContent = "DOMスクレイピングで検出しました。";
    setEnabled(Boolean(state.selectedChannelId));
  }

  async function applyToken(token) {
    token = token.trim();
    if (!token) return;
    state.token = token;
    await chrome.storage.local.set({ discordToken: token });
    tokenStatus.classList.remove("hidden", "error", "ok");
    tokenStatus.textContent = "トークンを検証中…"; tokenStatus.classList.add("loading");
    const user = await apiFetch("/users/@me");
    state.user = user; state.useApi = true;
    tokenStatus.textContent = `✅ ${user.global_name || user.username} としてログイン中`;
    tokenStatus.classList.remove("loading"); tokenStatus.classList.add("ok");
  }

  tokenLoadButton.addEventListener("click", async () => { await applyToken(tokenInput.value); await refreshAll(); });
  tokenClearButton.addEventListener("click", async () => {
    state.token = null; state.user = null; state.useApi = false; state.guilds = []; state.channels = []; state.selectedGuildId = null; state.selectedChannelId = null;
    tokenInput.value = ""; tokenStatus.classList.add("hidden");
    await chrome.storage.local.remove("discordToken");
    fillSelect(serverSelect, [], null, "トークンを入力してください");
    fillSelect(channelSelect, [], null, "チャンネルを選択");
    setStatus("", "準備中", "トークンを入力するかDiscordタブを開いてください。");
    sourceHint.textContent = "API または DOM から検出します。"; setEnabled(false);
  });

  tokenInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await applyToken(tokenInput.value); await refreshAll(); } });

  async function refreshAll() {
    serverSelect.disabled = true; channelSelect.disabled = true; setEnabled(false);
    if (state.useApi && state.token) {
      setStatus("", "API でサーバー一覧を取得中…", "");
      sourceHint.textContent = "Discord API から取得しています。";
      await loadGuildsApi();
      fillSelect(serverSelect, state.guilds, state.selectedGuildId, "サーバーなし");
      serverSelect.disabled = false;
      if (state.guilds.length > 0) { state.selectedGuildId = state.guilds[0].id; serverSelect.value = state.selectedGuildId; await onGuildChange(); }
      const userLabel = state.user ? `${state.user.global_name || state.user.username}` : "API";
      setStatus("ready", `API 接続済み (${userLabel})`, `${state.guilds.length} サーバー検出`);
      setEnabled(Boolean(state.selectedChannelId));
    } else { sourceHint.textContent = "DOM スクレイピングで検出します。"; await discoverDom(); }
  }

  async function onGuildChange() {
    state.selectedGuildId = serverSelect.value; state.selectedChannelId = null; channelSelect.disabled = true;
    if (state.useApi && state.token && state.selectedGuildId) {
      await loadChannelsApi(state.selectedGuildId);
      fillSelect(channelSelect, state.channels, null, "チャンネルなし"); channelSelect.disabled = false;
      if (state.channels.length > 0) { state.selectedChannelId = state.channels[0].id; channelSelect.value = state.selectedChannelId; }
    }
    openChannelButton.disabled = !state.selectedChannelId;
    setEnabled(Boolean(state.selectedChannelId));
  }

  serverSelect.addEventListener("change", onGuildChange);
  channelSelect.addEventListener("change", () => { state.selectedChannelId = channelSelect.value; openChannelButton.disabled = !state.selectedChannelId; setEnabled(Boolean(state.selectedChannelId)); });
  openChannelButton.addEventListener("click", async () => { const opt = channelSelect.selectedOptions[0]; if (opt?.dataset.href) { await chrome.tabs.create({ url: "https://discord.com" + opt.dataset.href }); window.close(); } });
  refreshButton.addEventListener("click", refreshAll);

  async function exportChannel(mode) {
    if (state.busy) return; state.busy = true; setEnabled(false);
    const since = $("sinceDate").value || null;
    const maxMessages = Math.max(10, Math.min(10000, Number($("maxMessages").value) || 1000));
    let messages;
    if (state.useApi && state.token && state.selectedChannelId) {
      setProgress(12, `APIで最大${maxMessages}件のメッセージを取得中…`);
      messages = await fetchMessagesApi(state.selectedChannelId, { since, maxMessages });
    } else if (state.tab?.id) {
      setProgress(12, "DOMからメッセージをスクレイピング中…");
      const result = await sendToDiscord({ type: "D2N_EXPORT", options: { since, maxMessages } });
      if (!result?.ok) throw new Error(result?.error || "書き出しに失敗しました。");
      setProgress(76, `${result.messageCount.toLocaleString()}件を整形しました。`);
      if (mode === "download") { await chrome.runtime.sendMessage({ type: "D2N_DOWNLOAD", payload: result.payload }); setProgress(100, "Markdownを保存しました。"); }
      else { await chrome.runtime.sendMessage({ type: "D2N_OPEN_NOTEBOOKLM", payload: result.payload }); setProgress(100, "NotebookLMを開きました。"); }
      state.busy = false; setEnabled(Boolean(state.selectedChannelId)); return;
    } else throw new Error("トークンを入力するかDiscordタブを開いてください。");
    if (!messages.length) throw new Error("メッセージが見つかりませんでした。");
    setProgress(70, `${messages.length.toLocaleString()}件をMarkdownに整形中…`);
    const channelName = state.channels.find((c) => c.id === state.selectedChannelId)?.name?.replace(/^#\s*/, "") || "discord-channel";
    const guildName = state.guilds.find((g) => g.id === state.selectedGuildId)?.name || "Unknown Server";
    const title = `${guildName} — #${channelName}`;
    const lines = [`# ${title}`, "", `- Server: ${guildName}`, `- Channel: #${channelName}`, `- Exported: ${new Date().toISOString()}`, `- Messages: ${messages.length}`, "", "---"];
    let currentDate = null;
    for (const m of messages) {
      const d = new Date(m.timestamp).toLocaleDateString("ja-JP");
      if (d !== currentDate) { currentDate = d; lines.push("", `## ${d}`, ""); }
      lines.push(`### ${new Date(m.timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${m.author}`);
      if (m.content) lines.push("", m.content);
      if (m.attachments?.length) lines.push("", "**Attachments:**", ...m.attachments.map((u) => `- ${u}`));
      if (m.reactions?.length) lines.push("", `Reactions: ${m.reactions.join(" · ")}`);
      lines.push("", "");
    }
    const payload = { title, markdown: lines.join("\n").trim() + "\n" };
    setProgress(90, `${messages.length.toLocaleString()}件のMarkdownを生成しました。`);
    if (mode === "download") { await chrome.runtime.sendMessage({ type: "D2N_DOWNLOAD", payload }); setProgress(100, "Markdownを保存しました。"); }
    else { await chrome.runtime.sendMessage({ type: "D2N_OPEN_NOTEBOOKLM", payload }); setProgress(100, "NotebookLMを開きました。"); }
    state.busy = false; setEnabled(Boolean(state.selectedChannelId));
  }

  importButton.addEventListener("click", () => exportChannel("import"));
  downloadButton.addEventListener("click", () => exportChannel("download"));

  async function init() {
    const stored = await chrome.storage.local.get("discordToken");
    if (stored.discordToken) { tokenInput.value = stored.discordToken; await applyToken(stored.discordToken); await refreshAll(); return; }
    if (globalThis.chrome?.tabs) await discoverDom();
    else setStatus("", "準備中", "トークンを入力するかDiscordタブを開いてください。");
  }
  init();
})();