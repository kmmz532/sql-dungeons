
import { WhereClause } from './clause/where-clause.js';
import { GroupByClause } from './clause/groupby-clause.js';
import { SelectClause } from './clause/select-clause.js';
import { OrderByClause } from './clause/orderby-clause.js';
// SQLParser: クエリのバリデーションとエミュレーションを統合

/**
 * SQLParser: SQL文の簡易パースと模擬実行エンジン
 * 今後のSandbox拡張も見据えた設計
 */
/**
 * SQLParser: SQL文の簡易パースと模擬実行エンジン
 * 今後のSandbox拡張も見据えた設計
 */
export class SQLParser {
    /**
     * クエリが課題の条件を満たすか判定
     */
    validate(query, floorData) {
        if (floorData.specialValidation) {
            switch (floorData.floor) {
                case 3:
                    return this._validateJoinQuery(query);
                case 5:
                    return this._validateBossQuery(query);
                default:
                    return false;
            }
        }
        if (floorData.solutionPatterns) {
            return floorData.solutionPatterns.some(pattern => 
                new RegExp(pattern, 'i').test(query)
            );
        }
        return false;
    }

    /**
     * SQL文をパースし、模擬的に実行して結果を返す
     * @param {string} query - SQLクエリ
     * @param {number} currentFloor - 現在のフロア番号
     * @param {object} mockDatabase - モックDB
     * @returns {Array<object>} - 結果テーブル
     */
    emulate(query, currentFloor, mockDatabase) {
        try {
            // SQL文をパース
            const parsed = this.parseSQL(query);
            if (!parsed) return [];

            // FROM句からテーブル取得
            let table = mockDatabase[parsed.from];
            if (!Array.isArray(table)) return [];

            // WHERE句フィルタ
            if (parsed.where) {
                table = WhereClause.apply(table, parsed.where);
            }

            // GROUP BY句
            if (parsed.groupBy) {
                table = GroupByClause.apply(table, parsed);
            }

            // ORDER BY句
            if (parsed.orderBy) {
                table = OrderByClause.apply(table, parsed.orderBy);
            }

            // SELECT句
            return SelectClause.apply(table, parsed.select);
        } catch (e) {
            return [];
        }
    }

    /**
     * SQL文を簡易パース
     * @returns {object|null}
     */
    parseSQL(query) {
        // 超簡易パース: SELECT ... FROM ... [WHERE ...] [GROUP BY ...] [ORDER BY ...]
        const selectMatch = query.match(/select\s+(.+?)\s+from\s+/i);
        const fromMatch = query.match(/from\s+(\w+)/i);
        const whereMatch = query.match(/where\s+(.+?)(group by|having|order by|$)/i);
        const groupByMatch = query.match(/group by\s+([\w, ]+)/i);
        const orderByMatch = query.match(/order by\s+([\w\s,]+)(asc|desc)?/i);

        let orderBy = null;
        if (orderByMatch) {
            // 例: order by price desc, name asc
            orderBy = orderByMatch[1].split(',').map(s => {
                const m = s.trim().match(/(\w+)(\s+(asc|desc))?/i);
                return {
                    column: m[1],
                    direction: (m[3] || 'ASC').toUpperCase()
                };
            });
        }

        if (!selectMatch || !fromMatch) return null;
        return {
            select: selectMatch[1].split(',').map(s => s.trim()),
            from: fromMatch[1],
            where: whereMatch ? whereMatch[1].trim() : null,
            groupBy: groupByMatch ? groupByMatch[1].split(',').map(s => s.trim()) : null,
            orderBy
        };
    }

    // WHERE/GROUP BY/SELECT句のapplyは各Clauseクラスのstaticメソッドを利用

    // --- 既存の特殊バリデーションはそのまま ---
    _validateJoinQuery(query) {
        const n = query.toLowerCase().replace(/\s+/g, ' ');
        const f = /from\s+employees(?:\s+as)?\s*(\w+)?\s+inner\s+join\s+departments(?:\s+as)?\s*(\w+)?\s+on/;
        const m = n.match(f);
        if (!m) return false;
        const e = m[1] || 'employees';
        const d = m[2] || 'departments';
        const o = new RegExp(`on\s+(?:${e}\.dept_id\s*=\s*${d}\.dept_id|${d}\.dept_id\s*=\s*${e}\.dept_id)`);
        if (!o.test(n)) return false;
        const s = new RegExp(`select\s+(?:(?:${e}\.)?emp_name\s*,\s*(?:${d}\.)?dept_name|(?:${d}\.)?dept_name\s*,\s*(?:${e}\.)?emp_name)`);
        return s.test(n);
    }

    _validateBossQuery(query) {
        const n = query.toLowerCase().replace(/\s+/g, ' ');
        const hasJoin = n.includes('join');
        const hasWhere = n.includes('where') && n.includes('sale_date') && n.includes("'2025-02-01'");
        const hasGroupBy = n.includes('group by') && n.includes('dept_name');
        const hasHaving = n.includes('having') && n.includes('sum') && n.includes('quantity') && n.includes('10');
        return hasJoin && hasWhere && hasGroupBy && hasHaving;
    }
}
