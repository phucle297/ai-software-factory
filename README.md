# Phúc Lê

Personal portfolio site. The factory operating spec that used to live at the repository root is in [docs/factory/README.md](docs/factory/README.md), with onboarding in [docs/factory/PROJECT_ONBOARDING.md](docs/factory/PROJECT_ONBOARDING.md).

## Stack

- [Astro](https://astro.build/) 7, static output, TypeScript
- [Three.js](https://threejs.org/) for one scene, loaded in its own chunk when that section is near the viewport
- [Motion](https://motion.dev/) `motion/mini` for one entrance animation
- ESLint and Prettier, run locally

Astro renders the page to HTML. The first script is the entrance animation. The scene is a separate chunk, loaded when that section is near the viewport. Both effects check `prefers-reduced-motion: reduce` and leave a still page when that is set. The typeface is Source Sans 3 through Astro’s font API (`font-display: swap`, woff2, no preload). The mark is processed with `astro:assets`.

### Why this stack

Compared on 11 November 2026:

| Option                                                                  | What you pay for                                                                                 | Fit for this site                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Astro 7.4.11 (7.0.0 on 22 June 2026)                                    | HTML by default. Islands load their own script.                                                  | Chosen. A portfolio is mostly static, with a few heavy islands. |
| Next.js 16.4.6 (9 November 2026)                                        | Server Components stay off the client, but a 3D island still pulls React plus React Three Fiber. | Strong app framework. Extra runtime for a content page.         |
| SvelteKit 3.2.0 (10 November 2026) with Threlte 8.7.0 (2 November 2026) | Small UI runtime. Threlte still asks you to keep `three` bundled for SSR.                        | Good, and it ties 3D to Svelte.                                 |

3D is Three.js 0.187.0 (30 October 2026), dynamically imported. React Three Fiber 9.8.2 would also load React 19. Threlte would lock the scene to Svelte. One mesh does not need either wrapper. The Three.js package is about 186 kB gzipped ([Bundlephobia](https://bundlephobia.com/package/three@0.187.0), measured for 0.187.0), so it stays off the first load.

Animation is Motion’s mini `animate()` (about 3.2 kB, [Motion quick start](https://motion.dev/docs/quick-start), package 14.12.0 on 10 November 2026). GSAP 3.15.1 is about 27.4 kB gzipped for the core ([Bundlephobia](https://bundlephobia.com/package/gsap@3.15.1)) and its [standard license](https://gsap.com/community/standard-license/) (effective 30 April 2025, modified 30 May 2025) is free for normal sites but closed-source. Lenis 1.3.27 is about 5.5 kB gzipped and honors reduced motion, but it moves wheel scrolling onto the main thread ([Motion’s Lenis notes](https://motion.dev/docs/lenis)). That waits until a scene actually needs scroll sync.

Sources: [Astro islands](https://docs.astro.build/en/concepts/islands/), [client directives](https://docs.astro.build/en/reference/directives-reference/) (`client:visible` is the same idea as the manual observer used here), [Astro fonts](https://docs.astro.build/en/guides/fonts/) and [images](https://docs.astro.build/en/guides/images/), [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist), [Threlte getting started](https://threlte.vercel.app/docs/getting-started). Versions are the `latest` tags on the npm registry that day.

## Layout

```text
docs/factory/          factory spec (moved, unchanged except for location)
public/                favicon and robots.txt
src/assets/            images optimized at build time
src/components/        Hero and the 3D study
src/layouts/           document shell
src/pages/             routes. Home is src/pages/index.astro
src/scripts/           client TypeScript (entrance, scene)
src/styles/            global CSS
```

## Scripts

Requirements: Node.js 22.23.4 or newer (Astro 7.4.11’s engine range).

```bash
npm install
npm run dev       # http://localhost:4321
npm run build
npm run preview   # serve dist/
npm run check     # astro check
npm run lint
npm run format
```

No CI workflow is part of this foundation.
