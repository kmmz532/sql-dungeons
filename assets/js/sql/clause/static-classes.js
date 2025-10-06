// manifest.jsonが読み込めない場合のフォールバック用
export const CLAUSE_MANIFEST = {
    SELECT: './select-clause.js',
    WHERE: './where-clause.js',
    'GROUP BY': './groupby-clause.js',
    'ORDER BY': './orderby-clause.js',
    INSERT: './insert-clause.js',
    HAVING: './having-clause.js'
};

export default { CLAUSE_MANIFEST };
