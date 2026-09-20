// A small in-memory snapshot for the code-explorer demo: same shape as a snapshot.json (see js/code-explorer/providers.js).

const tabs = `// Tabs behaviour
export function nextTabIndex(current, count, key) {
    if (count === 0) return null;
    switch (key) {
        case 'ArrowRight': return (current + 1) % count;
        case 'ArrowLeft': return (current - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
}

export function scrollLeftFor(tabLeft, tabWidth, viewWidth, current, margin = 8) {
    if (tabLeft - margin < current) return Math.max(0, tabLeft - margin);
    const right = tabLeft + tabWidth + margin;
    return right > current + viewWidth ? right - viewWidth : current;
}
`;

const css = `.tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-border);
}

.tab.active {
    color: inherit;
    border-bottom-color: var(--color-accent);
}
`;

const tokens = `:root, [data-theme="dark"] {
    --color-bg: #1e1e1e;
    --color-text: #e8e8e8;
    --color-accent: #4a90e2;
}

[data-theme="light"] {
    --color-bg: #fafafa;
    --color-text: #1f2328;
    --color-accent: #1d4ed8;
}
`;

const readme = `# The SDK

Vanilla HTML, CSS and JS. No framework.

- tokens.css: every colour, size and shadow
- components/*.css: one file per control
- js/*.js: behaviour as ES modules
`;

export const SAMPLE_SNAPSHOT = {
    version: 1,
    generated: '2026-09-19T00:00:00Z',
    files: [
        { path: 'sdk/js/tabs.js', language: 'js', content: tabs, symbols: [{ kind: 'function', name: 'nextTabIndex', line: 2, depth: 0 }, { kind: 'function', name: 'scrollLeftFor', line: 13, depth: 0 }] },
        { path: 'sdk/components/tabs.css', language: 'css', content: css },
        { path: 'sdk/tokens.css', language: 'css', content: tokens },
        { path: 'README.md', language: 'plain', content: readme },
    ],
};
