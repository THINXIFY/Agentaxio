import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge needs to know our custom display font sizes so they conflict with text-sm etc., not text colours. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-hero",
            "display-2xl",
            "display-xl",
            "display-lg",
            "display-md",
            "display-sm",
          ],
        },
      ],
      shadow: [{ shadow: ["raised", "floating", "hero", "glow"] }],
      rounded: [{ rounded: ["control", "card", "panel"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
