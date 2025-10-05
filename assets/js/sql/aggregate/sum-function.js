import { AggregateFunction } from './aggregate-function.js';

export class SumFunction extends AggregateFunction {
    apply(rows) {
        return rows.reduce((sum, r) => sum + (parseFloat(r[this.column]) || 0), 0);
    }
    getResultKey() {
        return `SUM(${this.column})`;
    }
}
