import { AbstractClause } from './abstract-clause.js';
import { evaluateCondition } from '../util/condition-util.js';

/**
 * WHERE句クラス
 */
export class WhereClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'WHERE', description: 'sql.keyword.where.desc' }, i18n);
    }

    /**
     * WHERE句の模擬実行
     * @param {Array<Object>} table
     * @param {string} whereStr
     * @returns {Array<Object>}
     */
    static apply(table, whereStr) {
        // col IN (val1, val2, ...)
        // col IN (SELECT ...)
        // col = 'foo', col >= 1000, e.price = d.avg

        // Use the centralized evaluator which understands LIKE, IN(...) and aggregate comparisons
        return table.filter(row => evaluateCondition(row, whereStr, { permissive: false }));
    }
}
