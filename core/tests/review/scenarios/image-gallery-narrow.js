// pk-image-gallery, editable, in narrow tiles: the one-line "Make primary" button used to be wider than its tile, so the tile (overflow hidden) clipped it.
// The button label wraps instead, and no tile hides content.
const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAmklEQVR42gXBIQ4AIAgAQB/GD/yBP6DQ2Cw2N4uNzUJjs9iINqLP8i4BvUxR6CJ5pTPIFukmScAvcxS+yF75DLbFulkStJdblHaxeW1nNFtNd5ME/eUepV/sXvsZ3VbX3SXBfHlGmRen13nGtDV1T0kgL0sUuShe5QyxJbpFEujLGkUvqlc9Q22pbpUE9rJFsYvm1c4wW6bb5AMXIGmBJ4HH0wAAAABJRU5ErkJggg==';
const TILE = '#g >>> [part=tile]:nth-of-type(2)';

export default {
    name: 'image-gallery-narrow',
    elements: ['image-gallery'],
    html: `<div class="u-p-1r-1p25r"><pk-image-gallery id="g" editable images='[{"src":"${img}","alt":"Front","primary":true},{"src":"${img}","alt":"Back"},{"src":"${img}","alt":"Detail"}]'></pk-image-gallery></div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.ok(t.metric(TILE, 'scrollWidth') <= t.metric(TILE, 'clientWidth') + 1, 'a tile clips its content sideways (the make-primary button is wider than the tile)');
        t.within(`${TILE} [part=action]`, TILE, 1);
    },
};
