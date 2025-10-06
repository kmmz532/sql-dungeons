import { AbstractClause } from './abstract-clause.js';

/**
 * UNION / UNION ALL handler - simple combinator for multiple result sets
 * apply(table, multipleSpec)
 * multipleSpec: { parts: [ { raw, rows: [...] } ], unionAll: boolean }
 * For compatibility we accept either the parsed.multiple shape or a simple array of tables.
 */
export class UnionClause extends AbstractClause {
    constructor(i18n) {
        super({ keyword: 'UNION', description: 'sql.keyword.union.desc' }, i18n);
    }

    static apply(table, spec) {
        // If spec is an array of tables, concat/dedupe according to default (UNION)
        if (Array.isArray(spec)) {
            const all = spec.flat();
            const seen = new Set();
            const unique = [];
            for (const r of all) {
                const k = JSON.stringify(r);
                if (!seen.has(k)) { seen.add(k); unique.push(r); }
            }
            return unique;
        }

        // If spec has multiple/raw/unionAll as produced by parseSQL
        if (spec && Array.isArray(spec.multiple)) {
            const resultsList = spec.multiple.map(p => p.rows || []);
            if (spec.unionAll) return resultsList.flat();
            const all = resultsList.flat();
            const seen = new Set();
            const unique = [];
            for (const r of all) {
                const k = JSON.stringify(r);
                if (!seen.has(k)) { seen.add(k); unique.push(r); }
            }
            return unique;
        }

        // fallback - return table unchanged
        return table;
    }
}

export default UnionClause;
