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

const initialLocale = localeFromSavedSettings() || detectLocale();
const i18n = new I18n(initialLocale);
window.i18n = i18n;
i18n.init().then(() => {
    applyI18n(i18n);
    // i18n初期化後にmain.jsのエントリポイントを呼ぶ
    import('../main.js').then(module => {
        if (module && typeof module.startApp === 'function') {
            module.startApp(i18n);
        }
    });
});