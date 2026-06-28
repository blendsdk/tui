import { defineConfig } from 'vitepress';

/**
 * VitePress configuration for the jsvision technical documentation set.
 *
 * The sidebar lists only the sections that actually exist (Library/SDK project
 * type): system overview, API reference, security, the ADR log, and the developer
 * guides. VitePress itself is intentionally NOT a project dependency — RD-10 keeps
 * the dependency surface to a single dev dep (esbuild). To preview locally, install
 * vitepress ad-hoc (`npx vitepress dev docs`); the markdown is VitePress-compatible.
 */
export default defineConfig({
  title: 'jsvision — Technical Documentation',
  description: 'Architecture documentation for the jsvision terminal UI foundation',

  themeConfig: {
    nav: [
      { text: 'Architecture', link: '/architecture/system-overview' },
      { text: 'Decisions', link: '/decisions/' },
      { text: 'Guides', link: '/guides/getting-started' },
    ],

    sidebar: [
      {
        text: 'Overview',
        items: [{ text: 'Introduction', link: '/' }],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'System Overview', link: '/architecture/system-overview' },
          { text: 'API Design & Reference', link: '/architecture/api-design' },
          { text: 'Security', link: '/architecture/security' },
        ],
      },
      {
        text: 'Decisions',
        items: [
          { text: 'Decision Log', link: '/decisions/' },
          { text: 'ADR-001: ESM-only, zero deps', link: '/decisions/ADR-001-esm-zero-dependency' },
          { text: 'ADR-002: Capability auto-config', link: '/decisions/ADR-002-capability-auto-config' },
          { text: 'ADR-003: Pure core, injectable seams', link: '/decisions/ADR-003-pure-core-injectable-seams' },
          { text: 'ADR-004: No node-pty', link: '/decisions/ADR-004-no-node-pty' },
          { text: 'ADR-005: Sanitize boundary', link: '/decisions/ADR-005-sanitize-boundary' },
          { text: 'ADR-006: Informational perf bench', link: '/decisions/ADR-006-informational-perf-bench' },
        ],
      },
      {
        text: 'Developer Guides',
        items: [
          { text: 'Getting Started', link: '/guides/getting-started' },
          { text: 'Development Workflow', link: '/guides/development' },
        ],
      },
    ],

    socialLinks: [],
  },
});
