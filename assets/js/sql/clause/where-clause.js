import { AbstractClause } from './abstract-clause.js';

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
        // 例: price >= 1000, name = 'foo'
        const m = whereStr.match(/(\w+)\s*(=|>=|<=|>|<)\s*('?\w+'?)/);
        if (!m) return table;
        const [_, col, op, valRaw] = m;
        let val = valRaw.replace(/'/g, '');
        return table.filter(row => {
            switch (op) {
                case '=': return row[col] == val;
                case '>=': return row[col] >= val;
                case '<=': return row[col] <= val;
                case '>': return row[col] > val;
                case '<': return row[col] < val;
                default: return true;
            }
        });
    }
}
