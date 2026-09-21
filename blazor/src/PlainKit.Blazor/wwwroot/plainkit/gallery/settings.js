// Per-viewer settings kept in localStorage; a blocked or full store just means a setting does not persist.

export const readSetting = key => { try { return localStorage.getItem(key); } catch { return null; } };
export const writeSetting = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked: the setting simply does not persist */ } };
