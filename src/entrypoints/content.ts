import { MessageType, type StyleSnapshot } from "@/entrypoints/types";
import { browser } from "wxt/browser";

class ContentScriptError extends Error {
  constructor(
    message: string,
    public operation: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ContentScriptError";
  }
}

class CSPViolationError extends ContentScriptError {
  constructor(operation: string, details?: any) {
    super("Content Security Policy violation", operation, details);
    this.name = "CSPViolationError";
  }
}

class DOMNotReadyError extends ContentScriptError {
  constructor() {
    super("DOM not ready for analysis", "dom_access");
    this.name = "DOMNotReadyError";
  }
}

class InvalidCSSError extends ContentScriptError {
  constructor(cssText: string, parseError: any) {
    super("Invalid CSS encountered during parsing", "css_parse", {
      cssText: cssText.substring(0, 100),
      parseError,
    });
    this.name = "InvalidCSSError";
  }
}

function isDocumentReady(): boolean {
  return (
    document.readyState === "complete" ||
    (document.readyState === "interactive" && document.body != null)
  );
}

async function waitForDocumentReady(timeoutMs: number = 5000): Promise<void> {
  if (isDocumentReady()) return;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new DOMNotReadyError());
    }, timeoutMs);

    const checkReady = () => {
      if (isDocumentReady()) {
        clearTimeout(timeout);
        document.removeEventListener("DOMContentLoaded", checkReady);
        document.removeEventListener("readystatechange", checkReady);
        resolve();
      }
    };

    document.addEventListener("DOMContentLoaded", checkReady);
    document.addEventListener("readystatechange", checkReady);
  });
}

function detectCSPViolation(error: any): boolean {
  const message = error?.message?.toLowerCase() || "";
  return (
    message.includes("content security policy") ||
    message.includes("csp") ||
    message.includes("unsafe-eval") ||
    message.includes("unsafe-inline")
  );
}

declare function parseCssText(
  cssText: string,
  cssVariables: Record<string, string>,
  colors: Set<string>,
  fontFamilies: Set<string>,
  borderRadiusSamples: Set<string>,
  shadowSamples: Set<string>,
): void;

