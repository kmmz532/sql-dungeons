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

const i18n = new I18n(detectLocale());
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