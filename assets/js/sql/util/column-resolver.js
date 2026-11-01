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

/**
 * 集約関数用の列値解決。修飾付き列（fruits2.id）は完全一致を優先し、
 * 一致しない場合のみ末尾名での一致にフォールバックする（LEFT JOIN の NULL を誤って数えないため）
 */
export const resolveAggregateValue = (row, col) => {
    const v = resolveColumn(row, col);
    if (v !== undefined || !col || !String(col).includes('.')) return v;
    const short = normalizeKey(String(col).split('.').pop());
    const found = Object.keys(row).find(k => normalizeKey(k) === short || normalizeKey(k).endsWith('.' + short));
    return found ? row[found] : undefined;
};

export default { normalizeKey, resolveColumn, resolveAggregateValue };
