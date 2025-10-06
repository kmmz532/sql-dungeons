import { AbstractClause } from './abstract-clause.js';
import { evaluateCondition } from '../util/condition-util.js';

/**
 * INNER JOIN clause implementation.
 * apply(table, joins, mockDatabase)
 * joins: array of { table, alias, on, type }
 */
export class InnerJoinClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'INNER JOIN', description: 'sql.keyword.inner_join.desc' }, i18n);
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
                accumulated = [];
                break;
            }
            const joinName = j.alias || j.table;
            const newAccum = [];

            for (const leftRow of accumulated) {
                for (const rightRow of joinTable) {
                    const prefRight = prefixRow(rightRow, joinName);
                    const combined = Object.assign({}, leftRow, prefRight);
                    let ok = true;
                    try {
                        ok = evaluateCondition(combined, j.on || '', { permissive: false });
                    } catch (e) {
                        ok = false;
                    }
                    if (ok) newAccum.push(combined);
                }
            }
            accumulated = newAccum;
            if (accumulated.length === 0) break;
        }

        return accumulated;
    }
}

export default InnerJoinClause;
