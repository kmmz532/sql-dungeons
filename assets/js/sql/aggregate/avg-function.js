import { AggregateFunction } from './aggregate-function.js';

export class AvgFunction extends AggregateFunction {
    apply(rows) {
        if (!rows || rows.length === 0) return 0;
        const sum = rows.reduce((s, r) => s + (parseFloat(r[this.column]) || 0), 0);
        return sum / rows.length;
    }
    getResultKey() {
        return `AVG(${this.column})`;
    }
}
