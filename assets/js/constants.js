// 定数
export const SAVE_KEY = 'sqlDungeonSaveData_v001';
export const HINT_COST = 50;
export const EXECUTE_COST = 1;
import { SelectClause } from './sql/clause/select-clause.js';
import { WhereClause } from './sql/clause/where-clause.js';
import { GroupByClause } from './sql/clause/groupby-clause.js';
import { OrderByClause } from './sql/clause/orderby-clause.js';

export const SQL_KEYWORDS = [
    new SelectClause(),
    new WhereClause(),
    new GroupByClause(),
    new OrderByClause(),
    // FROM, INNER, JOIN, ON, AS, SUM, COUNT, HAVING, IN などは必要に応じて個別クラス化・追加
    // ...他の句も同様に拡張可
];