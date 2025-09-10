import { bot } from "../core/core";
import { warnUser } from "../tools/warn";
import { Message } from "node-telegram-bot-api";

// Comma separated env whitelist override, else default list.
const DEFAULT_WHITELIST = [
  "youtube.com",
  "youtu.be",
  "github.com",
  "raw.githubusercontent.com",
  "gist.github.com",
  "t.me",
  "telegram.me",
];

const whitelist: Set<string> = new Set(
  process.env.LINK_WHITELIST?.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean) || DEFAULT_WHITELIST
);

// Basic URL regex (protocol) and bare domain regex (without protocol)
const PROTOCOL_URL_REGEX = /https?:\/\/[^\s]+/gi;
// Matches bare domains like example.com/path or example.org, avoids trailing punctuation
const BARE_DOMAIN_REGEX =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[\w./?%&=#:@;,+\-]*)?/gi;

function extractUrls(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  PROTOCOL_URL_REGEX.lastIndex = 0;
  while ((match = PROTOCOL_URL_REGEX.exec(text)) !== null) {
    found.add(cleanTrailing(match[0]));
  }

  BARE_DOMAIN_REGEX.lastIndex = 0;
  while ((match = BARE_DOMAIN_REGEX.exec(text)) !== null) {
    const url = match[0];
    // Skip if already captured with protocol
    if (!/^https?:\/\//i.test(url)) {
      found.add(cleanTrailing(url));
    }
  }

  return Array.from(found);
}

function cleanTrailing(u: string): string {
  return u.replace(/[),.;!?]+$/g, "");
}

function extractDomain(raw: string): string | null {
  let working = raw.trim();
  if (!/^https?:\/\//i.test(working)) {
    working = "https://" + working; // Add scheme so URL parser works
  }
  try {
    const url = new URL(working);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isWhitelisted(domain: string): boolean {
  if (whitelist.has(domain)) return true;
  // Allow subdomains of whitelisted root domains
  for (const root of whitelist) {
    if (domain === root) return true;
    if (domain.endsWith("." + root)) return true;
  }
  return false;
}

function getMessageText(msg: any): string | null {
  if (!msg) return null;
  return msg.text || msg.caption || null;
}

bot.on("message", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;

  // Combine potential text sources (main + entities text link urls)
  const text = getMessageText(ctx.message as Message);
  const urls: string[] = [];

  if (text) {
    urls.push(...extractUrls(text));
  }

  // Extract from entities if available (Telegraf style)
  const entities =
    (ctx.message as any).entities || (ctx.message as any).caption_entities;
  if (Array.isArray(entities) && text) {
    for (const e of entities) {
      if (e.type === "text_link" && e.url) {
        urls.push(e.url);
      } else if (e.type === "url") {
        // Slice substring
        const slice = text.substring(e.offset, e.offset + e.length);
        if (slice) urls.push(slice);
      }
    }
  }

  if (urls.length === 0) return;

  const bannedDomains = new Set<string>();
  for (const raw of urls) {
    const domain = extractDomain(raw);
    if (!domain) continue;
    if (!isWhitelisted(domain)) {
      bannedDomains.add(domain);
    }
  }

  if (bannedDomains.size > 0) {
    const list = Array.from(bannedDomains).slice(0, 5).join(", ");
    await warnUser(
      ctx.from,
      ctx.chat.id,
      `Unapproved link domains detected: ${list}`,
      ctx.message as Message
    );
  }
});
