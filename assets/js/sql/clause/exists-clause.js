import { AbstractClause } from './abstract-clause.js';

/**
 * EXISTS / NOT EXISTS clause support.
 * apply(table, specs) where specs is { expr: <original where string> }
 */
export class ExistsClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'EXISTS', description: 'sql.keyword.exists.desc' }, i18n);
    }

    /**
     * Evaluate EXISTS by running the provided subquery for each outer row.
     * For simplicity, the parsed spec will contain { outerCol, subQuery, not }
     */
    static apply(table, specs) {
        // This method will not be used via registry in current code path; exists handling
        // is implemented in SQLParser preprocess. Keep as no-op passthrough for compatibility.
        return table;
    }
}

export default ExistsClause;
