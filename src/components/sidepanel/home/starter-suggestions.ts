export const DEFAULT_STARTER_SUGGESTIONS: string[] = [
  "Create a retro terminal UI: green phosphor glow and scanlines...",
  "Craft a monochrome manga look with bold inking and halftones...",
  "Design a minimal Ghibli-inspired theme with airy type and pastels...",
  "Use warm beige surfaces with muted teal accents and calm tones...",
  "Make a dark mode with electric purple highlights and soft glows...",
  "Build a newspaper monochrome theme with strong borders and serifs...",
  "Create a pastel candy shop palette with rounded corners and badges...",
  "Adapt a Solarized palette to all components and interaction states...",
  "Design a Nord variant with crisp contrast and cool subdued accents...",
  "Use city pop sunset gradients for primaries, headers, and buttons...",
  "Ensure a high-contrast, accessibility-first palette meeting WCAG AA...",
  "Create a cyberpunk theme: neon accents and subtle interactive glow...",
  "Design forest green backgrounds with cream foreground and moss highlights...",
  "Apply Material 3 surfaces with balanced elevation, outlines, and tones...",
  "Tune a Dracula-like dark palette for strong readability and focus...",
  "Build a minimal grayscale interface with a single restrained accent...",
  "Create an academic Notion-like theme with roomy spacing and clarity...",
  "Use paper white backgrounds, ink black text, with slight sepia warmth...",
  "Recreate a retro Macintosh platinum look with crisp bevels and shadows...",
  "Feature an electric blue primary on slate surfaces and cool neutrals...",
  "Design warm autumn oranges and browns with earthy supporting tones...",
  "Compose ocean blues with a bright coral accent and layered depth...",
  "Create a sleek SaaS dashboard: neutrals, subtle dividers, clean charts...",
  "Use muted desert sand base with turquoise accents and sunbleached grays...",
];

export function sampleSuggestions(all: string[], n: number): string[] {
  const copy = [...all];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const count = Math.max(0, Math.min(n, copy.length));
  return copy.slice(0, count);
}
