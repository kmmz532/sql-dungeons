/**
 * condition-util.js
 * 行オブジェクトから値を解決し、WHERE句などの条件式を解析・評価するユーティリティ
 */

/**
 * 行オブジェクトからカラム値を解決
 * @param {Object} row - 行データ
 * @param {string} key - カラム名（テーブル接頭辞付き可能）
 * @returns {*} 解決された値またはundefined
 */
export const resolveRowValue = (row, key) => {
    if (!key) return undefined;
    if (key in row) return row[key];
    if (!key.includes('.')) {
        const foundKey = Object.keys(row).find(k => k.endsWith('.' + key));
        return foundKey ? row[foundKey] : undefined;
    }
    return undefined;
};

/**
 * LIKE パターンを正規表現に変換
 * @param {string} pat - LIKEパターン（% と _ を含む）
 * @returns {RegExp} 正規表現オブジェクト
 */
export const likePatternToRegex = (pat) => {
    const esc = String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = esc.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp('^' + reg + '$', 'i');
};

/**
 * 単純な比較式を解析（例: 'a.col >= "foo"'）
 * @param {string} str - 比較式文字列
 * @returns {Object|null} { col, op, val } またはnull
 */
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
    // NULL リテラル扱い
    if (typeof val === 'string' && /^null$/i.test(val)) {
        val = null;
    }
    return { col: m[1], op: m[2], val };
};

/**
 * 単一の行に対して条件式を評価
 * サポート: LIKE, IN（リテラルリスト）, 比較演算子 (=, !=, <>, >=, <=, >, <), AND, OR, NOT
 * @param {Object} row - 評価対象の行データ
 * @param {string} condStr - 条件式文字列
 * @param {Object} opts - オプション（permissive: エラー時の戻り値）
 * @returns {boolean} 条件式の評価結果
 */
