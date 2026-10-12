// Layout model, part 3 of 5: validating a document against the registry, the optional-end-tag rule HTML imposes on nesting, and the JSON form. See js/layout-model.js.

import { LIMITS, MODEL_VERSION, NODE_ID, ATTR_NAME, SLOT_NAME, FORBIDDEN, PRESERVE, CONTROL, BLOCKS, attrInfo, valueProblem, slotExists, isText, tidy, problem, errorsOf } from './layout-schema.js';

/** Problems in a document: the API checks (real tag, prop, slot, enum value, number, JSON, no style, no handlers) plus structure, text form and limits. */
export function validateDoc(doc, registry) {
    const problems = [];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [problem('shape', 'the document must be an object')];
    for (const k of Object.keys(doc)) if (!['version', 'seq', 'nodes'].includes(k)) problems.push(problem('unknown-field', `the document has an unknown field "${k}"`));
    if (doc.version !== MODEL_VERSION) problems.push(problem('version', `version must be ${MODEL_VERSION}`));
    if (!Number.isInteger(doc.seq) || doc.seq < 1) problems.push(problem('seq', 'seq must be a positive integer'));
    if (!Array.isArray(doc.nodes)) return [...problems, problem('shape', 'nodes must be an array')];
    const ctx = { registry, problems, ids: new Set(), count: 0, seq: doc.seq };
    doc.nodes.forEach((n, i) => checkNode(n, null, `nodes[${i}]`, 1, ctx, false, []));
    return problems;
}

export function checkNode(node, parent, path, depth, ctx, preserve, trail) {
    const { problems, registry } = ctx;
    if (!node || typeof node !== 'object' || Array.isArray(node)) { problems.push(problem('shape', 'a node must be an object', { path })); return; }
    if (++ctx.count > LIMITS.nodes) { if (ctx.count === LIMITS.nodes + 1) problems.push(problem('too-many-nodes', `more than ${LIMITS.nodes} nodes`, { path })); return; }
    if (depth > LIMITS.depth) { problems.push(problem('too-deep', `nested deeper than ${LIMITS.depth} levels`, { path, id: node.id })); return; }
    for (const k of Object.keys(node)) if (!['id', 'tag', 'props', 'slots'].includes(k)) problems.push(problem('unknown-field', `a node has an unknown field "${k}"`, { path, id: node.id }));
    const at = { path, id: typeof node.id === 'string' ? node.id : undefined };
    if (typeof node.id !== 'string' || !NODE_ID.test(node.id)) problems.push(problem('id', 'a node id must look like n1, n2, ...', at));
    else if (ctx.ids.has(node.id)) problems.push(problem('id-duplicate', `the id ${node.id} is used twice`, at));
    else { ctx.ids.add(node.id); if (Number(node.id.slice(1)) >= ctx.seq) problems.push(problem('id-seq', `the id ${node.id} is not below seq ${ctx.seq}`, at)); }
    if (typeof node.tag !== 'string') { problems.push(problem('tag', 'a node needs a tag', at)); return; }
    const entry = registry.entry(node.tag);
    if (entry && impliedCut(['#root', ...trail], node.tag) < trail.length + 1) problems.push(problem('content-model', `<${node.tag}> cannot be here: HTML would close an open element first (a <p> before a block, an <li> before another <li>, ...)`, at));
    if (!entry) {
        problems.push(problem(FORBIDDEN.has(node.tag) ? 'forbidden-tag' : 'unknown-tag', FORBIDDEN.has(node.tag) ? `<${node.tag}> is not allowed` : `unknown element <${node.tag}>`, at));
        return;
    }
    if (!node.props || typeof node.props !== 'object' || Array.isArray(node.props)) problems.push(problem('shape', 'props must be an object', at));
    else {
        for (const [name, value] of Object.entries(node.props)) {
            if (name === 'style') { problems.push(problem('style-attribute', `<${node.tag}> has a style attribute`, at)); continue; }
            if (/^on/.test(name) && !entry.props.has(name)) { problems.push(problem('event-attribute', `<${node.tag}> has an event handler attribute "${name}"`, at)); continue; }
            if (name === 'slot') { problems.push(problem('slot-prop', 'the slot is the child\'s position in its parent, not a prop', at)); continue; }
            if (!ATTR_NAME.test(name)) { problems.push(problem('prop-name', `"${name}" is not a valid attribute name`, at)); continue; }
            const info = attrInfo(entry, name);
            if (!info) { problems.push(problem('unknown-prop', `<${node.tag}> has no prop "${name}"`, at)); continue; }
            const why = valueProblem(name, info, value);
            if (why) problems.push(problem('bad-value', `<${node.tag}> ${name} ${why}`, at));
        }
    }
    if (!node.slots || typeof node.slots !== 'object' || Array.isArray(node.slots)) { problems.push(problem('shape', 'slots must be an object', at)); return; }
    const keep = preserve || PRESERVE.has(node.tag);
    for (const [name, kids] of Object.entries(node.slots)) {
        const sat = { path: `${path}.slots[${JSON.stringify(name)}]`, id: at.id };
        if (!SLOT_NAME.test(name)) { problems.push(problem('slot-name', `"${name}" is not a valid slot name`, sat)); continue; }
        if (!Array.isArray(kids) || kids.length === 0) { problems.push(problem('shape', 'a slot must be a non-empty array (an empty slot is left out)', sat)); continue; }
        if (name !== '' && entry.native) problems.push(problem('unknown-slot', `<${node.tag}> has no slot "${name}"`, sat));
        else if (name !== '' && !slotExists(entry, name)) problems.push(problem('unknown-slot', `<${node.tag}> has no slot "${name}" (it has: ${entry.slots.map(s => s.name || '(default)').join(', ')})`, sat));
        if (name === '' && !entry.native && !entry.slots.some(s => s.name === '') && kids.some(k => !isText(k))) problems.push(problem('no-default-slot', `<${node.tag}> declares no default slot, so its child elements have nowhere to go`, { ...sat, severity: 'warn' }));
        if (name === '' && entry.void && kids.length) problems.push(problem('void-content', `<${node.tag}> cannot have content`, sat));
        kids.forEach((k, i) => {
            const kpath = `${sat.path}[${i}]`;
            if (isText(k)) {
                if (name !== '') problems.push(problem('text-slot', 'text can only be in the default slot', { path: kpath, id: at.id }));
                if (k.length > LIMITS.text) problems.push(problem('text-long', `text is longer than ${LIMITS.text} characters`, { path: kpath, id: at.id }));
                if (CONTROL.test(k)) problems.push(problem('text-control', 'text contains a control character', { path: kpath, id: at.id }));
            } else {
                checkNode(k, node, kpath, depth + 1, ctx, keep, [...trail, node.tag]);
            }
        });
        if (name === '' && JSON.stringify(tidy(kids, keep)) !== JSON.stringify(kids)) problems.push(problem('text-form', 'text is not in canonical form (single spaces, trimmed, merged)', { ...sat, severity: 'warn' }));
    }
}

