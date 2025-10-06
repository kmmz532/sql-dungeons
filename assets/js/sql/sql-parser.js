// SQLParser: クエリのバリデーションとエミュレーションを統合
import Registry from '../register.js';

const getRegistryClass = (key, type) => {
    try {
        return Registry.get(key, type);
    } catch (e) {
        console.error(`[SQLParser] Failed to get registry class for ${key}:`, e);
        return undefined;
    }
};

/**
 * SQLParser: SQL文の簡易パースと模擬実行エンジン
 * 今後のSandbox拡張も見据えた設計
 */
export class SQLParser {
    /**
     * クエリが課題の条件を満たすか判定
     * @param {string} query
     * @param {object} floorData
     * @param {object} mockDatabase
     */
    validate(query, floorData, mockDatabase) {
        if (floorData.answer) {
            const userResult = this._normalizeResult(this.emulate(query, floorData.floor, mockDatabase));
            const answerResult = this._normalizeResult(this.emulate(floorData.answer, floorData.floor, mockDatabase));

            if (Array.isArray(answerResult) && answerResult.length === 0) {
                return Array.isArray(userResult) && userResult.length === 0;
            }

            if (Array.isArray(userResult) && userResult.length > 0 && this._resultsEqual(userResult, answerResult)) {
                return true;
            }
            return false;
        }
        // 既存の特殊バリデーション
        if (floorData.specialValidation) {
            switch (floorData.floor) {
                case 3:
                    return this._validateJoinQuery(query);
                case 5:
                    return this._validateBossQuery(query);
                default:
                    return false;
            }
        }
        if (floorData.solutionPatterns) {
            return floorData.solutionPatterns.some(pattern => 
                new RegExp(pattern, 'i').test(query)
            );
        }
        return false;
    }

