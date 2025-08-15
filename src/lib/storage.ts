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
class StorageError extends Error {
  constructor(
    message: string,
    public operation: string,
    public key?: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

class StorageQuotaError extends StorageError {
  constructor(key?: string) {
    super("Storage quota exceeded", "write", key);
    this.name = "StorageQuotaError";
  }
}

class StorageUnavailableError extends StorageError {
  constructor() {
    super("Browser storage API unavailable", "access");
    this.name = "StorageUnavailableError";
  }
}

function sanitizeStorageKey(key: string): string {
  if (!key || key.length === 0) return key;

  const sanitized = key.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");

  const maxLength = 512;
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength);
  }

  return sanitized;
}

function validateStorageKey(key: string): boolean {
  const maxLength = 512;
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;

  if (!key || key.length === 0) return false;
  if (key.length > maxLength) return false;
  if (invalidChars.test(key)) return false;

  return true;
}

async function checkStorageAvailability(): Promise<boolean> {
  try {
    if (!browser?.storage?.local) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!browser?.storage?.local) return false;
    }

    const testKey = "__sitecn_storage_test__";
    const testValue = { timestamp: Date.now() };

    await browser.storage.local.set({ [testKey]: testValue });
    const result = await browser.storage.local.get(testKey);
    await browser.storage.local.remove(testKey);

    return result[testKey]?.timestamp === testValue.timestamp;
  } catch {
    return false;
  }
}

let storageAvailable: boolean | null = null;
let lastStorageCheck = 0;
const STORAGE_CHECK_TTL = 60000; // 1 minute

async function ensureStorageAvailable(): Promise<void> {
  const now = Date.now();

  if (storageAvailable !== null && now - lastStorageCheck < STORAGE_CHECK_TTL) {
    if (!storageAvailable) {
      throw new StorageUnavailableError();
    }
    return;
  }

  storageAvailable = await checkStorageAvailability();
  lastStorageCheck = now;

  if (!storageAvailable) {
    throw new StorageUnavailableError();
  }
}

async function storageGet<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const sanitizedKey = sanitizeStorageKey(key);
    if (!validateStorageKey(sanitizedKey)) {
      console.warn(
        `Invalid storage key format: ${key} (sanitized: ${sanitizedKey})`,
      );
      return null;
    }

    await ensureStorageAvailable();

    const obj = (await browser.storage.local.get(sanitizedKey)) as any;
    const raw = obj?.[sanitizedKey];
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof StorageError) {
      console.error(`Storage operation failed: ${error.message}`, {
        operation: error.operation,
        key: error.key,
        storageApiAvailable: !!browser?.storage?.local,
        context: "storageGet",
      });
    } else {
      console.error(`Unexpected storage error for key ${key}:`, error, {
        storageApiAvailable: !!browser?.storage?.local,
        context: "storageGet",
      });
    }
    return null;
  }
}

const pendingOperations = new Map<string, Promise<any>>();

async function storageSet<T>(key: string, value: T): Promise<void> {
  const sanitizedKey = sanitizeStorageKey(key);
  if (!validateStorageKey(sanitizedKey)) {
    throw new StorageError(
      `Invalid storage key format: ${key} (sanitized: ${sanitizedKey})`,
      "write",
      sanitizedKey,
    );
  }

  await ensureStorageAvailable();

  const operationKey = `set_${sanitizedKey}`;
  if (pendingOperations.has(operationKey)) {
    try {
      await pendingOperations.get(operationKey);
    } catch {
      // Continue with operation even if previous failed
    }
  }

  const operation = (async () => {
    try {
      const serialized = JSON.stringify({ [sanitizedKey]: value });
      const estimatedSize = new Blob([serialized]).size;

      const MAX_ITEM_SIZE = 1024 * 1024;
      if (estimatedSize > MAX_ITEM_SIZE) {
        console.warn(
          `Large storage write attempted for key ${key} (sanitized: ${sanitizedKey}): ${estimatedSize} bytes`,
        );
      }

      await browser.storage.local.set({ [sanitizedKey]: value });
    } catch (error: any) {
      if (error?.message?.includes("QUOTA_EXCEEDED")) {
        throw new StorageQuotaError(sanitizedKey);
      }

      if (error?.message?.includes("MAX_WRITE_OPERATIONS_PER_MINUTE")) {
        throw new StorageError("Rate limit exceeded", "write", sanitizedKey);
      }

      if (error?.message?.includes("MAX_ITEMS")) {
        throw new StorageError(
          "Maximum items limit exceeded",
          "write",
          sanitizedKey,
        );
      }

      throw new StorageError(
        `Write operation failed: ${error.message}`,
        "write",
        sanitizedKey,
      );
    }
  })();

  pendingOperations.set(operationKey, operation);

  try {
    await operation;
  } finally {
    pendingOperations.delete(operationKey);
  }
}

async function storageRemove(key: string): Promise<void> {
  try {
    const sanitizedKey = sanitizeStorageKey(key);
    if (!validateStorageKey(sanitizedKey)) {
      throw new StorageError(
        `Invalid storage key format: ${key} (sanitized: ${sanitizedKey})`,
        "remove",
        sanitizedKey,
      );
    }

    await ensureStorageAvailable();

    const operationKey = `remove_${sanitizedKey}`;
    if (pendingOperations.has(operationKey)) {
      try {
        await pendingOperations.get(operationKey);
      } catch {
        // Continue with operation even if previous failed
      }
    }

    const operation = browser.storage.local.remove(sanitizedKey);

    pendingOperations.set(operationKey, operation);

    try {
      await operation;
    } finally {
      pendingOperations.delete(operationKey);
    }
  } catch (error) {
    if (error instanceof StorageError) {
      console.error(`Storage remove failed: ${error.message}`, {
        operation: error.operation,
        key: error.key,
      });
      throw error;
    } else {
      const sanitizedKey = sanitizeStorageKey(key);
      console.error(
        `Unexpected storage remove error for key ${key} (sanitized: ${sanitizedKey}):`,
        error,
      );
      throw new StorageError(`Remove operation failed`, "remove", sanitizedKey);
    }
  }
}

export { StorageError, StorageQuotaError, StorageUnavailableError };

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

/**
 * Safe storage operation wrapper that handles common sidepanel initialization issues
 */
export async function withStorageRetry<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string = "storage operation",
): Promise<T> {
  let retries = 3;
  let delay = 100;

  while (retries > 0) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StorageUnavailableError && retries > 1) {
        console.warn(
          `${operationName} failed, retrying in ${delay}ms...`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      console.error(`${operationName} failed after retries:`, error);
      return fallback;
    }
  }

  return fallback;
}