declare function extractColorsFromStyle(
  style: CSSStyleDeclaration,
  colors: Set<string>,
): void;

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    console.log("Content script loaded for:", window.location.href);

    let isConnected = true;

    const testConnection = async () => {
      try {
        await browser.runtime.sendMessage({
          messageType: "ping",
          payload: { url: window.location.href },
        });
        return true;
      } catch (error) {
        console.warn("Content script connection test failed:", error);
        isConnected = false;
        return false;
      }
    };

    browser.runtime.onMessage.addListener(
      async (message: any, sender, sendResponse) => {
        console.log("Content script received message:", message?.messageType);

        if (message?.messageType === MessageType.extractSiteSnapshot) {
          const domain = message?.payload?.domain;
          if (!domain) {
            console.warn("No domain provided for snapshot extraction");
            return;
          }

          try {
            if (!isConnected) {
              const connected = await testConnection();
              if (!connected) {
                throw new ContentScriptError(
                  "Content script connection lost",
                  "connection",
                );
              }
            }

            console.log(`Starting snapshot extraction for domain: ${domain}`);
            const snapshot = await extractStyleSnapshot(domain);
            console.log("Snapshot extraction completed successfully");

            await browser.runtime.sendMessage({
              messageType: MessageType.siteSnapshotExtracted,
              payload: { domain, snapshot },
            });
          } catch (error) {
            console.error("Snapshot extraction failed:", error);

            const errorDetails = {
              domain,
              snapshot: null,
              error: error instanceof Error ? error.message : String(error),
              errorType:
                error instanceof ContentScriptError
                  ? error.name
                  : "UnknownError",
              url: window.location.href,
              readyState: document.readyState,
              timestamp: Date.now(),
            };

            try {
              await browser.runtime.sendMessage({
                messageType: MessageType.siteSnapshotExtracted,
                payload: errorDetails,
              });
            } catch (sendError) {
              console.error(
                "Failed to send error message to background:",
                sendError,
              );
              isConnected = false;
            }
          }
        }

        if (message?.messageType === "ping") {
          try {
            console.log("Ping received from background script");
          } catch (error) {
            console.warn("Failed to handle ping:", error);
          }
          return true;
        }

        return true;
      },
    );

    async function extractStyleSnapshot(
      domain: string,
    ): Promise<StyleSnapshot> {
      try {
        await waitForDocumentReady(5000);

        if (!document.documentElement || !document.head) {
          throw new DOMNotReadyError();
        }

        const stylesheetData = await extractFromStyleSheets(true);
        const computedData = extractComputedStyles();
        const shadowData = extractFromShadowRoots();

        const allColors = [
          ...stylesheetData.colors,
          ...computedData.paletteSamples,
          ...shadowData.colors,
        ];
        const normalizedColors = normalizeColors(allColors);

        return {
          domain,
          cssVariables: {
            ...stylesheetData.cssVariables,
            ...computedData.cssVariables,
            ...shadowData.cssVariables,
          },
          computed: {
            bodyBg: computedData.computed.bodyBg,
            bodyColor: computedData.computed.bodyColor,
            linkColor: computedData.computed.linkColor,
            headingsColor: computedData.computed.headingsColor,
            borderRadiusSamples: [
              ...stylesheetData.borderRadiusSamples,
              ...computedData.computed.borderRadiusSamples,
            ].filter((value, index, self) => self.indexOf(value) === index),
            shadowSamples: [
              ...stylesheetData.shadowSamples,
              ...computedData.computed.shadowSamples,
            ].filter((value, index, self) => self.indexOf(value) === index),
          },
          fonts: {
            families: [
              ...stylesheetData.fontFamilies,
              ...computedData.fonts.families,
              ...shadowData.fontFamilies,
            ].filter((value, index, self) => self.indexOf(value) === index),
          },
          paletteSamples: normalizedColors,
        };
      } catch (error) {
        if (error instanceof ContentScriptError) {
          throw error;
        }

        if (detectCSPViolation(error)) {
          throw new CSPViolationError("style_extraction", error);
        }

        throw new ContentScriptError(
          `Style extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          "extraction",
          error,
        );
      }
    }

    function extractFromShadowRoots(): {
      cssVariables: Record<string, string>;
      colors: string[];
      fontFamilies: string[];
    } {
      const result = {
        cssVariables: {} as Record<string, string>,
        colors: [] as string[],
        fontFamilies: [] as string[],
      };

      try {
        const walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              return (node as Element).shadowRoot
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
            },
          },
        );

        let node;
        while ((node = walker.nextNode())) {
          const element = node as Element;
          const shadowRoot = element.shadowRoot;

          if (shadowRoot) {
            const styles = shadowRoot.querySelectorAll("style");
            styles.forEach((styleElement) => {
              try {
                const cssText = styleElement.textContent || "";
                parseCssText(
                  cssText,
                  result.cssVariables,
                  new Set(result.colors),
                  new Set(result.fontFamilies),
                  new Set(),
                  new Set(),
                );
              } catch (error) {
                console.warn("Failed to parse shadow DOM style:", error);
              }
            });

            if (shadowRoot.adoptedStyleSheets) {
              shadowRoot.adoptedStyleSheets.forEach((sheet) => {
                try {
                  if (sheet.cssRules) {
                    for (let i = 0; i < sheet.cssRules.length; i++) {
                      const rule = sheet.cssRules[i];
                      if (rule instanceof CSSStyleRule) {
                        const style = rule.style;
                        for (let j = 0; j < style.length; j++) {
                          const property = style[j];
                          if (property.startsWith("--")) {
                            const value = style
                              .getPropertyValue(property)
                              .trim();
                            if (value) result.cssVariables[property] = value;
                          }
                        }
                        extractColorsFromStyle(style, new Set(result.colors));
                      }
                    }
                  }
                } catch (error) {
                  console.warn("Failed to access adopted stylesheet:", error);
                }
              });
            }
          }
        }
      } catch (error) {
        console.warn("Shadow DOM extraction failed:", error);
      }

      return result;
    }

    async function extractFromStyleSheets(includeOnlyUsed: boolean = false) {
      const cssVariables: Record<string, string> = {};
      const colors = new Set<string>();
      const fontFamilies = new Set<string>();
      const borderRadiusSamples = new Set<string>();
      const shadowSamples = new Set<string>();
      const corsBlockedUrls: string[] = [];

      let usedSelectors: Set<string> | null = null;
      if (includeOnlyUsed) {
        usedSelectors = getUsedSelectors();
      }

      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];

        try {
          if (!sheet.cssRules) continue;

          for (let j = 0; j < sheet.cssRules.length; j++) {
            const rule = sheet.cssRules[j];

            if (rule instanceof CSSStyleRule) {
              if (
                usedSelectors &&
                !isSelectorUsed(rule.selectorText, usedSelectors)
              ) {
                continue;
              }

              const style = rule.style;

              for (let k = 0; k < style.length; k++) {
                const property = style[k];
                if (property.startsWith("--")) {
                  const value = style.getPropertyValue(property).trim();
                  if (value) cssVariables[property] = value;
                }
              }

              extractColorsFromStyle(style, colors);

              const fontFamily = style.fontFamily;
              if (fontFamily) {
                fontFamily.split(",").forEach((font) => {
                  const cleaned = font.trim().replace(/['"]/g, "");
                  if (
                    cleaned &&
                    !cleaned.includes("system") &&
                    !cleaned.includes("ui-")
                  ) {
                    fontFamilies.add(cleaned);
                  }
                });
              }

              const borderRadius = style.borderRadius;
              if (
                borderRadius &&
                borderRadius !== "0px" &&
                borderRadius !== "0"
              ) {
                borderRadiusSamples.add(borderRadius);
              }

              const boxShadow = style.boxShadow;
              if (boxShadow && boxShadow !== "none") {
                shadowSamples.add(boxShadow);
              }
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "SecurityError") {
            const href = sheet.href;
            if (href && !corsBlockedUrls.includes(href)) {
              corsBlockedUrls.push(href);
            }
          }
        }
      }

      if (corsBlockedUrls.length > 0) {
        try {
          const response = await browser.runtime.sendMessage({
            messageType: MessageType.fetchCorsStylesheets,
            payload: { urls: corsBlockedUrls },
          });

          if (response?.corsStylesheets) {
            response.corsStylesheets.forEach((result: any) => {
              if (result.success && result.css) {
                parseCssText(
                  result.css,
                  cssVariables,
                  colors,
                  fontFamilies,
                  borderRadiusSamples,
                  shadowSamples,
                );
              }
            });
          }
        } catch (error) {
          console.warn("Failed to fetch CORS stylesheets:", error);
        }
      }

      return {
        cssVariables,
        colors: Array.from(colors),
        fontFamilies: Array.from(fontFamilies),
        borderRadiusSamples: Array.from(borderRadiusSamples),
        shadowSamples: Array.from(shadowSamples),
      };
    }

    function extractColorsFromStyle(
      style: CSSStyleDeclaration,
      colors: Set<string>,
    ) {
      const colorProperties = [
        "color",
        "backgroundColor",
        "borderColor",
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor",
        "outlineColor",
        "textDecorationColor",
        "columnRuleColor",
        "fill",
        "stroke",
      ];

      colorProperties.forEach((prop) => {
        const value = style.getPropertyValue(prop);
        if (
          value &&
          value !== "transparent" &&
          value !== "rgba(0, 0, 0, 0)" &&
          value !== "initial" &&
          value !== "inherit"
        ) {
          colors.add(value);
        }
      });

      const complexProperties = [
        "background",
        "border",
        "boxShadow",
        "textShadow",
      ];
      complexProperties.forEach((prop) => {
        const value = style.getPropertyValue(prop);
        if (value) {
          const colorMatches = value.match(/(?:rgb|hsl|#)[^;,\s)]+/g);
          if (colorMatches) {
            colorMatches.forEach((color) => colors.add(color.trim()));
          }
        }
      });
    }

    function parseCssText(
      cssText: string,
      cssVariables: Record<string, string>,
      colors: Set<string>,
      fontFamilies: Set<string>,
      borderRadiusSamples: Set<string>,
      shadowSamples: Set<string>,
    ) {
      if (!cssText || typeof cssText !== "string") return;

      try {
        if (cssText.includes("<script") || cssText.includes("javascript:")) {
          throw new InvalidCSSError(cssText, "Potential XSS content detected");
        }

        const MAX_CSS_SIZE = 10 * 1024 * 1024;
        if (cssText.length > MAX_CSS_SIZE) {
          console.warn(`Large CSS text truncated: ${cssText.length} bytes`);
          cssText = cssText.substring(0, MAX_CSS_SIZE);
        }
      } catch (error) {
        if (error instanceof InvalidCSSError) {
          throw error;
        }
        throw new InvalidCSSError(cssText, error);
      }
      const variableMatches = cssText.match(/--[a-zA-Z0-9-]+\s*:\s*[^;]+/g);
      if (variableMatches) {
        variableMatches.forEach((match) => {
          const [property, value] = match.split(":").map((s) => s.trim());
          if (property && value) {
            cssVariables[property] = value;
          }
        });
      }

      const colorMatches = cssText.match(
        /(?:#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\))/g,
      );
      if (colorMatches) {
        colorMatches.forEach((color) => colors.add(color.trim()));
      }

      const fontMatches = cssText.match(/font-family\s*:\s*[^;]+/gi);
      if (fontMatches) {
        fontMatches.forEach((match) => {
          const fontFamily = match
            .replace(/font-family\s*:\s*/i, "")
            .replace(/;.*$/, "");
          fontFamily.split(",").forEach((font) => {
            const cleaned = font.trim().replace(/['"]/g, "");
            if (
              cleaned &&
              !cleaned.includes("system") &&
              !cleaned.includes("ui-")
            ) {
              fontFamilies.add(cleaned);
            }
          });
        });
      }

      const radiusMatches = cssText.match(/border-radius\s*:\s*[^;]+/gi);
      if (radiusMatches) {
        radiusMatches.forEach((match) => {
          const radius = match
            .replace(/border-radius\s*:\s*/i, "")
            .replace(/;.*$/, "")
            .trim();
          if (radius && radius !== "0" && radius !== "0px") {
            borderRadiusSamples.add(radius);
          }
        });
      }

      const shadowMatches = cssText.match(/box-shadow\s*:\s*[^;]+/gi);
      if (shadowMatches) {
        shadowMatches.forEach((match) => {
          const shadow = match
            .replace(/box-shadow\s*:\s*/i, "")
            .replace(/;.*$/, "")
            .trim();
          if (shadow && shadow !== "none") {
            shadowSamples.add(shadow);
          }
        });
      }
    }

    function extractComputedStyles() {
      const cssVariables: Record<string, string> = {};
      const rootStyles = getComputedStyle(document.documentElement);

      for (let i = 0; i < rootStyles.length; i++) {
        const property = rootStyles[i];
        if (property.startsWith("--")) {
          const value = rootStyles.getPropertyValue(property).trim();
          if (value) {
            cssVariables[property] = value;
          }
        }
      }

      const bodyStyles = getComputedStyle(document.body);
      const linkElement =
        document.querySelector("a") || document.createElement("a");
      const linkStyles = getComputedStyle(linkElement);
      const headingElement =
        document.querySelector("h1, h2, h3, h4, h5, h6") ||
        document.createElement("h1");
      const headingStyles = getComputedStyle(headingElement);

      const borderRadiusSamples: string[] = [];
      const shadowSamples: string[] = [];
      const paletteSamples: string[] = [];
      const fontFamilies = new Set<string>();

      const interactiveElements = document.querySelectorAll(
        'button, input, .btn, .card, [class*="button"], [class*="card"]',
      );

      for (let i = 0; i < interactiveElements.length; i++) {
        const el = interactiveElements[i] as HTMLElement;
        const styles = getComputedStyle(el);

        const radius = styles.borderRadius;
        if (
          radius &&
          radius !== "0px" &&
          !borderRadiusSamples.includes(radius)
        ) {
          borderRadiusSamples.push(radius);
        }

        const shadow = styles.boxShadow;
        if (shadow && shadow !== "none" && !shadowSamples.includes(shadow)) {
          shadowSamples.push(shadow);
        }

        [styles.color, styles.backgroundColor, styles.borderColor].forEach(
          (color) => {
            if (
              color &&
              color !== "rgba(0, 0, 0, 0)" &&
              color !== "transparent" &&
              !paletteSamples.includes(color)
            ) {
              paletteSamples.push(color);
            }
          },
        );

        const fontFamily = styles.fontFamily;
        if (fontFamily) {
          fontFamily.split(",").forEach((font) => {
            const cleaned = font.trim().replace(/['"]/g, "");
            if (
              cleaned &&
              !cleaned.includes("system") &&
              !cleaned.includes("ui-")
            ) {
              fontFamilies.add(cleaned);
            }
          });
        }
      }

      return {
        cssVariables,
        computed: {
          bodyBg: bodyStyles.backgroundColor || "#ffffff",
          bodyColor: bodyStyles.color || "#000000",
          linkColor: linkStyles.color || "#0066cc",
          headingsColor: headingStyles.color || bodyStyles.color || "#000000",
          borderRadiusSamples,
          shadowSamples,
        },
        fonts: {
          families: Array.from(fontFamilies),
        },
        paletteSamples,
      };
    }

    function getUsedSelectors(): Set<string> {
      const usedSelectors = new Set<string>();
      const processedSelectors = new Set<string>();
      const MAX_SELECTOR_CHECKS = 10000;
      let selectorCount = 0;

      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
          if (!sheet.cssRules) continue;

          for (let j = 0; j < sheet.cssRules.length; j++) {
            const rule = sheet.cssRules[j];
            if (rule instanceof CSSStyleRule) {
              const selector = rule.selectorText;

              if (
                processedSelectors.has(selector) ||
                selectorCount >= MAX_SELECTOR_CHECKS
              ) {
                continue;
              }

              processedSelectors.add(selector);
              selectorCount++;

              try {
                if (
                  isValidSelector(selector) &&
                  document.querySelector(selector)
                ) {
                  usedSelectors.add(selector);
                }
              } catch (error) {
                // Invalid selector or querySelector failed
                console.debug(`Selector validation failed: ${selector}`, error);
              }
            }
          }
        } catch (error) {
          // Stylesheet access failed (likely CORS)
          console.debug(`Stylesheet access failed for sheet ${i}:`, error);
        }
      }

      return usedSelectors;
    }

    function isValidSelector(selector: string): boolean {
      if (!selector || typeof selector !== "string") return false;

      const problematicPatterns = [
        /^\s*$/, // Empty or whitespace only
        /[@{}]/, // Contains @ rules or braces
        /^\d/, // Starts with digit (invalid CSS selector)
        /[<>]/, // Contains invalid characters
      ];

      for (const pattern of problematicPatterns) {
        if (pattern.test(selector)) return false;
      }

      if (selector.length > 1000) return false;

      return true;
    }

    function isSelectorUsed(
      selectorText: string,
      usedSelectors: Set<string>,
    ): boolean {
      if (!selectorText) return false;

      if (usedSelectors.has(selectorText)) return true;

      if (selectorText.includes(",")) {
        const parts = selectorText.split(",").map((s) => s.trim());
        return parts.some((part) => usedSelectors.has(part));
      }

      return false;
    }

    function normalizeColors(colors: string[]): string[] {
      const normalizedColors = new Set<string>();

      colors.forEach((color) => {
        const normalized = normalizeColor(color);
        if (normalized) {
          normalizedColors.add(normalized);
        }
      });

      return Array.from(normalizedColors);
    }

    function normalizeColor(color: string): string | null {
      if (
        !color ||
        color === "transparent" ||
        color === "inherit" ||
        color === "initial"
      ) {
        return null;
      }

      const div = document.createElement("div");
      div.style.color = color;
      document.body.appendChild(div);

      const computedColor = getComputedStyle(div).color;
      document.body.removeChild(div);

      if (computedColor.startsWith("rgb")) {
        return rgbToHex(computedColor);
      }

      if (computedColor.startsWith("#")) {
        return computedColor.toUpperCase();
      }

      return computedColor;
    }

    function rgbToHex(rgb: string): string {
      const match = rgb.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
      );
      if (!match) return rgb;

      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const a = match[4] ? parseFloat(match[4]) : 1;

      if (a < 1) {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }

      const toHex = (n: number) =>
        n.toString(16).padStart(2, "0").toUpperCase();
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  },
});
