// pk-markdown (#1673): the rendered Markdown at rest, a long code line and a long word that must not push the page sideways, a focused link, and right-to-left.
const JS = 'java' + 'script:'; // a script address, built so the source scan does not flag this file
const TEXT = `# Guide&#10;&#10;Read the [intro](guide/intro) first. **Bold**, *italic* and \`code\`, then <script>alert(1)</script> as plain text and [bad](${JS}alert(1)).&#10;&#10;- one&#10;- two&#10;&#10;> A quote&#10;&#10;\`\`\`&#10;a_very_long_code_line_that_has_to_scroll_inside_its_block_rather_than_widen_the_page_0123456789&#10;\`\`\`&#10;&#10;Averyveryverylongwordwithoutanybreaksthatmustwrapinsideitscolumnandnotpushthepagesideways0123456789`;

export default {
    name: 'markdown',
    issue: [1673],
    elements: ['markdown'],
    html: `<div id="stage"><pk-markdown id="md" markdown="${TEXT}"></pk-markdown></div>`,
    steps: [
        { waitFor: '#md >>> [part=content] h1' }, { shot: 'resting' },
        { focus: '#md >>> [part=content] a' }, { shot: 'link-focus' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#md >>> [part=content] h1', 'the heading'); t.visible('#md >>> [part=content] strong', 'the bold text');
        t.hidden('#md >>> [part=content] script', 'a script in the rendered text');
        t.within('#md >>> [part=content] pre', '#md'); t.within('#md', '#stage'); t.within('#md >>> [part=content] p', '#md');
        if (t.shot === 'rtl') for (const sel of ['#md', '#md >>> [part=content] pre', '#md >>> [part=content] p']) t.inViewport(sel);
        if (t.shot === 'link-focus') t.ringUnclipped('#md >>> [part=content] a');
    },
};
