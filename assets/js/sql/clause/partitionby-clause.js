import { SumFunction } from '../aggregate/sum-function.js';
import { CountFunction } from '../aggregate/count-function.js';
import { AvgFunction } from '../aggregate/avg-function.js';
import { MinFunction } from '../aggregate/min-function.js';
import { MaxFunction } from '../aggregate/max-function.js';
import { computeRowNumber, computeRank } from './rank-function.js';
import { resolveRowValue } from '../util/condition-util.js';

// パーティションごとにウィンドウ関数値を precomputed に計算する
// table: 元テーブルの配列
// windowSpecs: [{ index, raw, expr, keyName, spec }, ...]
// resolve: 行のキーを解決するヘルパー
export const buildWindowPrecomputed = (table, windowSpecs, resolve) => {
    const precomputed = Array.from({ length: table.length }, () => ({}));

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

    for (const w of windowSpecs) {
        console.debug('[window] processing spec]', w);
        const partBy = w.spec.partitionBy;
        const orderBy = parseOrderItems(w.spec.orderBy);
        const fn = (w.spec.fn || '').toUpperCase();
        const fnArg = w.spec.arg || '';

        const groups = new Map();
        table.forEach((r, idx) => {
            const key = getPartitionKey(r, partBy);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ idx, row: r });
        });

        for (const [key, items] of groups.entries()) {
            console.debug('[window] partition]', { spec: w.keyName, key, count: items.length, fn, fnArg });
            if (orderBy.length > 0) {
                items.sort((a, b) => {
                    for (const ob of orderBy) {
                        const va = (resolve(a.row, ob.expr) !== undefined) ? resolve(a.row, ob.expr) : (resolveRowValue ? resolveRowValue(a.row, ob.expr) : undefined);
                        const vb = (resolve(b.row, ob.expr) !== undefined) ? resolve(b.row, ob.expr) : (resolveRowValue ? resolveRowValue(b.row, ob.expr) : undefined);
                        if (va == null && vb == null) continue;
                        if (va == null) return ob.dir === 'ASC' ? -1 : 1;
                        if (vb == null) return ob.dir === 'ASC' ? 1 : -1;
                        if (va < vb) return ob.dir === 'ASC' ? -1 : 1;
                        if (va > vb) return ob.dir === 'ASC' ? 1 : -1;
                    }
                    return 0;
                });
            }

            if (fn === 'ROW_NUMBER') {
                computeRowNumber(items, w.keyName, precomputed);
            } else if (fn === 'RANK') {
                computeRank(items, orderBy, w.keyName, precomputed, resolve, resolveRowValue);
            } else if (['SUM','COUNT','AVG','MIN','MAX'].includes(fn)) {
                // ORDER BY がある場合は累積（running）集計を行う
                if (orderBy && orderBy.length > 0) {
                    let runningSum = 0;
                    let runningCount = 0;
                    let runningMin = null;
                    let runningMax = null;
                    for (let t = 0; t < items.length; t++) {
                        const it = items[t];
                        const row = it.row;
                        const rawVal = (resolve(row, fnArg) !== undefined) ? resolve(row, fnArg) : (resolveRowValue ? resolveRowValue(row, fnArg) : undefined);
                        const numVal = (rawVal === null || rawVal === undefined || Number.isNaN(Number(rawVal))) ? null : Number(rawVal);

                        if (fn === 'COUNT') {
                            // COUNT(*) or COUNT(col)
                            if (!fnArg || fnArg === '*' || String(fnArg).trim() === '1') {
                                runningCount += 1;
                                precomputed[it.idx][w.keyName] = runningCount;
                            } else {
                                if (rawVal !== null && rawVal !== undefined) runningCount += 1;
                                precomputed[it.idx][w.keyName] = runningCount;
                            }
                        } else if (fn === 'SUM') {
                            if (numVal !== null) runningSum += numVal;
                            precomputed[it.idx][w.keyName] = runningSum;
                        } else if (fn === 'AVG') {
                            if (numVal !== null) { runningSum += numVal; runningCount += 1; }
                            precomputed[it.idx][w.keyName] = (runningCount === 0 ? null : (runningSum / runningCount));
                        } else if (fn === 'MIN') {
                            if (numVal !== null) {
                                if (runningMin === null) runningMin = numVal; else if (numVal < runningMin) runningMin = numVal;
                            }
                            precomputed[it.idx][w.keyName] = runningMin;
                        } else if (fn === 'MAX') {
                            if (numVal !== null) {
                                if (runningMax === null) runningMax = numVal; else if (numVal > runningMax) runningMax = numVal;
                            }
                            precomputed[it.idx][w.keyName] = runningMax;
                        }
                    }
                    console.debug('[window] running aggregate done]', { spec: w.keyName, key, fn, fnArg });
                } else {
                    // partition 全体の集計値を単一値として各行に設定
                    let aggInstance = null;
                    if (fn === 'SUM') aggInstance = new SumFunction(fnArg);
                    else if (fn === 'COUNT') aggInstance = new CountFunction(fnArg);
                    else if (fn === 'AVG') aggInstance = new AvgFunction(fnArg);
                    else if (fn === 'MIN') aggInstance = new MinFunction(fnArg);
                    else if (fn === 'MAX') aggInstance = new MaxFunction(fnArg);

                    const rowsForAgg = items.map(it => it.row);
                    let aggVal = null;
                    try { aggVal = aggInstance ? aggInstance.apply(rowsForAgg) : null; } catch(e) { aggVal = null; }
                    console.debug('[window] aggregate result]', { spec: w.keyName, key, aggVal, sampleRows: rowsForAgg.slice(0,3) });
                    for (const it of items) { precomputed[it.idx][w.keyName] = aggVal; }
                }
            }
        }
    }

    return precomputed;
};

export default { buildWindowPrecomputed };
