import { AbstractClause } from './abstract-clause.js';

/**
 * 条件系句の抽象クラス (LIKE, ? 等)
 */
export class AbstractConditionClause extends AbstractClause {
    constructor({ keyword, description }, i18n) {
        super({ keyword, description }, i18n);
    }

    // 各サブクラスは static apply(table, conditionSpec) を実装する
}

export default AbstractConditionClause;
