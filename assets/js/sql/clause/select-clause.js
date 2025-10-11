import { AbstractClause } from './abstract-clause.js';
import { evaluateCondition, resolveRowValue } from '../util/condition-util.js';
import { resolveColumn } from '../util/column-resolver.js';
import { buildWindowPrecomputed } from './partitionby-clause.js';

/**
 * SELECT句クラス
 */
export class SelectClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'SELECT', description: 'sql.keyword.select.desc' }, i18n);
    }

    /**
     * SELECT句の模擬実行
     * @param {Array<Object>} table
     * @param {Array<string>} selectCols
     * @returns {Array<Object>}
     */
    static apply(table, selectCols, distinct = false) {
        // Normalize selectCols: merge entries split by naive splitting when parentheses/quotes unbalanced
        if (Array.isArray(selectCols) && selectCols.length > 0) {
            const merged = [];
            for (let i = 0; i < selectCols.length; i++) {
                let part = String(selectCols[i] || '').trim();
                // If parentheses unbalanced or ends with '(' or starts with ')' or contains unmatched quotes, merge subsequent parts
                const countOpen = (part.match(/\(/g) || []).length;
                const countClose = (part.match(/\)/g) || []).length;
                let inSingle = (part.match(/'/g) || []).length % 2 === 1;
                let inDouble = (part.match(/"/g) || []).length % 2 === 1;
                while ((countOpen > countClose || inSingle || inDouble) && i + 1 < selectCols.length) {
                    const next = String(selectCols[++i] || '').trim();
                    part = part + ', ' + next;
                    const o = (part.match(/\(/g) || []).length;
                    const c = (part.match(/\)/g) || []).length;
                    countOpen = o; // reassign
                    countClose = c; // reassign
                    inSingle = (part.match(/'/g) || []).length % 2 === 1;
                    inDouble = (part.match(/"/g) || []).length % 2 === 1;
                }
                merged.push(part);
            }
            selectCols = merged;
        }
        // 共通の列解決ユーティリティを使用
        const resolve = resolveColumn;

    const alnum = s => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    // ウィンドウ関数の事前計算（パーティションごとのランクや集約値）
    // 実際の計算は partitionby-clause.js に委譲する
    const precomputed = Array.from({ length: table.length }, () => ({}));

        const parseWindow = (s) => {
            // match patterns like:
            // ROW_NUMBER() OVER (PARTITION BY a, b ORDER BY c DESC, d)
            // RANK() OVER (...)
            // SUM(price) OVER (PARTITION BY color)
            const m = s.match(/^(\w+)\s*\(\s*([^)]*?)\s*\)\s*OVER\s*\(([^)]*)\)$/i);
            if (!m) return null;
            const fn = m[1].toUpperCase();
            const arg = (m[2] || '').trim();
            const inner = (m[3] || '').trim();
            let part = null;
            let order = null;
            const partMatch = inner.match(/partition\s+by\s+([^;]+?)(?=(order\s+by|$))/i);
            if (partMatch) part = partMatch[1].trim();
            const orderMatch = inner.match(/order\s+by\s+(.+)$/i);
            if (orderMatch) order = orderMatch[1].trim();
            return { fn, arg, partitionBy: part, orderBy: order };
        };

        const parseOrderItems = (s) => {
            if (!s) return [];
            return s.split(',').map(p => {
                const m = p.trim().match(/^(.+?)\s+(asc|desc)$/i);
                if (m) return { expr: m[1].trim(), dir: m[2].toUpperCase() };
                return { expr: p.trim(), dir: 'ASC' };
            });
        };

        const getPartitionKey = (row, partitionBy) => {
            if (!partitionBy) return '__ALL__';
            const parts = partitionBy.split(',').map(s => s.trim());
            return parts.map(p => {
                const v = resolve(row, p) !== undefined ? resolve(row, p) : (resolveRowValue ? resolveRowValue(row, p) : undefined);
                return String(v === null || v === undefined ? '__NULL__' : v);
            }).join('||');
        };

        const windowSpecs = [];
        for (let i = 0; i < selectCols.length; i++) {
            const col = String(selectCols[i] || '').trim();
            const asMatch = col.match(/\s+as\s+(\w+)$/i);
            const expr = asMatch ? col.replace(/\s+as\s+\w+$/i, '').trim() : col;
            const spec = parseWindow(expr);
            if (spec) {
                const keyName = asMatch ? asMatch[1] : col;
                windowSpecs.push({ index: i, raw: col, expr, keyName, spec });
            }
        }

        if (windowSpecs.length > 0) {
            // partitionby-clause.js に計算を委譲する
            const built = buildWindowPrecomputed(table, windowSpecs, resolve);
            for (let i = 0; i < built.length; i++) {
                precomputed[i] = Object.assign(precomputed[i] || {}, built[i] || {});
            }
        }

        const result = table.map((row, rowIdx) => {
            const obj = {};
            for (let ci = 0; ci < selectCols.length; ci++) {
                const col = String(selectCols[ci] || '').trim();
                const winSpec = windowSpecs.find(w => w.index === ci);

                // SELECT *
                if (col === '*') {
                    Object.assign(obj, row);
                    continue;
                }

                const asMatch = col.match(/\s+as\s+(\w+)$/i);
                const orig = asMatch ? col.replace(/\s+as\s+\w+$/i, '').trim() : col;
                const alias = asMatch ? asMatch[1] : null;

                if (winSpec) {
                    const key = alias || winSpec.keyName;
                    const v = (precomputed[rowIdx] && precomputed[rowIdx][winSpec.keyName] !== undefined) ? precomputed[rowIdx][winSpec.keyName] : null;
                    obj[key] = v;
                    continue;
                }

                // COALESCE
                const coalesceMatch = orig.match(/^COALESCE\((.+)\)$/i);
                if (coalesceMatch) {
                    const args = coalesceMatch[1].split(',').map(s => s.trim());
                    let val = undefined;
                    for (const a of args) {
                        if ((a.startsWith("'") && a.endsWith("'")) || (a.startsWith('"') && a.endsWith('"'))) {
                            val = a.slice(1, -1);
                        } else if (/^-?\d+(?:\.\d+)?$/.test(a)) {
                            val = Number(a);
                        } else if (/^null$/i.test(a)) {
                            val = null;
                        } else {
                            val = resolve(row, a);
                            if (val === undefined) val = resolveRowValue(row, a);
                        }
                        if (val !== null && val !== undefined) break;
                    }
                    obj[alias || orig] = val;
                    continue;
                }

                // CASE WHEN ... THEN ... ELSE ... END
                const caseMatch = orig.match(/^CASE\s+WHEN\s+(.+?)\s+THEN\s+(.+?)(?:\s+ELSE\s+(.+?))?\s+END$/i);
                if (caseMatch) {
                    const cond = caseMatch[1].trim();
                    const thenExpr = caseMatch[2].trim();
                    const elseExpr = caseMatch[3] ? caseMatch[3].trim() : null;
                    let val;
                    if (evaluateCondition(row, cond, { permissive: false })) {
                        val = (thenExpr.match(/^'.*'$/) || thenExpr.match(/^".*"$/)) ? thenExpr.slice(1, -1) : ( /^null$/i.test(thenExpr) ? null : resolve(row, thenExpr) );
                    } else {
                        val = elseExpr ? ((elseExpr.match(/^'.*'$/) || elseExpr.match(/^".*"$/)) ? elseExpr.slice(1, -1) : ( /^null$/i.test(elseExpr) ? null : resolve(row, elseExpr) )) : null;
                    }
                    obj[alias || orig] = val;
                    continue;
                }

                let val = resolve(row, orig);
                if (val === undefined) {
                    const target = alnum(orig);
                    const foundKey = Object.keys(row).find(k => alnum(k) === target);
                    if (foundKey) val = row[foundKey];
                }
                obj[alias || orig] = val;
            }
            return obj;
        });

        if (!distinct) return result;

        const seen = new Set();
        const unique = [];
        for (const r of result) {
            const key = JSON.stringify(r);
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(r);
            }
        }
        return unique;
    }
}
