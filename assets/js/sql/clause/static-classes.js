// Static manifest of clause modules (used as an application-local fallback for dynamic loading)
// Keys match clause names and values are module paths relative to this file.
export const CLAUSE_MANIFEST = {
    SELECT: './select-clause.js',
    WHERE: './where-clause.js',
    'GROUP BY': './groupby-clause.js',
    'ORDER BY': './orderby-clause.js',
    INSERT: './insert-clause.js',
    HAVING: './having-clause.js'
};

export default { CLAUSE_MANIFEST };
