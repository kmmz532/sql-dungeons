// SQLParser: クエリのバリデーションとエミュレーションを統合

import { getFallbackClauseClasses } from './clause/exports.js';
import Registry from '../register.js';
import { SumFunction } from './aggregate/sum-function.js';
import { CountFunction } from './aggregate/count-function.js';
import { AvgFunction } from './aggregate/avg-function.js';

// Helper: resolve clause class from runtime registry with constants fallback
const getClauseClass = (key) => {
    try {
        const r = Registry.get(key);
        if (r) return r;
    } catch (e) {
        // ignore
    }
    const fb = getFallbackClauseClasses();
    return fb[key];
};

/**
 * SQLParser: SQL文の簡易パースと模擬実行エンジン
 * 今後のSandbox拡張も見据えた設計
 */
export class SQLParser {
    /**
     * クエリが課題の条件を満たすか判定
     */
    validate(query, floorData) {
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
            if (!parsed) return [];

            // Handle INSERT via registered clause class (non-mutating)
            if (parsed.insert) {
                const InsertCls = getClauseClass('INSERT');
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
                    if (accumulated.length === 0) break;
                }
            }

            // WHERE句フィルタ（registry 経由で取得、constants をフォールバック）
            let resultTable = accumulated;
            if (parsed.where) {
                const WhereCls = getClauseClass('WHERE');
                if (WhereCls && typeof WhereCls.apply === 'function') {
                    resultTable = WhereCls.apply(resultTable, parsed.where);
                }
            }

            // GROUP BY句 (集約関数を受け取って集計する)
            if (parsed.groupBy) {
                const GroupByCls = getClauseClass('GROUP BY');
                if (GroupByCls) {
                    // Build aggregate function instances expected by GroupByClause
                    const aggInstances = (parsed.aggregateFns || []).map(af => {
                        switch (af.fn) {
                            case 'SUM': return new SumFunction(af.column);
                            case 'COUNT': return new CountFunction(af.column === '*' ? undefined : af.column);
                            case 'AVG': return new AvgFunction(af.column);
                            default: return null;
                        }
                    }).filter(Boolean);
                    if (typeof GroupByCls.groupAndAggregate === 'function') {
                        resultTable = GroupByCls.groupAndAggregate(resultTable, parsed.groupBy, aggInstances);
                    } else if (typeof GroupByCls.apply === 'function') {
                        resultTable = GroupByCls.apply(resultTable, parsed);
                    }
                }
            }

            // HAVING句: グループ化後の絞り込み
            if (parsed.having) {
                const HavingCls = getClauseClass('HAVING');
                if (HavingCls && typeof HavingCls.apply === 'function') {
                    resultTable = HavingCls.apply(resultTable, parsed.having);
                }
            }

            // ORDER BY句
            if (parsed.orderBy) {
                const OrderByCls = getClauseClass('ORDER BY');
                if (OrderByCls && typeof OrderByCls.apply === 'function') {
                    resultTable = OrderByCls.apply(resultTable, parsed.orderBy);
                }
            }

            // SELECT句
            const SelectCls = getClauseClass('SELECT');
            if (SelectCls && typeof SelectCls.apply === 'function') {
                return SelectCls.apply(resultTable, parsed.select);
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
    const fromMatch = query.match(/from\s+(\w+)(?:\s+(?:as\s+)?(\w+))?/i);
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
            from: { table: fromMatch[1], alias: fromMatch[2] || null },
            where: whereMatch ? whereMatch[1].trim() : null,
            groupBy: groupByMatch ? groupByMatch[1].split(',').map(s => s.trim()) : null,
            orderBy,
            joins: [],
            aggregateFns: [],
            having: null
        };

        let jm;
        while ((jm = joinSegmentRegex.exec(query)) !== null) {
            // jm[1]=table, jm[2]=alias?, jm[3]=onExpr
            parsed.joins.push({ table: jm[1], alias: jm[2] || null, on: jm[3].trim(), type: 'inner' });
        }

        // Extract aggregate functions from SELECT list (SUM/COUNT/AVG)
        const aggRe = /(SUM|COUNT|AVG)\s*\(\s*(\*|[A-Za-z_][A-Za-z0-9_]*)\s*\)/ig;
        for (const s of parsed.select) {
            const m = aggRe.exec(s);
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
