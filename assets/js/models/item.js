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
    getName(options = {}) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `item.sqldungeons.${this.id}`;
            let name = i18n.t(key);
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
    getDesc(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `item.sqldungeons.${this.id}.desc`;
            let desc = i18n.t(key);
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
    constructor({ id, name, desc, price, effectType, effectValue, effectItem }) {
        super({ id, name, desc });
        this.price = price;
        this.effectType = effectType;
        this.effectValue = effectValue;
        this.effectItem = effectItem;
    }
}
