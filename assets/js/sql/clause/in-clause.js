import { AbstractClause } from './abstract-clause.js';
import { resolveRowValue } from '../util/condition-util.js';

/**
 * IN句クラス
 */
export class InClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'IN', description: 'sql.keyword.in.desc' }, i18n);
    }

    /**
     * Apply IN specs to a result table.
     * @param {Array<Object>} table
     * @param {Array<Object>} inSpecs - [{ col, items: [v,v,...] }]
     */
    static apply(table, inSpecs) {
        if (!Array.isArray(inSpecs) || inSpecs.length === 0) return table;

        let out = table;
        for (const spec of inSpecs) {
            const col = spec.col;
            const items = Array.isArray(spec.items) ? spec.items : [];
            const set = new Set(items.map(v => (v === null || v === undefined) ? v : String(v)));
            out = out.filter(row => {
                const lhs = resolveRowValue(row, col);
                const key = lhs === null || lhs === undefined ? lhs : String(lhs);
                return set.has(key);
            });
        }
        return out;
    }
}