// Optional end tags. tags is the open elements from the root (index 0 is a placeholder); the result is how many of them stay open when a start tag for `tag` arrives.
// The parser uses it to close implicitly, and the validator uses it to refuse a nesting that HTML could not spell (<li> directly in <li>), so toHtml output always reads back.
export function impliedCut(tags, tag) {
    let len = tags.length;
    if (tags[len - 1] === 'p' && BLOCKS.has(tag)) len--;
    const popTo = (names, stop) => {
        let target = -1;
        for (let i = len - 1; i >= 1; i--) { const t = tags[i]; if (stop.has(t)) break; if (names.has(t)) target = i; }
        if (target >= 0) len = target;
    };
    if (tag === 'li') popTo(new Set(['li']), new Set(['ul', 'ol']));
    else if (tag === 'option') popTo(new Set(['option']), new Set());
    else if (tag === 'dt' || tag === 'dd') popTo(new Set(['dt', 'dd']), new Set(['dl']));
    else if (tag === 'tr') popTo(new Set(['tr', 'td', 'th']), new Set(['table', 'thead', 'tbody', 'tfoot']));
    else if (tag === 'td' || tag === 'th') popTo(new Set(['td', 'th']), new Set(['tr', 'table']));
    else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') popTo(new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot']), new Set(['table']));
    return len;
}

export const toJson = (doc, space) => JSON.stringify(doc, null, space);

/** A document from JSON text or an object: { doc, problems }; doc is null when the document has errors (a saved page is machine-made: it is not repaired). */
export function fromJson(input, { registry } = {}) {
    if (!registry) throw new TypeError('fromJson: a registry is required');
    let value = input;
    if (typeof input === 'string') {
        if (input.length > LIMITS.input * 2) return { doc: null, problems: [problem('too-large', 'the document is too large')] };
        try { value = JSON.parse(input); } catch (error) { return { doc: null, problems: [problem('json', `not valid JSON: ${error.message}`)] }; }
    }
    const problems = validateDoc(value, registry);
    return { doc: errorsOf(problems).length ? null : value, problems };
}
