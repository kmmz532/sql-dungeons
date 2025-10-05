// 集約関数の抽象クラス
export class AggregateFunction {
    constructor(column) {
        this.column = column;
    }
    apply(rows) {
        throw new Error('Not implemented');
    }
    getResultKey() {
        throw new Error('Not implemented');
    }
}
