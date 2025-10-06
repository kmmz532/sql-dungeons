import { AggregateFunction } from './aggregate-function.js';

export class MaxFunction extends AggregateFunction {
    apply(rows) {
        if (!rows || rows.length === 0) return null;
        const col = this.column;
        const keyPart = col ? (String(col).includes('.') ? String(col).split('.').pop() : String(col)) : undefined;
        let max = null;
        for (const r of rows) {
            if (!keyPart) continue;
            const foundKey = Object.keys(r).find(k => k.toLowerCase().endsWith('.' + keyPart.toLowerCase()) || k.toLowerCase() === keyPart.toLowerCase());
            const val = foundKey ? r[foundKey] : (r[col] !== undefined ? r[col] : undefined);
            const n = (val === null || val === undefined) ? null : parseFloat(val);
            if (n === null || Number.isNaN(n)) continue;
            if (max === null || n > max) max = n;
        }
        return max;
    }
    getResultKey() {
        return `MAX(${this.column})`;
    }
}
