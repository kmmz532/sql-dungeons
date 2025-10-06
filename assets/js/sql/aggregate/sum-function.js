import { AggregateFunction } from './aggregate-function.js';

export class SumFunction extends AggregateFunction {
    apply(rows) {
        const col = this.column;
        const keyPart = col ? (String(col).includes('.') ? String(col).split('.').pop() : String(col)) : undefined;
        return rows.reduce((sum, r) => {
            if (!keyPart) return sum;
            const foundKey = Object.keys(r).find(k => k.toLowerCase().endsWith('.' + keyPart.toLowerCase()) || k.toLowerCase() === keyPart.toLowerCase());
            const val = foundKey ? r[foundKey] : (r[col] !== undefined ? r[col] : undefined);
            const n = (val === null || val === undefined) ? 0 : parseFloat(val) || 0;
            return sum + n;
        }, 0);
    }
    getResultKey() {
        return `SUM(${this.column})`;
    }
}
