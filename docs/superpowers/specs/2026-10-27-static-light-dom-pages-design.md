# Static light-DOM pages for pk-doc-page and pk-master-detail-page (#1829, spike, no code)

Goal: a server-rendered, JS-optional site where `<pk-doc-page>` and `<pk-master-detail-page>` show slotted light-DOM content with no `load`/`config`.
Status: proposal for the owner. Sizes below are estimates, not measurements (nothing was built or run).

## 1. Current behaviour with no config

- `pk-doc-page` (core/pages/doc-page/doc-page.js): `connected()` runs `buildShell()` once, then `paint()` (lines 29-37, 47, 69). `buildShell` creates its own
  `pk-side-nav`, toggle button, `pk-toc`, title and body nodes and slots them into its shadow template (`nav`, `bar`, `aside` slots and the default slot inside
  `<article>`; doc-page.html). `paint()` reads `config.items` and `config.id`; with none, `items = []`, `id = null`, so `load(null, {})` (line 134) draws the empty
  home list. Host-written children are not read: the default slot shows the element's own `$body` and any host children would sit beside it, unmanaged.
- `pk-master-detail-page` (core/pages/master-detail-page/master-detail-page.js): `connected()` wires `list.load` to `this.load` (or `{ rows: [] }`) and calls `sync()`.
  With no config the list is empty, `recordId` is `''`, so `data-view="list"` and the "Select a record" empty state show. The only host slots are `badges` and `detail`
  (master-detail-page.html); `slot="detail"` is already forwarded, but nothing chooses between list and detail from light DOM.

## 2. Smallest design per page

Principle (STANDARDS, "Ownership and reactivity"): the host owns attributes and light-DOM children; the element owns its shadow tree. Static mode therefore
forwards slots and reads the host DOM; it never moves, wraps or rewrites host nodes.

### pk-doc-page
- Static mode when `config` is absent and the host has `[slot=nav]` (a list of real links) and article content (an element with an `id` in the default slot).
  `buildShell` skips creating `$nav` and `$body` when a host `[slot=nav]` exists; the shadow template already has the `nav` and default slots.
- Current item: the nav link with `aria-current="page"` (set by the server); else the link whose `href` equals `location.hash`, then `location.pathname`. A `hashchange`
  listener is added in `connected()` and removed in `disconnected()` (rule 2). The element never sets attributes on host nodes: highlighting is a shadow CSS rule,
  `::slotted(a[aria-current])`, and a shadow-side state attribute for the title.
- Pager and toc: `pk-toc for="#id"` needs a document-level id, so the element sets its own toc `for` from the host article id. The pager (`slot="prev"`/`next"` links the element creates in its own shadow-slotted nodes today) is
  computed from the order of the host nav links.
- No fetch; `load`/`loadItem` remain the hooks of the dynamic mode, unchanged.

### pk-master-detail-page
- Static mode: host `<section slot="master">` (a plain list of links or a table) and `<section slot="detail">` (a slot already). Add one `master` slot inside
  `part="master"` beside `pk-list-page`, hidden while empty. `data-view` is `detail` when the host marks the detail section `data-active` (server rendered) or when
  `location.hash` matches a master link.
- The element writes only its own shadow attributes (`data-view`); the host keeps real `<a href>` links, so each is a navigation or a hash change.
- `load`, `mountDetail` and `recordId` stay optional and behave exactly as today when set.

## 3. With JavaScript disabled

Shadow DOM needs JS. Plainly: without JS a custom element is an unknown inline element showing its light DOM unstyled (no shell, no layout). "Static" is
therefore defined as: content and links are readable and usable without JS, and with JS the page upgrades in place without a content jump.
- A rule on `:not(:defined)` improves the no-JS look: `pk-doc-page:not(:defined) { display: block }`, a readable measure, nav links stacked, the same for
  master-detail (`> [slot=master]`, `> [slot=detail]` stacked). The menu toggle and search are JS-only and stay so.
- Cost: about 250-350 bytes gzip for the two pages. The page layer is limited to 10 KB gzip and is not raised. Route the rules to an optional stylesheet
  (`static.css`) that a server-rendered site links; the page layer then grows by 0 bytes. This needs the optional-stylesheet route (see OWNER 3).
- Links work without JS because they are plain `<a href>`.

## 4. Size estimate (gzip, estimated, unmeasured)

| Part | Static mode adds | Offset (no ceiling is raised) |
| --- | --- | --- |
| doc-page.js | about 350 B (slot detection, hashchange, current link, pager from host links) | shorten `buildNav` and the empty-home branch (about 200 B); the rest moves to a lazy `js/static-pages.js` loaded only when a static host is found |
| doc-page.css | about 120 B (`::slotted(a[aria-current])`) | shorten existing selectors |
| master-detail-page.js | about 200 B | none needed (68 lines today) |
| optional static.css | about 300 B | outside the page layer and every element budget |

If a guard fails, the offset is made real in the same step or the logic moves entirely to the lazy module, which leaves the element bytes unchanged.

## 5. Independently shippable steps (each a 2-3 minute dev task)

1. `core/pages/doc-page/doc-page.js`: skip building `$nav` and `$body` when a host `[slot=nav]` exists (no change otherwise); test in `doc-page.test.mjs`.
2. `core/pages/doc-page/doc-page.js` and `doc-page.css`: current item from `aria-current`, then hash; `hashchange` in `connected()`/`disconnected()`; test.
3. `core/pages/doc-page/doc-page.js`: pager from host nav link order; toc `for` from the host article id; test.
4. `core/pages/master-detail-page/master-detail-page.html` and `.js`: `master` slot, `data-view` from `data-active` or hash; test.
5. Optional `static.css` with the `:not(:defined)` rules (waits for the optional-stylesheet route).
6. Gallery sample "static doc page", the skills workflow in `scripts/skills/plainkit-sdk/SKILL.md` (server-rendered docs recipe) and a browser case that the upgrade shifts nothing.
7. Blazor: no new parameter is planned, so only verify that no mapping change is needed.

## 6. Recommendation

Do steps 1-4 first (usable server-rendered content when JS runs, default look and bytes unchanged), then 6. Step 5 waits for the optional stylesheet route.
Static mode is additive: a page with `config` behaves as today and the existing doc-page and master-detail tests stay unchanged.

## Decisions for the owner

OWNER: Is "static" defined as "readable and linkable without JS, upgraded in place with JS" (recommended), or must the unstyled no-JS page also look laid out (needs the optional `static.css`)?
OWNER: Current-item precedence: server `aria-current`, then `location.hash`, then `location.pathname`; confirm, and confirm pathname matching is wanted for multi-page sites.
OWNER: Is an optional stylesheet route (a shipped, opt-in `.css` outside the 10 KB page layer) approved as a general mechanism? Briefs 1817 and 1818 are blocked on it: no such route exists on main (glass lives in tokens.css).
OWNER: May doc-page read a host-owned `[slot=nav]` and article id as a new documented contract, given the element never modifies those nodes?
