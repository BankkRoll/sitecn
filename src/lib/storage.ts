import { browser } from "wxt/browser";
import { z } from "zod";
export const siteKey = (domain: string) => `sitecn-extension:site:${domain}`;
export const chatKey = (domain: string) => `sitecn-extension:chat:${domain}`;
export const threadKey = (domain: string) =>
  `sitecn-extension:thread:${domain}`;
export const modelOverridesKey = "sitecn-extension:modelOverrides";
export const modelAvailabilityKey = "sitecn-extension:modelAvailability";
export const uiThemeNameKey = "sitecn-extension:uiThemeName";

export const zSiteThemeEntry = z.object({
  enabled: z.boolean(),
  css: z.string().optional(),
  themeJson: z.unknown().optional(),
  aggressive: z.boolean().optional(),
  mode: z.enum(["light", "dark", "both"]).optional(),
  updatedAt: z.string().optional(),
});
export type SiteThemeEntry = z.infer<typeof zSiteThemeEntry>;

export const zChatMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof zChatMessage>;

export const zThreadMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string().optional(),
  css: z.string().optional(),
  theme: z.record(z.string(), z.string().optional()).optional(),
  createdAt: z.number(),
  applied: z.boolean().optional(),
});
export type ThreadMessage = z.infer<typeof zThreadMessage>;

export const zModelOverrides = z.object({
  temperature: z.number(),
  topK: z.number().int(),
});
export type ModelOverrides = z.infer<typeof zModelOverrides>;

export const zModelAvailability = z.object({
  value: z.string(),
  at: z.number(),
});
export type ModelAvailability = z.infer<typeof zModelAvailability>;
async function storageGet<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const obj = (await browser.storage.local.get(key)) as any;
    const raw = obj?.[key];
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function storageSet<T>(key: string, value: T): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch {}
}

async function storageRemove(key: string): Promise<void> {
  try {
    await browser.storage.local.remove(key);
  } catch {}
}

export async function getSiteEntry(
  domain: string,
): Promise<SiteThemeEntry | null> {
  return storageGet(siteKey(domain), zSiteThemeEntry);
}

export async function setSiteEntry(
  domain: string,
  entry: SiteThemeEntry,
): Promise<void> {
  await storageSet(siteKey(domain), entry);
}

export async function enableSiteCssForDomain(domain: string): Promise<void> {
  const prev = (await getSiteEntry(domain)) || { enabled: false };
  await setSiteEntry(domain, { ...prev, enabled: true });
}

export async function disableSiteCssForDomain(domain: string): Promise<void> {
  const prev = (await getSiteEntry(domain)) || { enabled: false };
  await setSiteEntry(domain, { ...prev, enabled: false });
}

export async function getSiteStylesheet(domain: string): Promise<string> {
  const entry = await getSiteEntry(domain);
  return typeof entry?.css === "string" ? entry.css : "";
}

export async function getSiteChatTranscript(
  domain: string,
): Promise<ChatMessage[]> {
  try {
    const key = chatKey(domain);
    const obj = (await browser.storage.local.get(key)) as any;
    const arr = obj?.[key];
    if (!Array.isArray(arr)) return [];
    const parsed = z.array(zChatMessage).safeParse(arr);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function setSiteChatTranscript(
  domain: string,
  data: ChatMessage[],
): Promise<void> {
  await storageSet(chatKey(domain), data);
}

export async function appendSiteChatMessage(
  domain: string,
  message: ChatMessage,
): Promise<void> {
  const cur = await getSiteChatTranscript(domain);
  await setSiteChatTranscript(domain, [...cur, message]);
}

export async function getThread(domain: string): Promise<ThreadMessage[]> {
  try {
    const key = threadKey(domain);
    const obj = (await browser.storage.local.get(key)) as any;
    const arr = obj?.[key];
    if (!Array.isArray(arr)) return [];
    const parsed = z.array(zThreadMessage).safeParse(arr);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveThread(
  domain: string,
  data: ThreadMessage[],
): Promise<void> {
  await storageSet(threadKey(domain), data);
}

export async function getModelOverrides(): Promise<ModelOverrides | null> {
  return storageGet(modelOverridesKey, zModelOverrides);
}

export async function setModelOverrides(value: ModelOverrides): Promise<void> {
  await storageSet(modelOverridesKey, value);
}

export async function removeModelOverrides(): Promise<void> {
  await storageRemove(modelOverridesKey);
}

export async function getCachedModelAvailability(): Promise<ModelAvailability | null> {
  return storageGet(modelAvailabilityKey, zModelAvailability);
}

export async function setCachedModelAvailability(
  value: ModelAvailability,
): Promise<void> {
  await storageSet(modelAvailabilityKey, value);
}

export async function getUiThemeName(): Promise<string | null> {
  try {
    const obj = (await browser.storage.local.get(uiThemeNameKey)) as any;
    const v = obj?.[uiThemeNameKey];
    return typeof v === "string" && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export async function setUiThemeName(name: string): Promise<void> {
  await storageSet(uiThemeNameKey, name);
}
