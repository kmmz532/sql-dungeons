// Helper module for clause exports. Actual static classes live in static-classes.js
import Static from './static-classes.js';

export function getFallbackClauseClasses() {
    return Static.CLAUSE_CLASSES || {};
}

export default { getFallbackClauseClasses };