export const evaluateCondition = (row, condStr, opts = { permissive: true }) => {
    if (!condStr || typeof condStr !== 'string') return opts.permissive;
    const s = condStr.trim();
    if (!s) return opts.permissive;

    try {
        const tokens = [];
        const isWordChar = (ch) => /[A-Za-z0-9_\.]/.test(ch);
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
            if (ch === '(' || ch === ')' || ch === ',' ) { tokens.push({ type: ch, value: ch }); i++; continue; }
            if (ch === '<' || ch === '>' || ch === '=' || ch === '!') {
                // 演算子: <=, >=, <>, !=, =, <, >
                let op = ch; i++;
                if (i < s.length && (s[i] === '=' || (ch === '<' && s[i] === '>'))) { op += s[i]; i++; }
                tokens.push({ type: 'OP', value: op });
                continue;
            }
            if (ch === '\'' || ch === '"') {
                const quote = ch; let j = i+1; let buf = '';
                while (j < s.length) {
                    if (s[j] === quote) {
                        if (j+1 < s.length && s[j+1] === quote) { buf += quote; j += 2; continue; }
                        break;
                    }
                    buf += s[j++];
                }
                tokens.push({ type: 'STRING', value: buf });
                i = j+1; continue;
            }
            if (/[0-9]/.test(ch)) {
                let j = i; let num = '';
                while (j < s.length && /[0-9\.]/.test(s[j])) { num += s[j++]; }
                tokens.push({ type: 'NUMBER', value: Number(num) });
                i = j; continue;
            }

            if (isWordChar(ch)) {
                let j = i; let w = '';
                while (j < s.length && isWordChar(s[j])) { w += s[j++]; }
                const upper = w.toUpperCase();
                if (['AND','OR','NOT','IN','LIKE','BETWEEN','IS','NULL'].includes(upper)) tokens.push({ type: upper, value: upper });
                else tokens.push({ type: 'IDENT', value: w });
                i = j; continue;
            }

            tokens.push({ type: ch, value: ch }); i++;
        }

        let pos = 0;
        const peek = () => tokens[pos] || null;
        const consume = (t) => { const tk = tokens[pos]; if (tk && (!t || tk.type === t || tk.value === t)) { pos++; return tk; } return null; };

        const parsePrimary = () => {
            const tk = peek();
            if (!tk) return opts.permissive;
            if (tk.type === 'NOT') { consume('NOT'); const v = parsePrimary(); return !v; }
            if (tk.type === '(') { consume('('); const v = parseExpr(); consume(')'); return v; }
            // カラム名 BETWEEN a AND b
            if (tk.type === 'IDENT') {
                const leftIdent = consume('IDENT').value;
                const next = peek();
                if (next && next.type === 'BETWEEN') {
                    consume('BETWEEN');
                    const low = parseValueToken();
                    consume('AND');
                    const high = parseValueToken();

                    const lhs = resolveRowValue(row, leftIdent);
                    if (lhs === undefined || lhs === null || low === undefined || low === null || high === undefined || high === null) return !!(opts && opts.permissive);
                    let a = lhs, b = low, c = high;
                    if (typeof a === 'number' || (typeof b === 'number' && typeof c === 'number')) { a = Number(a); b = Number(b); c = Number(c); } else { a = String(a); b = String(b); c = String(c); }
                    if (b > c) { const tmp = b; b = c; c = tmp; }
                    return (a >= b && a <= c);
                }
                // IN
                if (peek() && peek().type === 'IN') {
                    consume('IN'); consume('(');
                    const items = [];
                    while (peek() && peek().type !== ')') {
                        const v = parseValueToken(); items.push(v); if (peek() && peek().type === ',') consume(','); else break;
                    }
                    consume(')');
                    const lhs = resolveRowValue(row, leftIdent);
                    const set = new Set(items.map(v => (v === null || v === undefined) ? v : String(v)));
                    const key = lhs === null || lhs === undefined ? lhs : String(lhs);
                    return set.has(key);
                }
                // LIKE
                if (peek() && peek().type === 'LIKE') {
                    consume('LIKE'); const patToken = consume('STRING') || consume('IDENT');
                    const pat = patToken ? (patToken.type === 'STRING' ? patToken.value : patToken.value) : '';
                    const v = resolveRowValue(row, leftIdent);
                    if (v === null || v === undefined) return false;
                    const re = likePatternToRegex(pat);
                    return re.test(String(v));
                }
                // IS NULL / IS NOT NULL
                if (peek() && peek().type === 'IS') {
                    consume('IS'); let neg = false; if (peek() && peek().type === 'NOT') { neg = true; consume('NOT'); }
                    consume('NULL'); const v = resolveRowValue(row, leftIdent); const res = (v === null || v === undefined); return neg ? !res : res;
                }

                if (peek() && peek().type === 'OP') {
                    const op = consume('OP').value;
                    const rhs = parseValueToken();
                    const lhs = resolveRowValue(row, leftIdent);
                    if (rhs === null) {
                        switch (op) { case '=': return lhs === null || lhs === undefined; case '!=': case '<>': return !(lhs === null || lhs === undefined); default: return false; }
                    }
                    switch (op) {
                        case '=': return lhs == rhs;
                        case '!=': case '<>': return lhs != rhs;
                        case '>=': return lhs >= rhs;
                        case '<=': return lhs <= rhs;
                        case '>': return lhs > rhs;
                        case '<': return lhs < rhs;
                        default: return false;
                    }
                }

                const v = resolveRowValue(row, leftIdent);
                return !!v;
            }

            if (tk.type === 'STRING' || tk.type === 'NUMBER') { const v = consume(tk.type).value; return !!v; }
            if (tk.type === 'NULL') { consume('NULL'); return false; }
            return opts.permissive;
        };

        const parseValueToken = () => {
            const tk = peek();
            if (!tk) return undefined;
            if (tk.type === 'STRING') { consume('STRING'); return tk.value; }
            if (tk.type === 'NUMBER') { consume('NUMBER'); return tk.value; }
            if (tk.type === 'IDENT') {
                const id = consume('IDENT').value; return resolveRowValue(row, id);
            }
            if (tk.type === 'NULL') { consume('NULL'); return null; }
            return undefined;
        };

        const parseFactor = () => {
            return parsePrimary();
        };

        const parseTerm = () => {
            let v = parseFactor();
            while (peek() && peek().type === 'AND') { consume('AND'); const r = parseFactor(); v = v && r; }
            return v;
        };

        const parseExpr = () => {
            let v = parseTerm();
            while (peek() && peek().type === 'OR') { consume('OR'); const r = parseTerm(); v = v || r; }
            return v;
        };

        const res = parseExpr();
        return !!res;
    } catch (e) {
        console.error('evaluateCondition error:', e);
    }

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
            if (/^null$/i.test(p)) return null;
            return p;
        });
        const set = new Set(items.map(v => (v === null || v === undefined) ? v : String(v)));
        const lhs = resolveRowValue(row, col);
        const key = lhs === null || lhs === undefined ? lhs : String(lhs);
        return set.has(key);
    }

    // NOT IN（リテラルリスト）
    const notInMatch = s.match(/^(\w+(?:\.\w+)?)\s+not\s+in\s*\(([^)]+)\)$/i);
    if (notInMatch) {
        const col = notInMatch[1];
        const inner = notInMatch[2];
        const parts = inner.match(/('.*?'|[^,\s][^,]*[^,\s]?)/g) || [];
        const items = parts.map(p => {
            p = p.trim();
            if (p.startsWith("'") && p.endsWith("'")) return p.slice(1, -1);
            if (/^-?\d+$/.test(p)) return Number(p);
            if (/^null$/i.test(p)) return null;
            return p;
        });
        const set = new Set(items.map(v => (v === null || v === undefined) ? v : String(v)));
        const lhs = resolveRowValue(row, col);
        const key = lhs === null || lhs === undefined ? lhs : String(lhs);
        return !set.has(key);
    }

    // BETWEEN / NOT BETWEEN
    const betweenMatch = s.match(/^(\w+(?:\.\w+)?)\s+(not\s+)?between\s+('.*?'|".*?"|[^\s]+)\s+and\s+('.*?'|".*?"|[^\s]+)$/i);
    if (betweenMatch) {
        const col = betweenMatch[1];
        const isNot = !!betweenMatch[2];
        const rawLow = betweenMatch[3];
        const rawHigh = betweenMatch[4];

        const parseVal = (tok) => {
            if (!tok) return undefined;
            const t = String(tok).trim();
            if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
            if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
            if (/^null$/i.test(t)) return null;

            try { const v = resolveRowValue ? resolveRowValue(arguments.calleeRow || {}, t) : undefined; } catch(e){}
            return t;
        };

        const resolveToken = (tok) => {
            if (!tok) return undefined;
            const t = String(tok).trim();
            if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
            if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
            if (/^null$/i.test(t)) return null;

            const v = resolveRowValue(row, t);
            return v;
        };

        const lhs = resolveRowValue(row, col);
        const low = resolveToken(rawLow);
        const high = resolveToken(rawHigh);

        if (lhs === undefined || lhs === null || low === undefined || low === null || high === undefined || high === null) {
            return !!(opts && opts.permissive) && !isNot;
        }

        let a = lhs;
        let b = low;
        let c = high;

        if (typeof a === 'number' || (typeof b === 'number' && typeof c === 'number')) {
            a = Number(a);
            b = Number(b);
            c = Number(c);
        } else {
            a = String(a);
            b = String(b);
            c = String(c);
        }

        if (b > c) {
            const tmp = b; b = c; c = tmp;
        }

        const inRange = (a >= b && a <= c);
        return isNot ? !inRange : inRange;
    }

    // 単純比較
    const cmp = parseSimpleComparison(s);
    if (cmp) {
        let lhs = resolveRowValue(row, cmp.col);
        let rhs = cmp.val;
        if (typeof rhs === 'string' && /^\w+\.\w+$/.test(rhs)) {
            rhs = resolveRowValue(row, rhs);
        }
        // NULL 比較の扱い: JS の比較は undefined/null に影響されるため明示的に扱う
        if (rhs === null) {
            switch (cmp.op) {
                case '=': return lhs === null || lhs === undefined;
                case '!=': case '<>': return !(lhs === null || lhs === undefined);
                default: return false;
            }
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

    // 条件が解釈できない場合は permissive オプションを返す
    return !!(opts && opts.permissive);
};

export default { resolveRowValue, likePatternToRegex, parseSimpleComparison };
