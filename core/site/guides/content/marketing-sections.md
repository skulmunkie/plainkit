---
title: Marketing sections
order: 13
summary: A testimonial, a logo strip, a contact block and a closing call-to-action band, from pk-quote, pk-cta-band and two recipes made of existing elements.
---

A marketing page needs four small blocks. Two are elements (`pk-quote` and `pk-cta-band`). The other two are recipes: no new tag, because existing elements already do the layout. All four are shown live in the gallery pattern "Marketing sections" (Patterns, `marketing-sections`), and every block stays readable as plain markup before the elements upgrade.

## Testimonial: pk-quote

Write your own `blockquote`; `pk-quote` draws the figure and the caption (portrait, name, role, rating, source link) around it and never changes it. `size="large"` is for one hero quote; `cite` adds a Source link.

```html
<pk-quote>
  <blockquote><p>Setup took an afternoon.</p></blockquote>
  <pk-avatar slot="portrait" name="Alex Roe"></pk-avatar>
  <span slot="name">Alex Roe</span>
  <span slot="role">Operations lead</span>
  <pk-rating slot="rating" readonly value="5" label="5 out of 5"></pk-rating>
</pk-quote>
```

## Call to action: pk-cta-band

One heading, one line of text and one or two actions. `tone="brand"` is the filled band, `align="center"` centres it. Put the buttons in a `span slot="actions"` and mark them `block` so they fill the width on a phone.

```html
<pk-cta-band tone="brand" align="center">
  <h2 slot="heading">Ready to start?</h2>
  <p>Free for 30 days. No card needed.</p>
  <span slot="actions"><pk-button block href="#signup">Start free</pk-button></span>
</pk-cta-band>
```

## Logo strip (recipe)

A responsive grid of linked logos: a `pk-grid min="9rem"` (equal columns that wrap) of `<a>` around a `pk-media`. A `pk-media` has no width of its own, so it needs a parent that gives it one: a grid column does, a `pk-cluster` or a flex row does not (it renders the logos at 0x0). The same `ratio` on every `pk-media` gives equal-height boxes, at least 48px high with a 9rem column, so the links are tappable. The columns share the row, so a short strip stretches each logo wider. Each link carries an `aria-label` with the company name. The SDK has no greyscale switch and no strip element: a consumer who wants muted logos adds an `img` filter in their own theme stylesheet, which is allowed there and not in the library.

```html
<pk-grid min="9rem" gap="md">
  <a href="https://example.com" aria-label="Acme"><pk-media ratio="3/1"><img src="acme.svg" alt="Acme"></pk-media></a>
  <a href="https://example.com" aria-label="Globex"><pk-media ratio="3/1"><img src="globex.svg" alt="Globex"></pk-media></a>
</pk-grid>
```

## Contact block (recipe)

`<address>` is the semantic piece. Inside it a `pk-field-list` gives the label and value layout and stays readable before upgrade. Phone and email are plain `tel:` and `mailto:` links; hours are one more row.

```html
<address>
  <pk-field-list heading="Contact us">
    <dt>Phone</dt><dd><a href="tel:+15550100">+1 555 0100</a></dd>
    <dt>Email</dt><dd><a href="mailto:hello@example.com">hello@example.com</a></dd>
    <dt>Hours</dt><dd>Monday to Friday, 9 to 17</dd>
  </pk-field-list>
</address>
```

In Blazor use `PkQuote` and `PkCtaBand`; the recipes are the same markup in a `.razor` file (`PkCluster`, `PkMedia`, `PkFieldList`).
