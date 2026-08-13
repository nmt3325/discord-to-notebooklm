(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const cleanText = (value = "") =>
    String(value)
      .replace(/\u200b/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const safeFilename = (value = "discord-export") => {
    const cleaned = cleanText(value)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 90)
      .trim();
    return cleaned || "discord-export";
  };

  const formatLocalDate = (iso) => {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const formatLocalTime = (iso) => {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "--:--";
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  };

  const escapeMarkdown = (value = "") =>
    String(value).replace(/^([#>-]|\d+\.)\s/gm, "\\$1 ");

  globalThis.D2N = {
    cleanText,
    escapeMarkdown,
    formatLocalDate,
    formatLocalTime,
    safeFilename,
    sleep,
  };
})();
