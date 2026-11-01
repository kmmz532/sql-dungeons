import { AggregateFunction } from './aggregate-function.js';
import { resolveAggregateValue } from '../util/column-resolver.js';

export class CountFunction extends AggregateFunction {
    constructor(column, distinct = false) {
        super(column);
        this.distinct = !!distinct;
    }

    apply(rows) {
        // COUNT(*) or COUNT(1)
        if (!this.column || this.column === '*' || String(this.column).trim() === '1') return rows.length;

        // COUNT(col) -> NULL 以外の値を数える
        const values = rows.map(r => resolveAggregateValue(r, String(this.column)))
            .filter(v => v !== null && v !== undefined);

        if (this.distinct) {
            const set = new Set(values.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))));
            return set.size;
        }
        return values.length;
    }

    getResultKey() {
        if (this.distinct) return `COUNT(DISTINCT ${this.column})`;
        if (!this.column || this.column === '*' || String(this.column).trim() === '1') return 'COUNT(*)';
        return `COUNT(${this.column})`;
    }
}
