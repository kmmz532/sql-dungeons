// 共通の列解決ユーティリティ
export const normalizeKey = (k) => String(k || '').toLowerCase();

export const resolveColumn = (row, key) => {
    if (!key) return undefined;
    if (key in row) return row[key];
    const lowerKey = normalizeKey(key);
    const exact = Object.keys(row).find(k => normalizeKey(k) === lowerKey);
    if (exact) return row[exact];
    if (!key.includes('.')) {
        const found = Object.keys(row).find(k => normalizeKey(k).endsWith('.' + lowerKey));
        return found ? row[found] : undefined;
    }
    return undefined;
};

export default { normalizeKey, resolveColumn };
