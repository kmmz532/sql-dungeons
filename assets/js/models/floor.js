// Floorモデル
/**
 * フロアモデル。i18n対応のタイトル・ストーリー・ヒント取得メソッドを持つ。
 */
export class Floor {
    constructor({ floor, title, story, schema, reward, hint, borrowed, opensShop, solutionPatterns, specialValidation }, i18n) {
        this.floor = floor;
        this.title = title;
        this.story = story;
        this.schema = schema;
        this.reward = reward;
        this.hint = hint;
        this.borrowed = borrowed || [];
        this.opensShop = opensShop || false;
        this.solutionPatterns = solutionPatterns || [];
        this.specialValidation = specialValidation || false;
        this.i18n = i18n;
    }

    /**
     * フロアタイトルを取得（i18n優先）。
     */
    getTitle(options = {}) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `dungeon.floor${this.floor}.title`;
            let title = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (title && !title.startsWith('dungeon.')) return title;
        }
        return this.title;
    }

    /**
     * フロアストーリーを取得（i18n優先）。
     */
    getStory(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `dungeon.floor${this.floor}.story`;
            let story = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (story && !story.startsWith('dungeon.')) return story;
        }
        return this.story;
    }

    /**
     * フロアヒントを取得（i18n優先）。
     */
    getHint(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `dungeon.floor${this.floor}.hint`;
            let hint = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (hint && !hint.startsWith('dungeon.')) return hint;
        }
        return this.hint;
    }

    /**
     * フロアのスキーマ（表定義）を取得（i18n優先）。
     */
    getSchema(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `dungeon.floor${this.floor}.schema`;
            let schema = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (schema && !schema.startsWith('dungeon.')) return schema;
        }
        return this.schema;
    }
}
