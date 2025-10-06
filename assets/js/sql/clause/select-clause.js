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
            if (!key) return undefined;
            // direct match (case-sensitive)
            if (key in row) return row[key];
            const lowerKey = key.toLowerCase();
            // try case-insensitive exact match
            const exact = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
            if (exact) return row[exact];
            // try unqualified column match (alias.column)
            if (!key.includes('.')) {
                const found = Object.keys(row).find(k => k.toLowerCase().endsWith('.' + lowerKey));
                return found ? row[found] : undefined;
            }
            // try case-insensitive qualified match
            const qual = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
            return qual ? row[qual] : undefined;
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
