import { AbstractClause } from './abstract-clause.js';
import { resolveColumn } from '../util/column-resolver.js';

/**
 * GROUP BY句クラス
 */
export class GroupByClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'GROUP BY', description: 'sql.keyword.groupby.desc' }, i18n);
    }

    /**
     * GROUP BY句の模擬実行
     * @param {Array<Object>} table
     * @param {Array<string>} groupKeys
     * @param {AggregateFunction[]} aggregateFns
     * @returns {Array<Object>}
     */
    static groupAndAggregate(table, groupKeys, aggregateFns = []) {
        const groups = {};
        for (const row of table) {
            const key = groupKeys.map(k => resolveColumn(row, k)).join('||');
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        }
        return Object.entries(groups).map(([key, rows]) => {
            const result = {};
            groupKeys.forEach((k, i) => {
                result[k] = key.split('||')[i];
            });
            for (const fn of aggregateFns) {
                result[fn.getResultKey()] = fn.apply(rows);
            }
            return result;
        });
    }
}
