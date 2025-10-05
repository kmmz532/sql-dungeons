import { AbstractClause } from './abstract-clause.js';

/**
 * ORDER BY句クラス
 */
export class OrderByClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'ORDER BY', description: 'sql.keyword.orderby.desc' }, i18n);
    }

    /**
     * ORDER BY句の模擬実行
     * @param {Array<Object>} table
     * @param {Array<{column: string, direction: 'ASC'|'DESC'}>} orderBy
     * @returns {Array<Object>}
     */
    static apply(table, orderBy) {
        if (!orderBy || !orderBy.length) return table;

        return [...table].sort((a, b) => {
            for (const { column, direction } of orderBy) {
                if (a[column] < b[column]) return direction === 'DESC' ? 1 : -1;
                if (a[column] > b[column]) return direction === 'DESC' ? -1 : 1;
            }
            return 0;
        });
    }
}
