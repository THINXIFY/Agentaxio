/**
 * Values for <meta name="theme-color"> (browser chrome tint). Browsers cannot read CSS variables here, so these
 * mirror --background in styles/tokens.css. This is the ONLY file outside tokens.css allowed to hold hex colours;
 * update it together with the tokens when re-branding.
 */
export const THEME_COLOR = {
  light: "#f5f4fa",
  dark: "#06050c",
} as const;
