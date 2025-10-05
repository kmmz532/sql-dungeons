/**
 * SQL句の抽象クラス。i18n対応のキーワード・説明取得メソッドを持つ。
 */
export class AbstractClause {
    constructor({ keyword, description }, i18n) {
        this.keyword = keyword;
        this.description = description;
        this.i18n = i18n;
    }

    /**
     * SQLキーワードを取得（i18n優先）。
     */
    getKeyword(options = {}) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `sql.keyword.${this.keyword.toLowerCase()}`;
            let kw = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (kw && !kw.startsWith('sql.keyword.')) return kw;
        }
        return this.keyword;
    }

    /**
     * SQL句説明を取得（i18n優先）。
     */
    getDescription(options = {}) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            let desc = i18n.t(this.description);
            if (locale && locale !== prev) i18n.locale = prev;
            if (desc && !desc.startsWith('sql.keyword.')) return desc;
        }
        return this.description;
    }

    // 各句ごとの模擬実行はサブクラスで実装 (以下はサンプル)
    /*
    static apply(table, condition) {
        return table.filter(row => {
            return Object.keys(condition).every(key => row[key] === condition[key]);
        });
    }
    */
}

// 例
export class Spell extends AbstractClause {
    constructor({ keyword, description, manaCost }) {
        super({ keyword, description });
        this.manaCost = manaCost || 0;
    }
}