    /**
     * 結果配列をソート・型正規化し、カラム名のエイリアス（例: e.emp_name）を除去して比較しやすくする
     * JOIN句のカラム名揺れを吸収し、柔軟な自動採点を実現
     */
    _normalizeResult(result) {
        if (!Array.isArray(result)) return [];
        return result.map(row => {
            const normalized = {};
            Object.keys(row).forEach(k => {
                // エイリアス付きカラム名（e.emp_name）はemp_nameに統一し、さらに小文字化
                const baseKey = (k.includes('.') ? k.split('.').pop() : k).toLowerCase();
                let v = row[k];
                if (v === undefined) v = null;
                if (typeof v === 'string' && v.match(/^\d+(\.\d+)?$/)) v = Number(v);
                if (baseKey in normalized) {
                    if (normalized[baseKey] === null) normalized[baseKey] = v;
                    else if (normalized[baseKey] !== v) {
                        normalized[baseKey] = [normalized[baseKey], v];
                    }
                } else {
                    normalized[baseKey] = v;
                }
            });
            // カラム順をソート
            const sorted = {};
            Object.keys(normalized).sort().forEach(k => { sorted[k] = normalized[k]; });
            return sorted;
        }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    /**
     * 結果配列の完全一致判定
     */
    _resultsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * SQL文をパースし、模擬的に実行して結果を返す
     * @param {string} query - SQLクエリ
     * @param {number} currentFloor - 現在のフロア番号
     * @param {object} mockDatabase - モックDB
     * @returns {Array<object>} - 結果テーブル
     */
    emulate(query, currentFloor, mockDatabase) {
        try {
            // SQL文をパース
            const parsed = this.parseSQL(query);
            try { console.debug('[SQLParser] parsed:', parsed); } catch (e) {}
            try { console.debug('[SQLParser] parsed.joins=', parsed.joins); } catch(e){}
            if (!parsed) return [];

            // Handle INSERT via registered clause class (non-mutating)
            if (parsed.insert) {
                const InsertCls = getRegistryClass('INSERT', 'clause');
                if (InsertCls && typeof InsertCls.apply === 'function') {
                    return InsertCls.apply(parsed.insert, mockDatabase);
                }
                return [];
            }

            // FROM / JOIN を扱う
            let table = [];
            // ヘルパー: 行のキーを alias.column の形式にプレフィックスする
            const prefixRow = (row, prefix) => {
                const o = {};
                for (const k in row) {
                    o[`${prefix}.${k}`] = row[k];
                }
                return o;
            };

            // ベーステーブル
            const base = parsed.from; // { table, alias }
            const baseName = base.alias || base.table;
            const baseRows = mockDatabase[base.table];
            if (!Array.isArray(baseRows)) return [];

            // 初期 accumulated rows
            let accumulated = baseRows.map(r => prefixRow(r, baseName));
            try { console.debug('[SQLParser] after base rows, accumulated=', accumulated.length); } catch(e){}
            try { console.debug('[SQLParser] accumulated sample keys=', Object.keys(accumulated[0] || {}).slice(0,20)); } catch(e){}

            // 各 JOIN を順に適用（簡易的な nested-loop INNER JOIN）
            if (parsed.joins && parsed.joins.length) {
                for (const j of parsed.joins) {
                    const joinTable = mockDatabase[j.table];
                    if (!Array.isArray(joinTable)) {
                        accumulated = []; break;
                    }
                    const joinName = j.alias || j.table;
                    const newAccum = [];

                    // parse ON: 単純な等式 a.col = b.col のみサポート
                    const onMatch = j.on.match(/(\w+(?:\.\w+)?)\s*=\s*(\w+(?:\.\w+)?)/);

                    for (const leftRow of accumulated) {
                        for (const rightRow of joinTable) {
                            const prefRight = prefixRow(rightRow, joinName);
                            const combined = Object.assign({}, leftRow, prefRight);

                            let onOk = true;
                            if (onMatch) {
                                const leftKey = onMatch[1];
                                const rightKey = onMatch[2];
                                const getVal = (obj, key) => {
                                    if (key in obj) return obj[key];
                                    // unqualified:探してみる
                                    if (!key.includes('.')) {
                                        const found = Object.keys(obj).find(k => k.endsWith('.' + key));
                                        return found ? obj[found] : undefined;
                                    }
                                    return undefined;
                                };
                                const lv = getVal(combined, leftKey);
                                const rv = getVal(combined, rightKey);
                                onOk = (lv === rv);
                            }

                            if (onOk) newAccum.push(combined);
                        }
                    }
                    accumulated = newAccum;
                    try { console.debug('[SQLParser] after join', j.table, 'accumulated=', accumulated.length); } catch(e){}
                    if (accumulated.length === 0) break;
                }
            }

            // フェーズ順をランタイムの登録状況（レジストリ）またはフォールバック manifest から決定する
            let resultTable = accumulated;
            try { console.debug('[SQLParser] before clauses, rows=', resultTable.length); } catch(e){}
            const registered = Registry.getAll ? Registry.getAll() : {};
            // getAll returns an object of { KEY: ctor }
            const runtimeKeys = Object.keys(registered || {});

            // fallback manifest keys (from static export) if registry is empty
            const fallbackManifest = getFallbackClauseClasses();
            const fallbackKeys = Object.keys(fallbackManifest || {});

            // Decide keys to consider, prefer runtimeKeys if present else fallbackKeys
            let keys = runtimeKeys.length ? runtimeKeys : fallbackKeys;

            // Ensure deterministic ordering: we'll execute WHERE before GROUP BY before HAVING before ORDER BY before SELECT
            const orderPreference = ['WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'SELECT'];
            // Keep only keys that exist in keys and sort by preference (unknown keys go before SELECT but after known ones)
            keys = keys.filter(k => k && typeof k === 'string');
            keys.sort((a, b) => {
                const ia = orderPreference.indexOf(a.toUpperCase());
                const ib = orderPreference.indexOf(b.toUpperCase());
                if (ia === -1 && ib === -1) return a.localeCompare(b);
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });

            // Ensure SELECT is last
            keys = keys.filter(k => k.toUpperCase() !== 'SELECT').concat(keys.filter(k => k.toUpperCase() === 'SELECT'));

            for (const key of keys) {
                const phase = key.toUpperCase();
                const Cls = getRegistryClass(phase, 'clause');
                if (!Cls) continue;

                // map phase to parsed property
                let prop = null;
                if (phase === 'WHERE') prop = 'where';
                else if (phase === 'GROUP BY') prop = 'groupBy';
                else if (phase === 'HAVING') prop = 'having';
                else if (phase === 'ORDER BY') prop = 'orderBy';
                else if (phase === 'SELECT') prop = 'select';
                // skip if not present in parsed
                if (!prop || !(prop in parsed) || parsed[prop] == null) continue;

                if (phase === 'GROUP BY') {
                    const aggInstances = (parsed.aggregateFns || []).map(af => {
                        const AggCls = getRegistryClass(af.fn, 'aggregate');
                        if (!AggCls) return null;
                        // COUNT(*)はundefined渡し、それ以外はカラム名
                        return new AggCls(af.column === '*' ? undefined : af.column);
                    }).filter(Boolean);
                    if (typeof Cls.groupAndAggregate === 'function') {
                        resultTable = Cls.groupAndAggregate(resultTable, parsed.groupBy, aggInstances);
                        try { console.debug('[SQLParser] after GROUP BY, rows=', resultTable.length, 'sample=', resultTable.slice(0,3)); } catch(e){}
                        continue;
                    }
                }

                if (phase === 'HAVING' || phase === 'WHERE') {
                    if (typeof Cls.apply === 'function') {
                        resultTable = Cls.apply(resultTable, parsed[prop]);
                        try { console.debug('[SQLParser] after', phase, 'rows=', resultTable.length, 'sample=', resultTable.slice(0,3)); } catch(e){}
                    }
                    continue;
                }

                if (phase === 'ORDER BY') {
                    if (typeof Cls.apply === 'function') {
                        resultTable = Cls.apply(resultTable, parsed.orderBy);
                        try { console.debug('[SQLParser] after ORDER BY, rows=', resultTable.length); } catch(e){}
                    }
                    continue;
                }

                if (phase === 'SELECT') {
                    if (typeof Cls.apply === 'function') {
                        const finalRes = Cls.apply(resultTable, parsed.select);
                        try { console.debug('[SQLParser] SELECT result rows=', finalRes.length, 'sample=', finalRes.slice(0,3)); } catch(e){}
                        return finalRes;
                    }
                    return [];
                }
            }

            return [];
        } catch (e) {
            return [];
        }
    }

    /**
     * SQL文を簡易パース
     * @returns {object|null}
     */
    parseSQL(query) {
        // 超簡易パース: INSERT または SELECT 系
        // INSERT: INSERT INTO table (col, ...) VALUES (val, ...)
        const insertMatch = query.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
        if (insertMatch) {
            const table = insertMatch[1];
            const cols = insertMatch[2].split(',').map(s => s.trim());
            const vals = insertMatch[3].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
            return { insert: { table, columns: cols, values: vals } };
        }

        // SELECT ... FROM ... [WHERE ...] [GROUP BY ...] [ORDER BY ...]
    const selectMatch = query.match(/select\s+(.+?)\s+from\s+/i);
    // FROM と alias (例: from employees as e)
    // Use the first occurrence of 'from' to avoid accidentally matching nested or later FROMs
    const fromPos = query.search(/\bfrom\b/i);
    let fromMatch = null;
    if (fromPos !== -1) {
        const tail = query.slice(fromPos);
        fromMatch = tail.match(/from\s+(\w+)(?:\s+(?:as\s+)?(\w+))?/i);
    }
    const whereMatch = query.match(/where\s+(.+?)(group by|having|order by|$)/i);
    const groupByMatch = query.match(/group by\s+([\w\., ]+)/i);
    const orderByMatch = query.match(/order by\s+([\w\.\s,]+)(asc|desc)?/i);

    // JOIN セグメントを反復で取得
    const joinSegmentRegex = /\b(?:inner|left|right)?\s*join\s+(\w+)(?:\s+(?:as\s+)?(\w+))?\s+on\s+(.+?)(?=\s+(?:inner|left|right)?\s*join\b|\s+where\b|\s+group by\b|\s+order by\b|$)/ig;

        let orderBy = null;
        if (orderByMatch) {
            // 例: order by price desc, name asc
            orderBy = orderByMatch[1].split(',').map(s => {
                const m = s.trim().match(/(\w+)(\s+(asc|desc))?/i);
                return {
                    column: m[1],
                    direction: (m[3] || 'ASC').toUpperCase()
                };
            });
        }

        if (!selectMatch || !fromMatch) return null;

        const parsed = {
            select: selectMatch[1].split(',').map(s => s.trim()),
            from: { table: fromMatch ? fromMatch[1] : null, alias: fromMatch ? (fromMatch[2] || null) : null },
            where: whereMatch ? whereMatch[1].trim() : null,
            groupBy: groupByMatch ? groupByMatch[1].split(',').map(s => s.trim()) : null,
            orderBy,
            joins: [],
            aggregateFns: [],
            having: null
        };

    try { console.debug('[SQLParser] parsed.from=', parsed.from); } catch(e){}

        let jm;
        while ((jm = joinSegmentRegex.exec(query)) !== null) {
            // jm[1]=table, jm[2]=alias?, jm[3]=onExpr
            parsed.joins.push({ table: jm[1], alias: jm[2] || null, on: jm[3].trim(), type: 'inner' });
        }

        // Extract aggregate functions from SELECT list (SUM/COUNT/AVG)
        // Support qualified column names like s.quantity
        const aggReSingle = /(SUM|COUNT|AVG)\s*\(\s*(\*|(?:\w+(?:\.\w+)?))\s*\)/i;
        for (const s of parsed.select) {
            const m = s.match(aggReSingle);
            if (m) {
                parsed.aggregateFns.push({ fn: m[1].toUpperCase(), column: m[2] });
            }
        }

        // Extract HAVING clause if present
        const havingMatch = query.match(/having\s+(.+?)(order by|$)/i);
        if (havingMatch) parsed.having = havingMatch[1].trim();

        return parsed;
    }

    // WHERE/GROUP BY/SELECT句のapplyは各Clauseクラスのstaticメソッドを利用

    // --- 既存の特殊バリデーションはそのまま ---
    _validateJoinQuery(query) {
        const n = query.toLowerCase().replace(/\s+/g, ' ');
        const f = /from\s+employees(?:\s+as)?\s*(\w+)?\s+inner\s+join\s+departments(?:\s+as)?\s*(\w+)?\s+on/;
        const m = n.match(f);
        if (!m) return false;
        const e = m[1] || 'employees';
        const d = m[2] || 'departments';
        const o = new RegExp(`on\s+(?:${e}\.dept_id\s*=\s*${d}\.dept_id|${d}\.dept_id\s*=\s*${e}\.dept_id)`);
        if (!o.test(n)) return false;
        const s = new RegExp(`select\s+(?:(?:${e}\.)?emp_name\s*,\s*(?:${d}\.)?dept_name|(?:${d}\.)?dept_name\s*,\s*(?:${e}\.)?emp_name)`);
        return s.test(n);
    }

    _validateBossQuery(query) {
        const n = query.toLowerCase().replace(/\s+/g, ' ');
        const hasJoin = n.includes('join');
        const hasWhere = n.includes('where') && n.includes('sale_date') && n.includes("'2025-02-01'");
        const hasGroupBy = n.includes('group by') && n.includes('dept_name');
        const hasHaving = n.includes('having') && n.includes('sum') && n.includes('quantity') && n.includes('10');
        return hasJoin && hasWhere && hasGroupBy && hasHaving;
    }
}
