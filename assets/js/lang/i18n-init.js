import { I18n, applyI18n } from './i18n.js';

/**
 * ブラウザからi18nロケールを自動判定する
 * @returns {string} - 検出されたロケールコード
 */
function detectLocale() {
    const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (lang.startsWith('ja')) return 'ja_jp';
    if (lang.startsWith('en')) return 'en_us';
    if (lang.startsWith('ko')) return 'ko_kr';
    if (lang.startsWith('zh')) return 'zh_cn';
    return 'ja_jp';
}

/**
 * 保存された設定からロケールコードを取得する
 * @returns {string|null} - 保存された設定からロケールコードを取得する。存在しない場合はnullを返す。
 */
function localeFromSavedSettings() {
    try {
        const s = localStorage.getItem('sql_dungeons_settings');
        if (!s) return null;
        const parsed = JSON.parse(s);
        let lang = parsed && parsed.language;
        if (!lang) return null;
        if (typeof lang === 'string') {

            const l = lang.replace('-', '_').toLowerCase();
            if (l === 'ja' || l.startsWith('ja_') || l === 'ja_jp') return 'ja_jp';
            if (l === 'en' || l.startsWith('en_') || l === 'en_us') return 'en_us';
            if (l === 'zh' || l.startsWith('zh_') || l === 'zh_cn') return 'zh_cn';
            if (l === 'ko' || l.startsWith('ko_') || l === 'ko_kr') return 'ko_kr';
        }
        return null;
    } catch (e) {
        console.warn('Failed to read saved locale from settings', e);
        return null;
    }
}

async function initI18n() {
    // load manifest of available languages if present
    let manifest = null;
    try {
        const res = await fetch('./assets/lang/manifest.json');
        if (res && res.ok) manifest = await res.json();
    } catch (e) { manifest = null; }

    // determine initial locale: saved setting or browser detection, but prefer manifest if present
    const saved = localeFromSavedSettings();
    let initialLocale = saved || detectLocale();
    if (manifest) {
        // pick a manifest key that matches initialLocale style (ja_jp -> ja_jp vs ja)
        if (!manifest[initialLocale]) {
            const short = initialLocale.split('_')[0];
            const candidate = Object.keys(manifest).find(k => k.startsWith(short));
            if (candidate) initialLocale = candidate;
        }
    }

    const i18n = new I18n(initialLocale);
    window.i18n = i18n;
    if (manifest) i18n.setManifest(manifest);
    await i18n.init();
    applyI18n(i18n);

    // expose available locales to callers (DOMManager will read these)
    try { window.availableLocales = i18n.getAvailableLocales(); } catch (e) { window.availableLocales = null; }

    // i18n初期化後にmain.jsのエントリポイントを呼ぶ
    import('../main.js').then(module => {
        if (module && typeof module.startApp === 'function') module.startApp(i18n);
    });
}

initI18n();