// ランク系の補助関数: ROW_NUMBER と RANK を計算する
export const computeRowNumber = (items, keyName, precomputed) => {
    let rn = 1;
    for (const it of items) {
        precomputed[it.idx][keyName] = rn++;
    }
};

// items: [{idx, row}, ...], orderBy: [{expr, dir}, ...]
export const computeRank = (items, orderBy, keyName, precomputed, resolve, resolveRowValue) => {
    let rank = 1;
    let i = 0;
    while (i < items.length) {
        let j = i + 1;
        while (j < items.length) {
            let equal = true;
            for (const ob of orderBy) {
                const va = (resolve(items[i].row, ob.expr) !== undefined) ? resolve(items[i].row, ob.expr) : (resolveRowValue ? resolveRowValue(items[i].row, ob.expr) : undefined);
                const vb = (resolve(items[j].row, ob.expr) !== undefined) ? resolve(items[j].row, ob.expr) : (resolveRowValue ? resolveRowValue(items[j].row, ob.expr) : undefined);
                if (va !== vb) { equal = false; break; }
            }
            if (!equal) break;
            j++;
        }
        for (let k = i; k < j; k++) {
            precomputed[items[k].idx][keyName] = rank;
        }
        rank += (j - i);
        i = j;
    }
};

export default { computeRowNumber, computeRank };
