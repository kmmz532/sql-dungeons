// Item/ShopItemモデル
/**
 * アイテムの基底クラス。i18n対応の名称・説明取得メソッドを持つ。
 */
export class Item {
    constructor({ id, name, desc }, i18n) {
        this.id = id;
        this.name = name;
        this.desc = desc;
        this.i18n = i18n;
    }

    /**
     * アイテム名を取得（i18n優先）。
     * @param {Object} [options]
     * @param {I18n} [options.i18n] - I18nインスタンス（省略時はwindow.i18n）
     * @param {string} [options.locale] - 言語コード（省略時はi18nの現在ロケール）
     * @returns {string}
     */
    getName(options = {}, ...formatArgs) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            if (typeof this.name === 'string' && this.name.startsWith('item.sqldungeons.')) {
                const resolved = i18n.t(this.name, ...formatArgs);
                if (locale && locale !== prev) i18n.locale = prev;
                if (resolved && !resolved.startsWith('item.sqldungeons.')) return resolved;
            }

            const key = `item.sqldungeons.${this.id}`;
            let name = i18n.t(key, ...formatArgs);
            if (locale && locale !== prev) i18n.locale = prev;
            if (name && !name.startsWith('item.sqldungeons.')) return name;
        }
        return this.name;
    }

    /**
     * アイテム説明を取得（i18n優先）。
     * @param {Object} [options]
     * @param {I18n} [options.i18n] - I18nインスタンス（省略時はwindow.i18n）
     * @param {string} [options.locale] - 言語コード（省略時はi18nの現在ロケール）
     * @returns {string}
     */
    getDesc(options = {}, ...formatArgs) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            if (typeof this.desc === 'string' && this.desc.startsWith('item.sqldungeons.')) {
                const resolved = i18n.t(this.desc, ...formatArgs);
                if (locale && locale !== prev) i18n.locale = prev;
                if (resolved && !resolved.startsWith('item.sqldungeons.')) return resolved;
            }

            const key = `item.sqldungeons.${this.id}.desc`;
            let desc = i18n.t(key, ...formatArgs);
            if (locale && locale !== prev) i18n.locale = prev;
            if (desc && !desc.startsWith('item.sqldungeons.')) return desc;
        }
        return this.desc;
    }
}

/**
 * ショップアイテムクラス
 */
export class ShopItem extends Item {
    constructor({ id, name, desc, price, effectType, effectValue, effectItem }, i18n) {
        super({ id, name, desc }, i18n);
        this.price = price;
        this.effectType = effectType;
        this.effectValue = effectValue;
        this.effectItem = effectItem;
    }
}
