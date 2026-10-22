// What the shipped loader says when it cannot import a tag's module: loaded only on that failure, so the happy path pays nothing for the wording (#1656).
// The registry it reads is the one the loader already knows: `default` is tag -> file, `extras` is tag -> the package that holds the tag (generated from packages.json).

/** True when it said why (a typo, or an extra that is not in the folder); false leaves the loader's generic "could not load" line to run. */
export async function explain(registry, tag, typo, log, reported, error) {
    const m = await import(registry).catch(() => 0), id = m?.extras?.[tag];
    if (m && !m.default[tag]) return typo(tag), true;
    if (!id) return false;
    reported.add(tag);
    log.error(`<${tag}> is in ${id}, which is not in this folder: unzip ${id}-${m.extrasVersion}.zip over it (GitHub release asset; Pages: packages/${id}/), then reload`, { tag, extra: id, error }); // the tag stays inert, like any unknown element
    return true;
}
