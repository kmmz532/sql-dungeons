import { AggregateFunction } from './aggregate-function.js';
import { resolveAggregateValue } from '../util/column-resolver.js';

export class SumFunction extends AggregateFunction {
    apply(rows) {
        const col = this.column;
        if (!col) return 0;
        return rows.reduce((sum, r) => {
            const val = resolveAggregateValue(r, col);
            const n = (val === null || val === undefined) ? 0 : parseFloat(val) || 0;
            return sum + n;
        }, 0);
    }
    getResultKey() {
        return `SUM(${this.column})`;
    }
}
