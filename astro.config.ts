import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
  image: {
    responsiveStyles: true,
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Source Sans 3",
      cssVariable: "--font-sans",
      weights: [400, 600],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["system-ui", "sans-serif"],
      display: "swap",
      optimizedFallbacks: true,
    },
  ],
});
