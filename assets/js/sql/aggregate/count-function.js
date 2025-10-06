import { AggregateFunction } from './aggregate-function.js';

export class CountFunction extends AggregateFunction {
    constructor(column, distinct = false) {
        super(column);
        this.distinct = !!distinct;
    }

    apply(rows) {
        // COUNT(*) or COUNT(1)
        if (!this.column || this.column === '*' || String(this.column).trim() === '1') return rows.length;

        // COUNT(col) -> count non-null values
        const values = rows.map(r => {
            // allow qualified names - pick last segment
            const key = String(this.column);
            const last = key.includes('.') ? key.split('.').pop() : key;
            // find value case-insensitively
            const foundKey = Object.keys(r).find(k => k.toLowerCase().endsWith('.' + last.toLowerCase()) || k.toLowerCase() === last.toLowerCase());
            return foundKey ? r[foundKey] : undefined;
        }).filter(v => v !== null && v !== undefined);

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
