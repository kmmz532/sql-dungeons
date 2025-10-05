import { SelectClause } from './select-clause.js';
import { WhereClause } from './where-clause.js';
import { GroupByClause } from './groupby-clause.js';
import { OrderByClause } from './orderby-clause.js';

export const SQL_KEYWORDS = [
    new SelectClause(),
    new WhereClause(),
    new GroupByClause(),
    new OrderByClause(),
];

export default { SQL_KEYWORDS };
