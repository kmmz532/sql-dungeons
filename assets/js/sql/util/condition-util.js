// 行オブジェクトから値を解決し、単純な条件式を解析するユーティリティ
export const resolveRowValue = (row, key) => {
    if (!key) return undefined;
    if (key in row) return row[key];
    if (!key.includes('.')) {
        const foundKey = Object.keys(row).find(k => k.endsWith('.' + key));
        return foundKey ? row[foundKey] : undefined;
    }
    return undefined;
};

export const likePatternToRegex = (pat) => {
    const esc = String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = esc.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp('^' + reg + '$', 'i');
};

// 'a.col >= '\''foo'\'' のような非常に単純な比較式を { col, op, val } に解析する
export const parseSimpleComparison = (str) => {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/(\w+(?:\.\w+)?)\s*(?:(!=|<>|=|>=|<=|>|<))\s*('.*?'|".*?"|[^\s]+)/);
    if (!m) return null;
    let val = m[3];
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
    }
    // 数値なら変換する
    if (/^-?\d+(?:\.\d+)?$/.test(val)) {
        val = Number(val);
    }
    return { col: m[1], op: m[2], val };
};

// 単一の行に対して簡易な条件式を評価する
// サポート: LIKE, IN（リテラルリスト）, 比較演算子 (=, !=, <>, >=, <=, >, <)
export const evaluateCondition = (row, condStr, opts = { permissive: true }) => {
    if (!condStr || typeof condStr !== 'string') return opts.permissive;
    const s = condStr.trim();
    if (!s) return opts.permissive;

    // リテラルの TRUE/FALSE を扱う（parseSQL が LIKE を置換した際に使用）
    if (/^true$/i.test(s)) return true;
    if (/^false$/i.test(s)) return false;

    // 集計関数による比較（例: SUM(col) >= 10）
    const aggCmp = s.match(/^(SUM|COUNT|AVG|MAX|MIN)\s*\(\s*(\*|(?:\w+(?:\.\w+)?))\s*\)\s*(?:(!=|<>|=|>=|<=|>|<))\s*('.*?'|".*?"|[^\s]+)$/i);
    if (aggCmp) {
        const fn = aggCmp[1].toUpperCase();
        const col = aggCmp[2];
        const op = aggCmp[3];
        let rhs = aggCmp[4];
        if ((rhs.startsWith("'") && rhs.endsWith("'")) || (rhs.startsWith('"') && rhs.endsWith('"'))) rhs = rhs.slice(1, -1);
        rhs = Number(rhs);
        const key = `${fn}(${col})`;
        const v = row[key] !== undefined ? Number(row[key]) : undefined;
        if (v === undefined || Number.isNaN(v)) return false;
        switch (op) {
            case '=': return v == rhs;
            case '!=': case '<>': return v != rhs;
            case '>=': return v >= rhs;
            case '<=': return v <= rhs;
            case '>': return v > rhs;
            case '<': return v < rhs;
            default: return false;
        }
    }

    // LIKE 演算子
    const likeMatch = s.match(/^(\w+(?:\.\w+)?)\s+like\s+('.*?'|".*?"|[^\s]+)$/i);
    if (likeMatch) {
        const col = likeMatch[1];
        let pat = likeMatch[2];
        if ((pat.startsWith("'") && pat.endsWith("'")) || (pat.startsWith('"') && pat.endsWith('"'))) pat = pat.slice(1, -1);
        const v = resolveRowValue(row, col);
        if (v === null || v === undefined) return false;
        const re = likePatternToRegex(pat);
        return re.test(String(v));
    }

    // IN（リテラルリスト）
    const inMatch = s.match(/^(\w+(?:\.\w+)?)\s+in\s*\(([^)]+)\)$/i);
    if (inMatch) {
        const col = inMatch[1];
        const inner = inMatch[2];
        const parts = inner.match(/('.*?'|[^,\s][^,]*[^,\s]?)/g) || [];
        const items = parts.map(p => {
            p = p.trim();
            if (p.startsWith("'") && p.endsWith("'")) return p.slice(1, -1);
            if (/^-?\d+$/.test(p)) return Number(p);
            return p;
        });
        const set = new Set(items.map(v => (v === null || v === undefined) ? v : String(v)));
        const lhs = resolveRowValue(row, col);
        const key = lhs === null || lhs === undefined ? lhs : String(lhs);
        return set.has(key);
    }

    // 単純比較
    const cmp = parseSimpleComparison(s);
    if (cmp) {
        let lhs = resolveRowValue(row, cmp.col);
        let rhs = cmp.val;
        if (typeof rhs === 'string' && /^\w+\.\w+$/.test(rhs)) {
            rhs = resolveRowValue(row, rhs);
        }
        switch (cmp.op) {
            case '=': return lhs == rhs;
            case '!=': return lhs != rhs;
            case '<>': return lhs != rhs;
            case '>=': return lhs >= rhs;
            case '<=': return lhs <= rhs;
            case '>': return lhs > rhs;
            case '<': return lhs < rhs;
            default: return false;
        }
    }

    // フォールバック: 条件が解釈できない場合は permissive オプションを返す
    return !!(opts && opts.permissive);
};

export default { resolveRowValue, likePatternToRegex, parseSimpleComparison };
