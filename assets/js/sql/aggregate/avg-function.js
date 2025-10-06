import { AggregateFunction } from './aggregate-function.js';

export class AvgFunction extends AggregateFunction {
    apply(rows) {
        if (!rows || rows.length === 0) return 0;
        const col = this.column;
        const keyPart = col ? (String(col).includes('.') ? String(col).split('.').pop() : String(col)) : undefined;
        let total = 0;
        let count = 0;

        const alnum = s => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        for (const r of rows) {
            if (!keyPart) continue;
            let foundKey = Object.keys(r).find(k => k.toLowerCase().endsWith('.' + keyPart.toLowerCase()) || k.toLowerCase() === keyPart.toLowerCase());
            let val = foundKey ? r[foundKey] : (r[col] !== undefined ? r[col] : undefined);
            if (val === undefined) {
                const target = alnum(keyPart);
                const fk = Object.keys(r).find(k => alnum(k) === target);
                if (fk) { foundKey = fk; val = r[fk]; }
            }

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
