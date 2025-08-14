/**
 * Message types for extension communication between different parts of the extension
 */
export enum MessageType {
  // Extension UI interactions
  clickExtIcon = "clickExtIcon", // payload: {}
  changeTheme = "changeTheme", // payload: { theme: "light" | "dark" }
  changeUiTheme = "changeUiTheme", // payload: { name: string }

  // Site CSS theming lifecycle
  setSiteCss = "setSiteCss", // payload: { domain: string, css: string }
  siteCssPreview = "siteCssPreview", // payload: { domain: string, css: string }
  enableSiteCss = "enableSiteCss", // payload: { domain: string }
  disableSiteCss = "disableSiteCss", // payload: { domain: string }
  requestSiteCssStatus = "requestSiteCssStatus", // payload: { domain: string }
  siteCssStatus = "siteCssStatus", // payload: { domain: string, enabled: boolean, hasCss: boolean }
  extractSiteSnapshot = "extractSiteSnapshot", // payload: { domain: string }
  generateSiteCss = "generateSiteCss", // payload: { domain: string, snapshot?: StyleSnapshot, userText?: string }
  siteCssGenerated = "siteCssGenerated", // payload: { domain: string, css: string, themeJson?: ThemeJson }
  siteSnapshotExtracted = "siteSnapshotExtracted", // payload: { domain: string, snapshot: StyleSnapshot }

  // Theme analysis (detailed, non-injection)
  analyzeSiteStyles = "analyzeSiteStyles", // payload: { domain: string, baseThemeName?: string, notes?: string, snapshot?: StyleSnapshot }
  siteAnalysis = "siteAnalysis", // payload: { domain: string, analysis: string, css: string, themeJson?: ThemeJson }

  // Chat and AI model management
  chatPrompt = "chatPrompt", // payload: { sessionId: string, messages: ChatMessage[], domain: string }
  chatResponse = "chatResponse", // payload: { sessionId: string, message: ChatMessage, domain: string }
  requestModelStatus = "requestModelStatus", // payload: {}
  modelStatus = "modelStatus", // payload: { availability: "unavailable" | "downloadable" | "downloading" | "available" }
  requestActiveDomain = "requestActiveDomain", // payload: {}
  activeDomain = "activeDomain", // payload: { domain: string }

  // Site chat storage
  appendSiteChat = "appendSiteChat", // payload: { domain: string, message: ChatMessage }
  requestSiteChat = "requestSiteChat", // payload: { domain: string }
  siteChat = "siteChat", // payload: { domain: string, messages: ChatMessage[] }

  // Sidepanel management
  sidepanelSubscribe = "sidepanelSubscribe", // payload: { id: string }
  sidepanelUnsubscribe = "sidepanelUnsubscribe", // payload: { id: string }
}

/**
 * Identifies which part of the extension sent the message
 */
export enum MessageFrom {
  contentScript = "contentScript",
  background = "background",
  popUp = "popUp",
  sidePanel = "sidePanel",
}

/**
 * Base class for all extension messages with optional content and payload
 */
class ExtMessage {
  content?: string;
  from?: MessageFrom;
  // Optional structured data for advanced messages
  payload?: any;

  constructor(messageType: MessageType) {
    this.messageType = messageType;
  }

  messageType: MessageType;
}

export default ExtMessage;

/**
 * SiteCN operation modes for generating/analyzing CSS themes
 */
export enum SitecnMode {
  BASE_CSS = "BASE_CSS",
  THEME_CSS = "THEME_CSS",
  ANALYZE_CSS = "ANALYZE_CSS",
}

// -------------- Site theming & AI types --------------

/**
 * Theme mode options for site theming (light, dark, or both)
 */
export type SiteThemeMode = "light" | "dark" | "both";

/**
 * Font family configuration for themes
 */
export interface ThemeFonts {
  sans: string;
  serif: string;
  mono: string;
}

/**
 * Brand color configuration for themes (all colors in HEX format)
 */
export interface ThemeBrand {
  primary: string;
  secondary: string;
  accent: string;
  ring: string;
}

/**
 * Surface color configuration for UI elements
 */
export interface ThemeSurfaces {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
}

/**
 * Complete theme tokens for a specific color mode
 */
export interface ThemeModeTokens {
  brand: ThemeBrand;
  surfaces: ThemeSurfaces;
  radius: string;
  shadow: string;
}

/**
 * Complete theme configuration with metadata and mode-specific tokens
 */
export interface ThemeJson {
  meta: {
    domain: string;
    generatedAt: string; // ISO-8601
    fonts: ThemeFonts;
    notes?: string;
  };
  light?: ThemeModeTokens;
  dark?: ThemeModeTokens;
}

/**
 * Snapshot of site's current visual style for theme generation
 */
export interface StyleSnapshot {
  domain: string;
  cssVariables: Record<string, string>;
  computed: {
    bodyBg: string;
    bodyColor: string;
    linkColor: string;
    headingsColor: string;
    borderRadiusSamples: string[];
    shadowSamples: string[];
  };
  fonts: { families: string[] };
  paletteSamples: string[];
}

/**
 * User preferences for theme generation process
 */
export interface GenerateThemePreferences {
  baseTheme?: ThemeJson;
  mode?: SiteThemeMode;
  aggressive?: boolean;
  requestedChanges?: string;
  fontPolicy?: "keep-site" | "google-fonts";
}

/**
 * Complete request for theme generation
 */
export interface GenerateThemeRequest {
  domain: string;
  snapshot: StyleSnapshot;
  preferences?: GenerateThemePreferences;
  baseThemeName?: string;
}

/**
 * Stored theme entry for a specific site
 */
export interface SiteThemeEntry {
  enabled: boolean;
  css?: string;
  themeJson?: ThemeJson;
  aggressive?: boolean;
  mode?: SiteThemeMode;
  updatedAt?: string;
}

/**
 * Available roles for chat messages
 */
export type ChatRole = "system" | "user" | "assistant";

/**
 * Individual chat message with role and content
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Chat request payload for AI processing
 */
export interface ChatRequest {
  sessionId: string;
  messages: ChatMessage[];
}

/**
 * AI response to chat request
 */
export interface ChatResponse {
  sessionId: string;
  message: ChatMessage;
}
