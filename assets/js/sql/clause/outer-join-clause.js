import { AbstractClause } from './abstract-clause.js';
import { evaluateCondition } from '../util/condition-util.js';

/**
 * OUTER JOIN句クラス (LEFTおよびRIGHTキーワードをjoin.typeでサポート)
 * apply(table, joins, mockDatabase)
 */
export class OuterJoinClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'OUTER JOIN', description: 'sql.keyword.outer_join.desc' }, i18n);
    }

    static apply(table, joins, mockDatabase) {
        if (!Array.isArray(joins) || joins.length === 0) return table;
        let accumulated = table;

        const prefixRow = (row, prefix) => {
            const o = {};
            for (const k in row) o[`${prefix}.${k}`] = row[k];
            return o;
        };

        for (const j of joins) {
            const joinTable = mockDatabase && (mockDatabase[j.table.toLowerCase()] || mockDatabase[j.table]);
            if (!Array.isArray(joinTable)) {
                if (String(j.type).toLowerCase().includes('left')) {
                    continue;
                }
                accumulated = [];
                break;
            }
            const joinName = j.alias || j.table;
            const newAccum = [];

            for (const leftRow of accumulated) {
                let matched = false;
                for (const rightRow of joinTable) {
                    const prefRight = prefixRow(rightRow, joinName);
                    const combined = Object.assign({}, leftRow, prefRight);
                    let ok = true;
                    try { ok = evaluateCondition(combined, j.on || '', { permissive: false }); } catch (e) { ok = false; }
                    if (ok) {
                        matched = true;
                        newAccum.push(combined);
                    }
                }
                if (!matched && String(j.type).toLowerCase().includes('left')) {
                    const nullRight = {};
                    const sampleRight = joinTable[0] || {};
                    for (const k in sampleRight) nullRight[`${joinName}.${k}`] = null;
                    newAccum.push(Object.assign({}, leftRow, nullRight));
                }
            }
            accumulated = newAccum;
            if (accumulated.length === 0) break;
        }

        return accumulated;
    }
}

export default OuterJoinClause;
