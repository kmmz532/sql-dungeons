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
        // 例: price >= 1000, name = 'foo', e.price >= d.avg
    // Allow RHS to be quoted strings (may contain hyphens) or unquoted token
    const m = whereStr.match(/(\w+(?:\.\w+)?)\s*(=|>=|<=|>|<)\s*('.*?'|[^\s]+)/);
        if (!m) return table;
        const [_, col, op, valRaw] = m;
        let val = valRaw.replace(/'/g, '');

        const resolve = (row, key) => {
            // 完全修飾名が直接存在すればそれを使う
            if (key in row) return row[key];
            // 修飾されていない場合は末尾マッチで探す (alias.col)
            if (!key.includes('.')) {
                const foundKey = Object.keys(row).find(k => k.endsWith('.' + key));
                return foundKey ? row[foundKey] : undefined;
            }
            return undefined;
        };

        return table.filter(row => {
            const lhs = resolve(row, col);
            // 右辺が修飾子つきの列名の場合 (e.price), その値を使う
            let rhs = val;
            if (/^\w+\.\w+$/.test(val)) {
                rhs = resolve(row, val);
            }

            switch (op) {
                case '=': return lhs == rhs;
                case '>=': return lhs >= rhs;
                case '<=': return lhs <= rhs;
                case '>': return lhs > rhs;
                case '<': return lhs < rhs;
                default: return true;
            }
        });
    }
}
