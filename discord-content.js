(() => {
  const D = globalThis.D2N || {
    cleanText: (value) => String(value || "").trim(),
    escapeMarkdown: (value) => String(value || ""),
    formatLocalDate: (value) => new Date(value).toLocaleDateString("ja-JP"),
    formatLocalTime: (value) => new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }),
    safeFilename: (value) => String(value || "discord-export"),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  const numeric = /^\d{6,}$/;
  const pathInfo = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    return {
      guildId: parts[0] === "channels" && parts[1] !== "@me" ? parts[1] : null,
      channelId: parts[0] === "channels" ? parts[2] : null,
    };
  };

  function bestLabel(element, fallback) {
    const candidates = [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("data-dnd-name"),
      element.getAttribute?.("title"),
      element.querySelector?.("img[alt]")?.getAttribute("alt"),
      element.textContent,
    ];
    const label = candidates.map(D.cleanText).find((value) => value && value.length < 120);
    return label || fallback;
  }

  function discoverContext() {
    const { guildId, channelId } = pathInfo();
    const anchors = [...document.querySelectorAll('a[href^="/channels/"]')];
    const serversById = new Map();
    const channelsById = new Map();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      const parts = href.split("/").filter(Boolean);
      if (parts[0] !== "channels") continue;
      const candidateGuild = parts[1];
      const candidateChannel = parts[2];
      if (!candidateGuild || candidateGuild === "@me") continue;

      if (!serversById.has(candidateGuild)) {
        const guildLabelSource = anchor.closest('[data-list-item-id^="guildsnav"], [aria-label]') || anchor;
        serversById.set(candidateGuild, {
          id: candidateGuild,
          name: bestLabel(guildLabelSource, `Server ${candidateGuild.slice(-4)}`),
          href: `/channels/${candidateGuild}`,
        });
      }

      if (candidateGuild === guildId && candidateChannel && numeric.test(candidateChannel)) {
        const channelLabel = bestLabel(anchor, `channel-${candidateChannel.slice(-4)}`)
          .replace(/^Text Channel\s*/i, "")
          .replace(/^テキストチャンネル\s*/i, "")
          .replace(/^#\s*/, "");
        channelsById.set(candidateChannel, {
          id: candidateChannel,
          name: `# ${channelLabel}`,
          href,
        });
      }
    }

    const heading = document.querySelector('main h1, [class*="titleWrapper"] h1, [class*="title"] [class*="name"]');
    const currentChannelName = D.cleanText(heading?.textContent || channelsById.get(channelId)?.name || "current-channel").replace(/^#\s*/, "");

    if (guildId && guildId !== "@me" && !serversById.has(guildId)) {
      serversById.set(guildId, { id: guildId, name: "Current server", href: `/channels/${guildId}` });
    }
    if (channelId && numeric.test(channelId) && !channelsById.has(channelId)) {
      channelsById.set(channelId, { id: channelId, name: `# ${currentChannelName}`, href: location.pathname });
    }

    return {
      currentGuildId: guildId,
      currentChannelId: channelId,
      currentChannelName,
      servers: [...serversById.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      channels: [...channelsById.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      url: location.href,
    };
  }

  function snowflakeTimestamp(id) {
    try {
      return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString();
    } catch {
      return null;
    }
  }

  function messageElements(root = document) {
    const primary = [...root.querySelectorAll('li[id^="chat-messages-"], [data-list-item-id^="chat-messages"]')];
    if (primary.length) return primary;
    return [...root.querySelectorAll('[id^="message-content-"]')].map((item) => item.closest("li, article, div")).filter(Boolean);
  }

  function extractMessagesFromDocument(root = document) {
    const output = [];
    let lastAuthor = "Unknown";
    for (const element of messageElements(root)) {
      const rawId = element.id || element.getAttribute?.("data-list-item-id") || "";
      const id = rawId.match(/(\d{6,})/)?.[1] || element.querySelector?.('[id^="message-content-"]')?.id.match(/(\d{6,})/)?.[1];
      if (!id) continue;

      const contentElement = element.querySelector?.(`#message-content-${CSS.escape(id)}, [id^="message-content-"]`);
      const content = D.cleanText(contentElement?.innerText || contentElement?.textContent || "");
      const authorElement = element.querySelector?.('[class*="username"], h3 span[class*="username"], [data-text-variant*="text-md"]');
      const author = D.cleanText(authorElement?.textContent || "") || lastAuthor;
      if (author && author !== "Unknown") lastAuthor = author;

      const timeElement = element.querySelector?.("time[datetime]");
      const timestamp = timeElement?.getAttribute("datetime") || snowflakeTimestamp(id);
      const attachmentLinks = [...element.querySelectorAll('a[href*="cdn.discordapp.com"], a[href*="media.discordapp.net"], a[class*="fileNameLink"]')]
        .map((link) => link.href)
        .filter(Boolean);
      const reply = D.cleanText(element.querySelector?.('[class*="repliedMessage"], [class*="replying"]')?.textContent || "");
      const reactions = [...element.querySelectorAll('[class*="reaction"]')]
        .map((reaction) => D.cleanText(reaction.getAttribute("aria-label") || reaction.textContent))
        .filter(Boolean)
        .slice(0, 20);

      if (!content && !attachmentLinks.length) continue;
      output.push({
        id, author, timestamp, content, reply,
        attachments: [...new Set(attachmentLinks)],
        reactions: [...new Set(reactions)],
        permalink: location.href,
      });
    }
    return output;
  }

  function findScroller() {
    const message = messageElements()[0];
    let current = message?.parentElement;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 20) return current;
      current = current.parentElement;
    }
    const candidates = [...document.querySelectorAll('[class*="scroller"]')]
      .filter((element) => element.scrollHeight > element.clientHeight + 100);
    return candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0] || null;
  }

  function showOverlay(text) {
    let overlay = document.getElementById("d2n-discord-progress");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "d2n-discord-progress";
      Object.assign(overlay.style, {
        position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483647",
        maxWidth: "320px", padding: "12px 14px", borderRadius: "10px",
        color: "#fff", background: "rgba(24,24,27,.94)", boxShadow: "0 8px 28px rgba(0,0,0,.28)",
        font: '13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      });
      document.body.append(overlay);
    }
    overlay.textContent = text;
    return overlay;
  }

  async function exportHistory(options = {}) {
    const maxMessages = Math.max(10, Math.min(10000, Number(options.maxMessages) || 1000));
    const sinceMs = options.since ? new Date(`${options.since}T00:00:00`).getTime() : null;
    const collected = new Map();
    const scroller = findScroller();
    const overlay = showOverlay("履歴をDOMから読み込み中…");
    let unchangedRounds = 0;
    let previousOldest = null;

    for (let round = 0; round < 300; round += 1) {
      for (const message of extractMessagesFromDocument()) collected.set(message.id, message);
      const sorted = [...collected.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const oldest = sorted[0];
      overlay.textContent = `${Math.min(sorted.length, maxMessages).toLocaleString()}件をDOMから読み込み中…`;
      if (sorted.length >= maxMessages) break;
      if (sinceMs && oldest?.timestamp && new Date(oldest.timestamp).getTime() <= sinceMs) break;
      if (!scroller) break;

      if (oldest?.id === previousOldest) unchangedRounds += 1;
      else unchangedRounds = 0;
      previousOldest = oldest?.id;
      if (unchangedRounds >= 5) break;

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await D.sleep(900);
    }

    overlay.remove();
    const messages = [...collected.values()]
      .filter((message) => !sinceMs || !message.timestamp || new Date(message.timestamp).getTime() >= sinceMs)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(-maxMessages);
    if (!messages.length) throw new Error("画面からメッセージを検出できませんでした。");
    return messages;
  }

  function markdownFromMessages(messages, context) {
    const title = `${context.currentChannelName || "Discord channel"} — Discord chat`;
    const lines = [
      `# ${title}`,
      "",
      `- Source: ${context.url}`,
      `- Exported: ${new Date().toISOString()}`,
      `- Messages: ${messages.length}`,
      "",
      "---",
    ];
    let currentDate = null;
    for (const message of messages) {
      const date = D.formatLocalDate(message.timestamp);
      if (date !== currentDate) {
        currentDate = date;
        lines.push("", `## ${date}`, "");
      }
      lines.push(`### ${D.formatLocalTime(message.timestamp)} · ${D.escapeMarkdown(message.author)}`);
      if (message.reply) lines.push(`> Reply: ${D.escapeMarkdown(message.reply)}`);
      if (message.content) lines.push("", D.escapeMarkdown(message.content));
      if (message.attachments?.length) {
        lines.push("", "Attachments:", ...message.attachments.map((url) => `- ${url}`));
      }
      if (message.reactions?.length) lines.push("", `Reactions: ${message.reactions.join(" · ")}`);
      lines.push("", "");
    }
    return { title, markdown: lines.join("\n").trim() + "\n" };
  }

  async function handle(message) {
    if (message?.type === "D2N_DISCOVER") return { ok: true, context: discoverContext() };
    if (message?.type === "D2N_EXPORT") {
      const context = discoverContext();
      const messages = await exportHistory(message.options);
      const payload = markdownFromMessages(messages, context);
      return { ok: true, payload, messageCount: messages.length };
    }
    return { ok: false, error: "Unknown request" };
  }

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      handle(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    });
  }

  if (globalThis.__D2N_ENABLE_TEST_HOOKS__) {
    globalThis.__D2N_TEST__ = { discoverContext, extractMessagesFromDocument, markdownFromMessages };
  }
})();
