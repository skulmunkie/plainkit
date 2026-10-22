// What the loader says when a tag's module cannot be imported; loaded only on that failure (#1656).

/** True when it said why (typo or missing extra). */
export async function explain(registry, tag, typo, log, reported, error) {
    const m = await import(registry).catch(() => 0), id = m?.extras?.[tag];
    if (m && !m.default[tag]) return typo(tag), true;
    if (!id) return false;
    reported.add(tag);
    log.error(`<${tag}> is in ${id}, which is not in this folder: unzip ${id}-${m.extrasVersion}.zip over it (GitHub release asset; Pages: packages/${id}/), then reload`, { tag, extra: id, error });
    return true;
}
