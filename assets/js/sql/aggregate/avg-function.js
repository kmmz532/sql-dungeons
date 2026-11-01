import { AggregateFunction } from './aggregate-function.js';
import { resolveAggregateValue } from '../util/column-resolver.js';

export class AvgFunction extends AggregateFunction {
    apply(rows) {
        if (!rows || rows.length === 0 || !this.column) return 0;
        let total = 0;
        let count = 0;
        for (const r of rows) {
            const val = resolveAggregateValue(r, this.column);
            if (val === null || val === undefined) continue;
            const n = parseFloat(val);
            if (!Number.isNaN(n)) {
                total += n;
                count++;
            }
        }
        return count === 0 ? 0 : total / count;
    }
    getResultKey() {
        return `AVG(${this.column})`;
    }
}
