import { AbstractClause } from './abstract-clause.js';

/**
 * INSERT句クラス
 * シンプルな単一行 VALUES をサポートする
 */
export class InsertClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'INSERT', description: 'sql.keyword.insert.desc' }, i18n);
    }

    /**
     * 非破壊で挿入行を返す (mockDatabase を変更しない)
     * @param {object} parsedInsert { table, columns: [], values: [] }
     * @param {object} mockDatabase
     * @returns {Array<Object>} - 挿入された行の配列
     */
    static apply(parsedInsert, mockDatabase) {
        const { table, columns = [], values = [] } = parsedInsert;
        const src = mockDatabase[table];
        if (!Array.isArray(src)) return [];
        const newRow = {};
        for (let i = 0; i < columns.length; i++) {
            const raw = values[i];
            const num = Number(raw);
            newRow[columns[i]] = (raw !== null && !Number.isNaN(num) && String(raw) === String(num)) ? num : (typeof raw === 'string' ? raw.replace(/^'|'$/g, '') : raw);
        }
        return [newRow];
    }
}
