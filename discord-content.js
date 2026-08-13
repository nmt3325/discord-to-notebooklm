(() => {
  const D = globalThis.D2N || { cleanText: (v) => String(v || "").trim(), escapeMarkdown: (v) => String(v || ""), formatLocalDate: (v) => new Date(v).toLocaleDateString("ja-JP"), formatLocalTime: (v) => new Date(v).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }), safeFilename: (v) => String(v || "discord-export"), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

  const pathInfo = () => { const p = location.pathname.split("/").filter(Boolean); return { guildId: p[0] === "channels" && p[1] !== "@me" ? p[1] : null, channelId: p[0] === "channels" ? p[2] : null }; };

  function discoverContext() {
    const { guildId, channelId } = pathInfo();
    const anchors = [...document.querySelectorAll('a[href^="/channels/"]')];
    const serversById = new Map(), channelsById = new Map();
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const parts = href.split("/").filter(Boolean);
      if (parts[0] !== "channels") continue;
      const gid = parts[1], cid = parts[2];
      if (!gid || gid === "@me") continue;
      if (!serversById.has(gid)) {
        const label = [a.getAttribute("aria-label"), a.getAttribute("data-dnd-name"), a.querySelector("img[alt]")?.getAttribute("alt"), a.textContent].map(D.cleanText).find(v => v && v.length < 120) || `Server ${gid.slice(-4)}`;
        serversById.set(gid, { id: gid, name: label, href: `/channels/${gid}` });
      }
      if (gid === guildId && cid && /^\d{6,}$/.test(cid)) {
        const cl = [a.getAttribute("aria-label"), a.querySelector("img[alt]")?.getAttribute("alt"), a.textContent].map(D.cleanText).find(v => v && v.length < 80) || `ch-${cid.slice(-4)}`;
        channelsById.set(cid, { id: cid, name: `# ${cl.replace(/^(Text Channel|テキストチャンネル)\s*/i,"").replace(/^#\s*/,"")}`, href });
      }
    }
    const hdr = document.querySelector('main h1, [class*="titleWrapper"] h1, [class*="title"] [class*="name"], header h1');
    const cn = D.cleanText(hdr?.textContent || channelsById.get(channelId)?.name || "current-channel").replace(/^#\s*/, "");
    if (guildId && guildId !== "@me" && !serversById.has(guildId)) serversById.set(guildId, { id: guildId, name: "Current Server", href: `/channels/${guildId}` });
    if (channelId && /^\d{6,}$/.test(channelId) && !channelsById.has(channelId)) channelsById.set(channelId, { id: channelId, name: `# ${cn}`, href: location.pathname });
    return { currentGuildId: guildId, currentChannelId: channelId, currentChannelName: cn, servers: [...serversById.values()].sort((a,b)=>a.name.localeCompare(b.name,"ja")), channels: [...channelsById.values()].sort((a,b)=>a.name.localeCompare(b.name,"ja")), url: location.href };
  }

  // Get the Discord token from localStorage (for extension's auto-detect)
  function getToken() {
    try { const raw = localStorage.getItem("token"); if (raw) { const t = JSON.parse(raw); return typeof t === "string" ? t : null; } } catch {}
    // Try alternative keys
    for (const key of ["multiAccountStore", "multiAccountStoreV2"]) {
      try { const raw = localStorage.getItem(key); if (raw) { const data = JSON.parse(raw); if (Array.isArray(data) && data[0]?.token) return data[0].token; } } catch {}
    }
    return null;
  }

  function snowflakeTimestamp(id) { try { return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString(); } catch { return null; } }

  function messageElements(root = document) {
    // Try modern Discord message selectors first
    const selectors = [
      'li[id^="chat-messages-"]',
      '[data-list-item-id^="chat-messages"]',
      'ol[data-list-id^="chat-messages"] > li',
    ];
    for (const sel of selectors) {
      const found = [...root.querySelectorAll(sel)];
      if (found.length) return found;
    }
    // Fallback: find by message-content IDs
    return [...root.querySelectorAll('[id^="message-content-"]')].map(i => i.closest("li, article, div, [role='listitem']")).filter(Boolean);
  }

  function extractMessagesFromDocument(root = document) {
    const out = []; let lastAuthor = "Unknown";
    for (const el of messageElements(root)) {
      const rawId = el.id || el.getAttribute("data-list-item-id") || "";
      const id = rawId.match(/(\d{6,})/)?.[1] || el.querySelector('[id^="message-content-"]')?.id.match(/(\d{6,})/)?.[1];
      if (!id) continue;
      const ce = el.querySelector(`#message-content-${CSS.escape(id)}, [id^="message-content-"]`);
      const content = D.cleanText(ce?.innerText || ce?.textContent || "");
      const ae = el.querySelector('[class*="username"], h3 span[class*="username"], [data-text-variant*="text-md"], [class*="displayName"]');
      const author = D.cleanText(ae?.textContent || "") || lastAuthor;
      if (author && author !== "Unknown") lastAuthor = author;
      const te = el.querySelector("time[datetime]");
      const timestamp = te?.getAttribute("datetime") || snowflakeTimestamp(id);
      const atts = [...el.querySelectorAll('a[href*="cdn.discordapp.com"], a[href*="media.discordapp.net"], a[class*="fileNameLink"], a[class*="attachmentLink"]')].map(l=>l.href).filter(Boolean);
      const reply = D.cleanText(el.querySelector('[class*="repliedMessage"], [class*="replying"], [class*="reply"]')?.textContent || "");
      const rxns = [...el.querySelectorAll('[class*="reaction"]')].map(r => D.cleanText(r.getAttribute("aria-label") || r.textContent)).filter(Boolean).slice(0, 20);
      if (!content && !atts.length) continue;
      out.push({ id, author, timestamp, content, reply, attachments: [...new Set(atts)], reactions: [...new Set(rxns)], permalink: location.href });
    }
    return out;
  }

  function findScroller() {
    const msg = messageElements()[0]; let cur = msg?.parentElement;
    while (cur && cur !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(cur).overflowY) && cur.scrollHeight > cur.clientHeight + 20) return cur; cur = cur.parentElement; }
    return [...document.querySelectorAll('[class*="scroller"]')].filter(e => e.scrollHeight > e.clientHeight + 100).sort((a,b)=>b.clientHeight-a.clientHeight)[0] || null;
  }

  function showOverlay(text) {
    let ov = document.getElementById("d2n-discord-progress");
    if (!ov) { ov = document.createElement("div"); ov.id = "d2n-discord-progress"; Object.assign(ov.style, { position:"fixed",right:"20px",bottom:"20px",zIndex:"2147483647",maxWidth:"320px",padding:"12px 14px",borderRadius:"10px",color:"#fff",background:"rgba(24,24,27,.94)",boxShadow:"0 8px 28px rgba(0,0,0,.28)",font:'13px/1.45 sans-serif' }); document.body.append(ov); }
    ov.textContent = text; return ov;
  }

  async function exportHistory(options = {}) {
    const max = Math.max(10, Math.min(10000, Number(options.maxMessages) || 1000));
    const sinceMs = options.since ? new Date(`${options.since}T00:00:00`).getTime() : null;
    const col = new Map(); const sc = findScroller(); const ov = showOverlay("履歴をDOMから読み込み中…");
    let ur = 0, prev = null;
    for (let r = 0; r < 300; r++) {
      for (const m of extractMessagesFromDocument()) col.set(m.id, m);
      const srt = [...col.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const old = srt[0]; ov.textContent = `${Math.min(srt.length,max).toLocaleString()}件を読み込み中…`;
      if (srt.length >= max || (sinceMs && old?.timestamp && new Date(old.timestamp).getTime() <= sinceMs) || !sc) break;
      if (old?.id === prev) { ur++; if (ur >= 5) break; } else ur = 0; prev = old?.id;
      sc.scrollTop = 0; sc.dispatchEvent(new Event("scroll",{bubbles:true})); await D.sleep(900);
    }
    ov.remove();
    const msgs = [...col.values()].filter(m => !sinceMs || !m.timestamp || new Date(m.timestamp).getTime() >= sinceMs).sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(-max);
    if (!msgs.length) throw new Error("画面からメッセージを検出できませんでした。チャンネルをスクロールしてから再試行してください。");
    return msgs;
  }

  function markdownFromMessages(msgs, ctx) {
    const title = `${ctx.currentChannelName || "Discord channel"} — Discord chat`;
    const lines = [`# ${title}`, "", `- Source: ${ctx.url}`, `- Exported: ${new Date().toISOString()}`, `- Messages: ${msgs.length}`, "", "---"];
    let cd = null;
    for (const m of msgs) {
      const d = D.formatLocalDate(m.timestamp); if (d !== cd) { cd = d; lines.push("",`## ${d}`,""); }
      lines.push(`### ${D.formatLocalTime(m.timestamp)} · ${D.escapeMarkdown(m.author)}`);
      if (m.reply) lines.push(`> Reply: ${D.escapeMarkdown(m.reply)}`);
      if (m.content) lines.push("", D.escapeMarkdown(m.content));
      if (m.attachments?.length) lines.push("","Attachments:",...m.attachments.map(u=>`- ${u}`));
      if (m.reactions?.length) lines.push("",`Reactions: ${m.reactions.join(" · ")}`);
      lines.push("","");
    }
    return { title, markdown: lines.join("\n").trim() + "\n" };
  }

  async function handle(msg) {
    if (msg?.type === "D2N_DISCOVER") return { ok: true, context: discoverContext() };
    if (msg?.type === "D2N_GET_TOKEN") return { token: getToken() };
    if (msg?.type === "D2N_EXPORT") { const ctx = discoverContext(); const msgs = await exportHistory(msg.options); const pl = markdownFromMessages(msgs, ctx); return { ok: true, payload: pl, messageCount: msgs.length }; }
    return { ok: false, error: "Unknown request" };
  }

  chrome.runtime?.onMessage?.addListener((m,_,sr) => { handle(m).then(sr).catch(e => sr({ ok: false, error: e.message })); return true; });
  if (globalThis.__D2N_ENABLE_TEST_HOOKS__) globalThis.__D2N_TEST__ = { discoverContext, extractMessagesFromDocument, markdownFromMessages, getToken };
})();
