import { AggregateFunction } from './aggregate-function.js';

export class CountFunction extends AggregateFunction {
    apply(rows) {
        return rows.length;
    }
    getResultKey() {
        return 'COUNT(*)';
    }
}
