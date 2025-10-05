// Helper module for clause exports. Actual static classes live in static-classes.js
import Static from './static-classes.js';

// Return the static manifest (fallback) which maps clause keywords to module paths
export function getFallbackClauseClasses() {
    // static-classes exports CLAUSE_MANIFEST
    return Static.CLAUSE_MANIFEST || {};
}

export default { getFallbackClauseClasses };
