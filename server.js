import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));
app.use(express.static(__dirname));

const clean = (value, max = 1500) => String(value ?? "").trim().slice(0, max);
const config = {
  guildId: process.env.DISCORD_GUILD_ID || "",
  inviteUrl: process.env.DISCORD_INVITE_URL || "",
  applicationWebhook: process.env.DISCORD_APPLICATION_WEBHOOK || "",
  communityName: "𝑅𝐸𝐷 𝐵𝑈𝐿"
};

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    communityName: config.communityName,
    discordConfigured: Boolean(config.guildId),
    inviteConfigured: Boolean(config.inviteUrl),
    applicationsConfigured: Boolean(config.applicationWebhook),
    inviteUrl: config.inviteUrl || null
  });
});

app.get("/api/discord", async (_req, res) => {
  if (!config.guildId) {
    return res.status(200).json({ configured: false, message: "لم تتم إضافة Discord Server ID بعد." });
  }
  try {
    const response = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(config.guildId)}/widget.json`, {
      headers: { "User-Agent": "RED-BUL-Community-Site/2.0" },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      return res.status(200).json({
        configured: true,
        available: false,
        message: "تعذر عرض معلومات السيرفر. تأكد من تفعيل Server Widget في إعدادات Discord."
      });
    }
    const data = await response.json();
    return res.json({
      configured: true,
      available: true,
      name: clean(data.name, 100),
      presenceCount: Number(data.presence_count || 0),
      channels: Array.isArray(data.channels) ? data.channels.slice(0, 8).map(c => ({ id: c.id, name: clean(c.name, 80) })) : [],
      members: Array.isArray(data.members) ? data.members.slice(0, 20).map(m => ({
        username: clean(m.username, 80),
        status: clean(m.status, 30),
        avatar: clean(m.avatar, 500)
      })) : []
    });
  } catch {
    return res.status(200).json({ configured: true, available: false, message: "لم نتمكن من جلب معلومات Discord الآن." });
  }
});

const rateWindow = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const previous = rateWindow.get(ip) || [];
  const recent = previous.filter(t => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: "تم إرسال طلبات كثيرة. حاول بعد قليل." });
  recent.push(now);
  rateWindow.set(ip, recent);
  next();
}

app.post("/api/applications", rateLimit, async (req, res) => {
  const name = clean(req.body?.name, 80);
  const discordUser = clean(req.body?.discordUser, 100);
  const age = clean(req.body?.age, 3);
  const role = clean(req.body?.role, 80);
  const experience = clean(req.body?.experience, 1500);
  if (!name || !discordUser || !role || !experience) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة." });
  }
  if (!config.applicationWebhook) {
    return res.status(503).json({ error: "نموذج التقديم غير مربوط بعد. يرجى التواصل مع إدارة RED BUL." });
  }
  const embed = {
    title: "طلب تقديم جديد — RED BUL",
    color: 0xe77ba8,
    fields: [
      { name: "الاسم", value: name, inline: true },
      { name: "Discord", value: discordUser, inline: true },
      { name: "العمر", value: age || "لم يذكر", inline: true },
      { name: "القسم المطلوب", value: role, inline: false },
      { name: "الخبرة / سبب التقديم", value: experience, inline: false }
    ],
    footer: { text: "RED BUL • نموذج التقديم الرسمي" },
    timestamp: new Date().toISOString()
  };
  try {
    const response = await fetch(config.applicationWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(502).json({ error: "لم يتم تسليم الطلب إلى Discord. تحقق من إعدادات Webhook." });
    }
    return res.json({ ok: true, message: "تم إرسال طلبك إلى فريق الإدارة في Discord." });
  } catch {
    return res.status(502).json({ error: "تعذر الاتصال بـ Discord الآن. حاول لاحقاً." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "RED BUL", version: "2.0.0" }));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`RED BUL website running on port ${PORT}`));
