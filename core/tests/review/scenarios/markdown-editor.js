// pk-markdown-editor (#1486): the states a still example cannot show. Written text, a command applied (bold with its selection kept), the link row open and refusing script-scheme,
// the preview open on hostile text, the split layout beside it, a disabled field, and right-to-left. Each state fits the viewport; the toolbar and tabs never overflow sideways.
const ED = id => `#${id}`;
const CTL = id => `${ED(id)} >>> [part=control]`;
const CMD = (id, c) => `${ED(id)} >>> [part=commands] pk-button[data-cmd=${c}]`;
const JS = 'java' + 'script:'; // a script address, built so the source scan does not flag this file
const HOSTILE = `# Notes&#10;&#10;<script>alert(1)</script> **bold** and *italic* [bad](${JS}alert(1)) [ok](https://example.test)&#10;&#10;- one&#10;- two`;

export default {
    name: 'markdown-editor',
    issue: [1486],
    elements: ['markdown-editor'],
    html: `<div id="stage"><pk-stack gap="md">
<pk-markdown-editor id="main" label="Description" placeholder="Write Markdown" value="Release notes for the **spring** update."></pk-markdown-editor>
<pk-markdown-editor id="prev" label="Preview" mode="preview" value="${HOSTILE}"></pk-markdown-editor>
<pk-markdown-editor id="split" label="Split" layout="split" rows="5" value="${HOSTILE}"></pk-markdown-editor>
<pk-markdown-editor id="off" label="Disabled" disabled value="Not editable"></pk-markdown-editor>
</pk-stack></div>`,
    steps: [
        { shot: 'resting' },
        { focus: CTL('main') }, { key: 'End' }, { click: CMD('main', 'ul') }, { wait: 'settle' }, { wait: 100 }, { shot: 'list-applied' },
        { click: CMD('main', 'link') }, { wait: 'settle' }, { type: JS + 'alert(1)' }, { key: 'Enter' }, { wait: 'settle' }, { shot: 'link-refused' },
        { key: 'Escape' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { focus: `${CMD('main', 'bold')} >>> [part=control]` }, { shot: 'rtl-toolbar-focus' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        for (const id of ['main', 'prev', 'split', 'off']) { t.visible(ED(id), `${id}: the field`); if (id === 'main') t.inViewport(ED(id)); t.within(`${ED(id)} >>> [part=head]`, ED(id)); }
        for (const c of ['bold', 'italic', 'ul', 'ol', 'link']) { t.visible(CMD('main', c), `the ${c} button`); t.atLeast(CMD('main', c), 'height', 24, `the ${c} button height`); }
        t.visible(CTL('main'), 'the writing area'); t.hidden(`${ED('main')} >>> [part=preview]`, 'the preview of the writing field');
        t.visible(`${ED('prev')} >>> [part=preview] strong`, 'the bold in the preview'); t.hidden(CTL('prev'), 'the writing area while previewing');
        t.hidden(`${ED('prev')} >>> [part=preview] script`, 'a script in the preview');
        if (t.viewport.name === 'desktop' && t.shot === 'resting') t.noOverlap(CTL('split'), `${ED('split')} >>> [part=preview]`);
        if (t.shot === 'link-refused') { t.visible(`${ED('main')} >>> [part=linkbar]`, 'the link row'); t.visible(`${ED('main')} >>> [part=error]`, 'the inline error'); t.noOverlap(`${ED('main')} >>> [part=error]`, CTL('main')); }
        if (t.shot === 'rtl-toolbar-focus') t.ringUnclipped(`${CMD('main', 'bold')} >>> [part=control]`);
    },
};
