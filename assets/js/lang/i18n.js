/**
 * DOMにi18nを適用する汎用関数
 * @param {i18n} i18n - I18nインスタンス
 */
export function applyI18n(i18n) {
	document.querySelectorAll('[data-i18n]').forEach(el => {
		const key = el.getAttribute('data-i18n');
		const value = i18n.t(key);
		if (value) el.textContent = value;
	});
	document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
		const key = el.getAttribute('data-i18n-placeholder');
		const value = i18n.t(key);
		if (value) el.setAttribute('placeholder', value);
	});
}

/**
 * 多言語クラス
 */
export class I18n {
	constructor(defaultLocale = 'ja_jp') {
		this.locale = defaultLocale;
		this.translations = new Map();
		this.fallbackLocale = 'en_us';
	}

    /**
     * 言語ファイルを読み込み、初期化する
     */
	async init() {
		try {
			// 言語ファイルを読み込む
			const response = await fetch(`/assets/lang/${this.locale}.json`);
			const translations = await response.json();
			this.translations.set(this.locale, translations);

			// フォールバックロケールも読み込む
			if (this.fallbackLocale !== this.locale) {
				const fallbackResponse = await fetch(`/assets/lang/${this.fallbackLocale}.json`);
				const fallbackTranslations = await fallbackResponse.json();
				this.translations.set(this.fallbackLocale, fallbackTranslations);
			}
		} catch (error) {
			console.error('Failed to load translations:', error);
		}
	}

    /**
     * 言語ロケールを設定し、初期化を行う
     * @param {string} locale - 言語コード
     * @returns {Promise}
     */
	setLocale(locale) {
		this.locale = locale;
		return this.init();
	}

    /**
     * テキスト文字を取得する
     * @param {string} key - 翻訳キー
     * @param  {...any} args - 置換引数
     * @returns {string} - テキスト文字
     */
	t(key, ...args) {
		// 現在のロケールで探す
		const currentTranslations = this.translations.get(this.locale) || {};
		let text = currentTranslations[key];

		// 見つからない場合はフォールバックロケールで探す
		if (!text && this.fallbackLocale !== this.locale) {
			const fallbackTranslations = this.translations.get(this.fallbackLocale) || {};
			if (fallbackTranslations.hasOwnProperty(key)) {
				console.warn(`Translation missing in ${this.locale}, using fallback ${this.fallbackLocale} for key: ${key}`);
				text = fallbackTranslations[key];
			} else {
				text = undefined;
			}
		}

		// 存在しない場合、キーをそのまま返す
		if (!text) {
			console.warn(`Translation missing for key: ${key}`);
			return key;
		}

        // %s, %d, %f による置換
		return this._format(text, ...args);
	}

	/**
	 * 文字列フォーマット (%s, %d, %fなど) を置換する
	 * @param {string} text
	 * @param  {...any} args
	 * @returns {string}
	 */
	_format(text, ...args) {
		// %s, %d, %f, %1$s, %2$d, %% など対応
		let argIndex = 0;
		return text.replace(/%(\d+\$)?([sdif%])/g, (match, index, type) => {
			if (type === '%') return '%'; // エスケープ

			let val;
			if (index) {
                // 1$とか2$とか指定されている場合
				const idx = parseInt(index, 10) - 1;
				val = args[idx];
			} else {
				val = args[argIndex++];
			}

			if (type === 'd' || type === 'i') return parseInt(val, 10);
			if (type === 'f') return parseFloat(val);
			return val;
		});
	}

    /**
     * テキスト文字を取得する
     * @param {string} key - 翻訳キー
     * @param  {...any} args - 置換引数
     * @returns {string} - テキスト文字
     */
    getText(key, ...args) {
        return this.t(key, ...args);
    }

    /**
     * 翻訳キーの存在を確認する
     * @param {string} key - 翻訳キー
     * @returns {boolean} - 存在する場合はtrue、しない場合はfalse
     */
	exists(key) {
		return this.translations.get(this.locale)?.hasOwnProperty(key) ||
			   this.translations.get(this.fallbackLocale)?.hasOwnProperty(key);
	}
}