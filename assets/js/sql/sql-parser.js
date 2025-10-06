// SQLParser: クエリのバリデーションとエミュレーションを統合
import Registry from '../register.js';
import { evaluateCondition } from './util/condition-util.js';

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
    // Toggle verbose debugging for SQL parsing/emulation
    static DEBUG = true;
    /**
     * クエリが課題の条件を満たすか判定
     * @param {string} query
     * @param {object} floorData
     * @param {object} mockDatabase
     */
    validate(query, floorData, mockDatabase) {
        if (floorData.answer) {
            const rawUser = this.emulate(query, floorData.floor, mockDatabase);
            const rawAnswer = this.emulate(floorData.answer, floorData.floor, mockDatabase);
            const userResult = this._normalizeResult(rawUser);
            const answerResult = this._normalizeResult(rawAnswer);

            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] validate rawUser=', rawUser); } catch(e){}
                try { console.debug('[SQLParser] validate rawAnswer=', rawAnswer); } catch(e){}
                try { console.debug('[SQLParser] validate answerQuery=', floorData.answer); } catch(e){}
                try { console.debug('[SQLParser] validate parsedAnswer=', this.parseSQL(floorData.answer)); } catch(e){}
            }

            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] validate userResult=', userResult); } catch(e){}
                try { console.debug('[SQLParser] validate answerResult=', answerResult); } catch(e){}
            }

            if (Array.isArray(answerResult) && answerResult.length === 0) {
                return Array.isArray(userResult) && userResult.length === 0;
            }

            if (Array.isArray(userResult) && userResult.length > 0 && this._resultsEqual(userResult, answerResult)) {
                return true;
            }
            try {
                if (Array.isArray(answerResult) && Array.isArray(userResult) && !this._resultsEqual(userResult, answerResult)) {
                    console.debug('[SQLParser] validate mismatch: user length=', userResult.length, 'answer length=', answerResult.length);
                    // always show sample when mismatch to help diagnostics
                    console.debug('[SQLParser] validate sample user[0]=', userResult[0], 'answer[0]=', answerResult[0]);
                    if (SQLParser.DEBUG) {
                        console.debug('[SQLParser] full userResult=', userResult);
                        console.debug('[SQLParser] full answerResult=', answerResult);
                    }
                }
            } catch(e){}
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
            // If parsing fails, bail out immediately to avoid reading properties of null
            if (!parsed) return [];
            // If parseSQL returned multiple SELECTs (UNION/UNION ALL), evaluate each and combine
            if (Array.isArray(parsed.multiple) && parsed.multiple.length > 0) {
                // Evaluate each part and collect results
                const resultsList = parsed.multiple.map(p => this.emulate(p.raw, currentFloor, mockDatabase) || []);

                // Helper: strip any prefix like 'alias.' or 'table.' from object keys
                const stripPrefixes = rows => rows.map(r => {
                    const out = {};
                    for (const k of Object.keys(r)) {
                        const short = k.includes('.') ? k.split('.').pop() : k;
                        out[short] = r[k];
                    }
                    return out;
                });

                // Determine union column set: union of all keys after stripping prefixes
                const allKeys = new Set();
                for (const rl of resultsList) {
                    for (const row of rl) {
                        for (const k of Object.keys(row)) {
                            const short = k.includes('.') ? k.split('.').pop() : k;
                            allKeys.add(short);
                        }
                    }
                }
                const keysArr = Array.from(allKeys);

                // Normalize each result row to have same keys (missing -> null) and stripped key names
                const normalizedLists = resultsList.map(rl => stripPrefixes(rl).map(r => {
                    const nr = {};
                    for (const key of keysArr) nr[key] = (key in r) ? r[key] : null;
                    return nr;
                }));

                if (parsed.unionAll) {
                    // concat all preserving duplicates
                    return normalizedLists.flat();
                } else {
                    // UNION: concat then dedupe rows by JSON
                    const all = normalizedLists.flat();
                    const seen = new Set();
                    const unique = [];
                    for (const r of all) {
                        const k = JSON.stringify(r);
                        if (!seen.has(k)) { seen.add(k); unique.push(r); }
                    }
                    return unique;
                }
            }
            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] parsed:', parsed); } catch (e) {}
                try { console.debug('[SQLParser] parsed.joins=', parsed?.joins); } catch(e){console.error(e);} 
            }

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
            // normalize table key to lower-case to match mockDatabase keys
            const baseTableKey = base.table ? String(base.table).toLowerCase() : base.table;
            const baseRows = mockDatabase[baseTableKey] || mockDatabase[base.table];
            if (!Array.isArray(baseRows)) return [];

            // 初期 accumulated rows
            let accumulated = baseRows.map(r => prefixRow(r, baseName));
            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] after base rows, accumulated=', accumulated.length); } catch(e){console.error(e);}
                try { console.debug('[SQLParser] accumulated sample keys=', Object.keys(accumulated[0] || {}).slice(0,20)); } catch(e){console.error(e);}
            }

            // 各 JOIN を順に適用（簡易的な nested-loop INNER JOIN）
            if (parsed.joins && parsed.joins.length) {
                for (const j of parsed.joins) {
                    const joinTable = mockDatabase[j.table.toLowerCase()] || mockDatabase[j.table];
                    if (!Array.isArray(joinTable)) {
                        accumulated = []; break;
                    }
                    const joinName = j.alias || j.table;
                    const newAccum = [];

                    // parse ON: prefer using centralized evaluateCondition which supports more operators
                    const onExpr = j.on.trim();
                    const onMatch = null;

                    for (const leftRow of accumulated) {
                        for (const rightRow of joinTable) {
                            const prefRight = prefixRow(rightRow, joinName);
                            const combined = Object.assign({}, leftRow, prefRight);

                            let onOk = true;
                            try {
                                // Use evaluateCondition to support richer ON conditions (LIKE, IN, comparisons)
                                onOk = evaluateCondition(combined, onExpr, { permissive: false });
                            } catch (e) {
                                // fallback: try the simple equality parse
                                const fallback = j.on.match(/(\w+(?:\.\w+)?)\s*=\s*(\w+(?:\.\w+)?)/);
                                if (fallback) {
                                    const leftKey = fallback[1];
                                    const rightKey = fallback[2];
                                    const getVal = (obj, key) => {
                                        if (key in obj) return obj[key];
                                        if (!key.includes('.')) {
                                            const found = Object.keys(obj).find(k => k.endsWith('.' + key));
                                            return found ? obj[found] : undefined;
                                        }
                                        return undefined;
                                    };
                                    const lv = getVal(combined, leftKey);
                                    const rv = getVal(combined, rightKey);
                                    onOk = (lv === rv);
                                } else {
                                    onOk = false;
                                }
                            }

                            if (onOk) newAccum.push(combined);
                        }
                    }
                    accumulated = newAccum;
                    if (SQLParser.DEBUG) {
                        try { console.debug('[SQLParser] after join', j.table, 'accumulated=', accumulated.length); } catch(e){console.error(e);}
                    }
                    if (accumulated.length === 0) break;
                }
            }

            // フェーズ順をランタイムの登録状況（レジストリ）またはフォールバック manifest から決定する
            let resultTable = accumulated;
            // Preprocess WHERE: handle IN (SELECT ...) by evaluating the subquery and replacing RHS with a literal list
            try {
                if (parsed.where) {
                    if (SQLParser.DEBUG) console.debug('[SQLParser] where before preprocess =', parsed.where);
                    const inSubMatch = parsed.where.match(/(\w+(?:\.\w+)?)\s+in\s*\((\s*select[\s\S]+)\)/i);
                    if (inSubMatch) {
                        const col = inSubMatch[1];
                        const subQuery = inSubMatch[2];
                        // Evaluate subquery
                        if (SQLParser.DEBUG) console.debug('[SQLParser] evaluating IN subquery:', subQuery);
                        const subRows = this.emulate(subQuery, currentFloor, mockDatabase) || [];
                        if (SQLParser.DEBUG) console.debug('[SQLParser] IN subquery rows count=', subRows.length, 'sample=', subRows.slice(0,5));
                        // Attempt to extract single-column values from subRows
                        const vals = subRows.map(r => {
                            const keys = Object.keys(r);
                            if (keys.length === 1) return r[keys[0]];
                            // If more columns, pick first
                            return r[keys[0]];
                        });
                        if (SQLParser.DEBUG) console.debug('[SQLParser] IN subquery extracted values=', vals);
                        // Build literal list string for WhereClause to handle
                        const litList = vals.map(v => (typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : String(v))).join(', ');
                        parsed.where = `${col} IN (${litList})`;
                        if (SQLParser.DEBUG) console.debug('[SQLParser] where replaced with=', parsed.where);
                    }
                }
            } catch (e) { if (SQLParser.DEBUG) console.error('Error preprocessing IN(subquery):', e); }

            // Additionally handle equality to subquery: col = (SELECT ...)
            try {
                if (parsed.where) {
                    const eqSubMatch = parsed.where.match(/(\w+(?:\.\w+)?)\s*=\s*\((\s*select[\s\S]+)\)/i);
                    if (eqSubMatch) {
                        const col = eqSubMatch[1];
                        const subQuery = eqSubMatch[2];
                        if (SQLParser.DEBUG) console.debug('[SQLParser] evaluating = (subquery):', subQuery);
                        const subRows = this.emulate(subQuery, currentFloor, mockDatabase) || [];
                        if (SQLParser.DEBUG) console.debug('[SQLParser] =(subquery) rows count=', subRows.length, 'sample=', subRows.slice(0,5));
                        const vals = subRows.map(r => {
                            const keys = Object.keys(r);
                            if (keys.length === 1) return r[keys[0]];
                            return r[keys[0]];
                        });
                        if (SQLParser.DEBUG) console.debug('[SQLParser] =(subquery) extracted values=', vals);
                        if (vals.length === 0) {
                            // No matching values — make condition impossible
                            parsed.where = `${col} IN ()`;
                        } else if (vals.length === 1) {
                            const v = vals[0];
                            parsed.where = `${col} = ${typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : String(v)}`;
                        } else {
                            // multiple values -> convert to IN list
                            const litList = vals.map(v => (typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : String(v))).join(', ');
                            parsed.where = `${col} IN (${litList})`;
                        }
                        if (SQLParser.DEBUG) console.debug('[SQLParser] where replaced with=', parsed.where);
                    }
                }
            } catch (e) { if (SQLParser.DEBUG) console.error('Error preprocessing =(subquery):', e); }
            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] before clauses, rows=', resultTable.length); } catch(e){console.error(e);}
                try { console.debug('[SQLParser] parsed.select=', parsed.select); } catch(e){}
                try { console.debug('[SQLParser] parsed.aggregateFns=', parsed.aggregateFns); } catch(e){}
            }
            const registered = Registry.getAll ? Registry.getAll('clause') : {};
            // getAll returns an object of { KEY: ctor }
            const runtimeKeys = Object.keys(registered || {});
            if (SQLParser.DEBUG) {
                try { console.debug('[SQLParser] runtimeKeys=', runtimeKeys); } catch(e){}
            }

            // fallback manifest keys (from static export) if registry is empty
            const fallbackManifest = (typeof getFallbackClauseClasses === 'function') ? getFallbackClauseClasses() : {};
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

            // NOTE: aggregate functions will be applied after WHERE/GROUP BY in the main loop below

            for (const key of keys) {
                const phase = key.toUpperCase();
                const Cls = getRegistryClass(phase, 'clause');
                if (!Cls) continue;

                let prop = null;
                if (phase === 'WHERE') prop = 'where';
                else if (phase === 'GROUP BY') prop = 'groupBy';
                else if (phase === 'HAVING') prop = 'having';
                else if (phase === 'ORDER BY') prop = 'orderBy';
                else if (phase === 'SELECT') prop = 'select';

                if (!prop || !(prop in parsed) || parsed[prop] == null) continue;

                if (phase === 'GROUP BY') {
                    const aggInstances = (parsed.aggregateFns || []).map(af => {
                        const AggCls = getRegistryClass(String(af.fn).toUpperCase(), 'aggregate');
                        if (!AggCls) return null;
                        // Pass column (undefined for *) and distinct flag
                        const col = (af.column === '*' || String(af.column).trim() === '1') ? undefined : af.column;
                        return new AggCls(col, !!af.distinct);
                    }).filter(Boolean);
                    if (typeof Cls.groupAndAggregate === 'function') {
                        resultTable = Cls.groupAndAggregate(resultTable, parsed.groupBy, aggInstances);
                        if (SQLParser.DEBUG) {
                            try { console.debug('[SQLParser] after GROUP BY, rows=', resultTable.length, 'sample=', resultTable.slice(0,3)); } catch(e){console.error(e);} 
                        }
                        continue;
                    }
                }

                if (phase === 'HAVING' || phase === 'WHERE') {
                    if (typeof Cls.apply === 'function') {
                        resultTable = Cls.apply(resultTable, parsed[prop]);
                        if (SQLParser.DEBUG) {
                            try { console.debug('[SQLParser] after', phase, 'rows=', resultTable.length, 'sample=', resultTable.slice(0,3)); } catch(e){console.error(e);} 
                        }
                    }
                    continue;
                }

                if (phase === 'IN') {
                    try {
                        if (parsed.in && Array.isArray(parsed.in) && typeof Cls.apply === 'function') {
                            resultTable = Cls.apply(resultTable, parsed.in);
                            if (SQLParser.DEBUG) console.debug('[SQLParser] after IN, rows=', resultTable.length);
                        }
                    } catch (e) { if (SQLParser.DEBUG) console.error('Error applying IN clause', e); }
                    continue;
                }

                if (phase === 'ORDER BY') {
                    if (typeof Cls.apply === 'function') {
                        resultTable = Cls.apply(resultTable, parsed.orderBy);
                        if (SQLParser.DEBUG) {
                            try { console.debug('[SQLParser] after ORDER BY, rows=', resultTable.length); } catch(e){console.error(e);} 
                        }
                    }
                    continue;
                }

                if (phase === 'SELECT') {
                    if ((parsed.aggregateFns || []).length > 0 && (!parsed.groupBy || parsed.groupBy.length === 0)) {
                        const aggInstances = (parsed.aggregateFns || []).map(af => {
                            const AggCls = getRegistryClass(String(af.fn).toUpperCase(), 'aggregate');
                            if (!AggCls) return null;
                            const col = (af.column === '*' || String(af.column).trim() === '1') ? undefined : af.column;
                            return new AggCls(col, !!af.distinct);
                        }).filter(Boolean);
                        const aggRow = {};
                        for (const a of aggInstances) {
                            const key = a.getResultKey();
                            try {
                                aggRow[key] = a.apply(resultTable);
                            } catch (e) {
                                aggRow[key] = null;
                            }
                        }
                        resultTable = [aggRow];
                    }

                    if (typeof Cls.apply === 'function') {
                        const finalRes = Cls.apply(resultTable, parsed.select, !!parsed.distinct);
                        if (SQLParser.DEBUG) {
                            try { console.debug('[SQLParser] SELECT result rows=', finalRes.length, 'sample=', finalRes.slice(0,3)); } catch(e){console.error(e);} 
                        }
                        return finalRes;
                    }
                    return [];
                }
            }

            return [];
        } catch (e) {
            console.error('SQLParser emulate error:', e);
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

        // Handle UNION / UNION ALL by splitting top-level SELECTs
        const unionSplit = query.split(/\bunion\s+all\b|\bunion\b/i);
        if (unionSplit.length > 1) {
            // Determine if any 'union all' literal exists to preserve duplicates
            const unionAll = /\bunion\s+all\b/i.test(query);
            // Build array of raw SELECT parts (trimmed)
            const parts = query.split(/\bunion\s+all\b|\bunion\b/i).map(s => s.trim()).filter(Boolean);
            return { multiple: parts.map(p => ({ raw: p })), unionAll };
        }

        // SELECT ... FROM ... [WHERE ...] [GROUP BY ...] [ORDER BY ...]
    // capture optional DISTINCT after SELECT
    const selectMatch = query.match(/select\s+(distinct\s+)?(.+?)\s+from\s+/i);
    // FROM と alias (例: from employees as e)
    // Use the first occurrence of 'from' to avoid accidentally matching nested or later FROMs
    const fromPos = query.search(/\bfrom\b/i);
    let fromMatch = null;
    if (fromPos !== -1) {
        const tail = query.slice(fromPos);
        // Do not treat SQL keywords that follow the table name (like INNER/LEFT/RIGHT/JOIN/WHERE/GROUP/ORDER)
        // as the table alias. Use negative lookahead to avoid capturing them as alias.
        fromMatch = tail.match(/from\s+(\w+)(?:\s+(?:as\s+)?(?!inner\b|left\b|right\b|join\b|where\b|group\b|order\b)(\w+))?/i);
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

        const rawSelect = selectMatch[2];
        const parsed = {
            select: rawSelect.split(',').map(s => s.trim()),
            distinct: !!(selectMatch[1] && /distinct/i.test(selectMatch[1])),
            from: { table: fromMatch ? fromMatch[1] : null, alias: fromMatch ? (fromMatch[2] || null) : null },
            where: whereMatch ? whereMatch[1].trim() : null,
            in: null, // will hold parsed IN specs: [{col, items}] or [{col, subquery}]
            groupBy: groupByMatch ? groupByMatch[1].split(',').map(s => s.trim()) : null,
            orderBy,
            joins: [],
            aggregateFns: [],
            having: null
        };

        // parse literal IN(...) in where into parsed.in if present
        try {
            if (parsed.where) {
                const inLitMatch = parsed.where.match(/(\w+(?:\.\w+)?)\s+in\s*\(([^)]+)\)/i);
                if (inLitMatch) {
                    const col = inLitMatch[1];
                    const inner = inLitMatch[2].trim();
                    // split into values (simple)
                    const parts = inner.match(/('.*?'|[^,\s][^,]*[^,\s]?)/g) || [];
                    const items = parts.map(p => {
                        p = p.trim();
                        if (p.startsWith("'") && p.endsWith("'")) return p.slice(1, -1);
                        if (/^\d+$/.test(p)) return Number(p);
                        return p;
                    });
                    parsed.in = [{ col, items }];
                }
            }
        } catch (e) {}

        // Normalize aggregate function tokens in select list to uppercase function name
        try {
            const aggReSingle = /(SUM|COUNT|AVG)\s*\(\s*(\*|(?:\w+(?:\.\w+)?))\s*\)/i;
            parsed.select = parsed.select.map(s => {
                const m = s.match(aggReSingle);
                if (m) {
                    return s.replace(aggReSingle, `${m[1].toUpperCase()}(${m[2]})`);
                }
                return s;
            });
        } catch (e) {}

    try { console.debug('[SQLParser] parsed.from=', parsed.from); } catch(e){console.error(e);}

        let jm;
        while ((jm = joinSegmentRegex.exec(query)) !== null) {
            // jm[1]=table, jm[2]=alias?, jm[3]=onExpr
            parsed.joins.push({ table: jm[1], alias: jm[2] || null, on: jm[3].trim(), type: 'inner' });
        }

        // Extract aggregate functions from SELECT list (SUM/COUNT/AVG) and support DISTINCT
        // Support forms: COUNT(*), COUNT(1), COUNT(col), COUNT(DISTINCT col)
        const aggReSingle = /(SUM|COUNT|AVG|MAX|MIN)\s*\(\s*(?:DISTINCT\s+)?(\*|\d+|(?:\w+(?:\.\w+)?))\s*\)/i;
        const aggDistinctRe = /(SUM|COUNT|AVG|MAX|MIN)\s*\(\s*DISTINCT\s+(\*|\d+|(?:\w+(?:\.\w+)?))\s*\)/i;
        for (const s of parsed.select) {
            // capture DISTINCT separately
            const md = s.match(aggDistinctRe);
            if (md) {
                parsed.aggregateFns.push({ fn: md[1].toUpperCase(), column: md[2], distinct: true });
                continue;
            }
            const m = s.match(aggReSingle);
            if (m) {
                parsed.aggregateFns.push({ fn: m[1].toUpperCase(), column: m[2], distinct: false });
            }
        }

        // Extract HAVING clause if present
        const havingMatch = query.match(/having\s+(.+?)(order by|$)/i);
        if (havingMatch) parsed.having = havingMatch[1].trim();

        // no special extraction of LIKE from HAVING; HAVING will be evaluated by HavingClause via evaluateCondition

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
