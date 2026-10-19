// The data of the page, identical in every implementation: 25 members, shown 5 per page.
export const PAGE_SIZE = 5;
export const ROLES = ['Engineer', 'Designer', 'Manager'];
const NAMES = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Linus Torvalds', 'Margaret Hamilton', 'Dennis Ritchie', 'Barbara Liskov', 'Ken Thompson', 'Radia Perlman', 'Tim Berners-Lee', 'Katherine Johnson', 'Donald Knuth', 'Frances Allen', 'Edsger Dijkstra', 'Hedy Lamarr', 'John McCarthy', 'Annie Easley', 'Claude Shannon', 'Sophie Wilson', 'Guido van Rossum', 'Jean Sammet', 'Bjarne Stroustrup', 'Karen Sparck Jones', 'James Gosling', 'Lynn Conway'];
export const ROWS = NAMES.map((name, i) => ({ id: i + 1, name, role: ROLES[i % 3], score: (i * 37) % 100 }));
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MSG = { name: 'Enter a name.', email: 'Enter a valid email address.' };
export const PAGES = Math.ceil(ROWS.length / PAGE_SIZE);
/** The rows of one page after sorting by `key` ('name' or 'score') in `dir` ('asc', 'desc' or null for the natural order). */
export function view(key, dir, page) {
    const sorted = !dir ? ROWS : [...ROWS].sort((a, b) => (key === 'score' ? a.score - b.score : a.name.localeCompare(b.name)) * (dir === 'asc' ? 1 : -1));
    return sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
