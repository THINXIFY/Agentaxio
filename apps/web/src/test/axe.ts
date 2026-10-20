import { configureAxe } from "vitest-axe";

/**
 * axe configured for jsdom. `color-contrast` is disabled because jsdom has no layout/canvas to compute it;
 * palette contrast is enforced separately by src/styles/tokens.contrast.test.ts.
 */
export const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
