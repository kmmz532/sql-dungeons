import { AggregateFunction } from './aggregate-function.js';
import { resolveAggregateValue } from '../util/column-resolver.js';

export class MaxFunction extends AggregateFunction {
    apply(rows) {
        if (!rows || rows.length === 0 || !this.column) return null;
        let acc = null;
        for (const r of rows) {
            const val = resolveAggregateValue(r, this.column);
            const n = (val === null || val === undefined) ? null : parseFloat(val);
            if (n === null || Number.isNaN(n)) continue;
            if (acc === null || n > acc) acc = n;
        }
        return acc;
    }
    getResultKey() {
        return `MAX(${this.column})`;
    }
}
