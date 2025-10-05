import { AbstractClause } from './abstract-clause.js';

/**
 * HAVING句クラス（グループ化後の条件フィルタ）
 * 今回は簡易的に "SUM(col) >= N" などの比較式をサポートする
 */
export class HavingClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'HAVING', description: 'sql.keyword.having.desc' }, i18n);
    }

    /**
     * グループ化後のテーブルに対して条件を評価して返す
     * @param {Array<Object>} table - groupAndAggregate の出力
     * @param {string} havingStr - HAVING 条件式文字列
     */
    static apply(table, havingStr) {
        if (!havingStr || !table || table.length === 0) return table;
        // サポートする形式: SUM(col) >= 10, COUNT(*) > 2, AVG(col) < 5 など
        const m = havingStr.match(/(SUM|COUNT|AVG)\s*\(\s*(\*|[A-Za-z_][A-Za-z0-9_]*)\s*\)\s*(=|>=|<=|>|<)\s*('?\d+'?)/i);
        if (!m) return table;
        const fn = m[1].toUpperCase();
        const col = m[2];
        const op = m[3];
        let rhs = m[4].replace(/'/g, '');
        rhs = Number(rhs);

        const resolveValue = (row) => {
            // グループ化結果のキー名は集約関数表現そのままで格納される想定
            const key = `${fn}(${col})`;
            return row[key] !== undefined ? Number(row[key]) : undefined;
        };

        return table.filter(r => {
            const v = resolveValue(r);
            if (v === undefined) return false;
            switch (op) {
                case '=': return v == rhs;
                case '>=': return v >= rhs;
                case '<=': return v <= rhs;
                case '>': return v > rhs;
                case '<': return v < rhs;
                default: return false;
            }
        });
    }
}

export { HavingClause as HAVING };
export default { HavingClause };
