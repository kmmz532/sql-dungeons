import { AbstractClause } from './abstract-clause.js';

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
    static apply(table, selectCols) {
        return table.map(row => {
            const obj = {};
            for (const col of selectCols) {
                if (col === '*') {
                    Object.assign(obj, row);
                } else if (/ as /i.test(col)) {
                    // エイリアス: col as alias
                    const [orig, alias] = col.split(/ as /i).map(s => s.trim());
                    obj[alias] = row[orig];
                } else {
                    obj[col] = row[col];
                }
            }
            return obj;
        });
    }
}
