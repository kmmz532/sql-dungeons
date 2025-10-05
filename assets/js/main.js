import { DOMManager } from './ui/dom-manager.js';
import { GameCore } from './core/game-core.js';
import { applyI18n } from './lang/i18n.js';

// i18n-init.jsから呼ばれるエントリポイント
export async function startApp(i18n) {
    const run = async () => {
    const dom = new DOMManager(i18n);
    const game = new GameCore(dom, i18n);
    // Expose game on dom so import can trigger immediate load
    dom.game = game;
    // Allow DOMManager to request language changes; map two-letter codes to full locale
    dom.onLanguageChange = async (lang) => {
        const map = { ja: 'ja_jp', en: 'en_us', zh: 'zh_cn', ko: 'ko_kr' };
        const locale = map[lang] || 'ja_jp';
        try {
            await i18n.setLocale(locale);
            applyI18n(i18n);
            // Update settings modal labels if open
            const modal = document.getElementById('settings-modal');
            if (modal) dom.applyI18nToModal(modal);
        } catch (e) {
            console.error('Failed to change locale', e);
        }
    };
        try {
            await game.initialize();
            // Apply translations to settings modal if present
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) dom.applyI18nToModal(settingsModal);
            // Decide initial mode from URL parameter ?mode=sandbox or ?mode=normal
            try {
                const url = new URL(window.location.href);
                const modeParam = url.searchParams.get('mode');
                // If no mode param is present, show the title/start screen and do not auto-start the game
                if (modeParam === null) {
                    // Show start/title screen
                    try { dom.showScreen('start'); } catch (e) { console.warn('Failed to show start screen', e); }
                    // Keep history entry without mode parameter
                    try { history.replaceState({ mode: 'start' }, '', window.location.pathname); } catch (e) {}
                } else {
                    let mode = (modeParam === 'sandbox') ? 'sandbox' : 'normal';
                    if (mode === 'sandbox') {
                        game.startSandbox();
                    } else {
                        game.startGame();
                    }
                    // Ensure history state reflects current mode for popstate navigation
                    try { history.replaceState({ mode }, '', `?mode=${mode}`); } catch (e) {}

                    // Listen for back/forward navigation and switch modes accordingly
                    window.addEventListener('popstate', (ev) => {
                        const s = ev.state && ev.state.mode ? ev.state.mode : (new URL(window.location.href).searchParams.get('mode') || 'normal');
                        if (s === 'sandbox') {
                            try { game.startSandbox(); } catch (e) { console.error('Failed to enter sandbox on popstate', e); }
                        } else if (s === 'start') {
                            try { dom.showScreen('start'); } catch (e) { console.warn('Failed to show start screen on popstate', e); }
                        } else {
                            try { game.startGame(); } catch (e) { console.error('Failed to enter normal mode on popstate', e); }
                        }
                    });
                }
            } catch (e) {
                // If URL parsing fails, show title screen as a safe default
                console.warn('Mode handling failed, showing start screen', e);
                try { dom.showScreen('start'); } catch (err) {}
            }
        } catch (error) {
            console.error('Game initialization failed:', error);
            dom.showResult(i18n.t('message.load_failed'), 'error');
        }
    };

    // If the document is still loading, wait for DOMContentLoaded; otherwise run immediately.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => run());
    } else {
        await run();
    }
}