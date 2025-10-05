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
        const resolve = (row, key) => {
            if (key in row) return row[key];
            if (!key.includes('.')) {
                const found = Object.keys(row).find(k => k.endsWith('.' + key));
                return found ? row[found] : undefined;
            }
            return undefined;
        };

        return table.map(row => {
            const obj = {};
            for (const col of selectCols) {
                if (col === '*') {
                    Object.assign(obj, row);
                } else if (/ as /i.test(col)) {
                    // エイリアス付き: col as alias
                    const [orig, alias] = col.split(/ as /i).map(s => s.trim());
                    obj[alias] = resolve(row, orig);
                } else {
                    obj[col] = resolve(row, col);
                }
            }
            return obj;
        });
    }
}
