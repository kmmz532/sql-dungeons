import { DOMManager } from './ui/dom-manager.js';
import { GameCore } from './core/game-core.js';
import { applyI18n } from './lang/i18n.js';

export async function startApp(i18n) {
    const run = async () => {
    const dom = new DOMManager(i18n);
    const game = new GameCore(dom, i18n);
    dom.game = game;
    dom.onLanguageChange = async (lang) => {
        try {
            let locale = 'ja_jp';
            if (typeof lang === 'string') {
                const l = lang.toLowerCase();
                if (l.indexOf('_') >= 0) locale = l;
                else {
                    const map = { ja: 'ja_jp', en: 'en_us', zh: 'zh_cn', ko: 'ko_kr' };
                    locale = map[l] || 'ja_jp';
                }
            }
            await i18n.setLocale(locale);
            applyI18n(i18n);
            const modal = document.getElementById('settings-modal');
            if (modal) dom.applyI18nToModal(modal);
        } catch (e) {
            console.error('Failed to change locale', e);
        }
    };
        try {
            await game.initialize();
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) dom.applyI18nToModal(settingsModal);
            try {
                const url = new URL(window.location.href);
                const modeParam = url.searchParams.get('mode');

                if (modeParam === null) {
                    try { dom.showScreen('start'); } catch (e) { console.warn('Failed to show start screen', e); }
                    try { history.replaceState({ mode: 'start' }, '', window.location.pathname); } catch (e) {}
                } else {
                    let mode = (modeParam === 'sandbox') ? 'sandbox' : 'normal';
                    if (mode === 'sandbox') {
                        game.startSandbox();
                    } else {
                        game.startGame();
                    }

                    try { history.replaceState({ mode }, '', `?mode=${mode}`); } catch (e) {}

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
                console.warn('Mode handling failed, showing start screen', e);
                try { dom.showScreen('start'); } catch (err) {}
            }
        } catch (error) {
            console.error('Game initialization failed:', error);
            dom.showResult(i18n.t('message.load_failed'), 'error');
        }
    };

    try {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('Service worker registered', reg.scope);
                try {
                    (async () => {
                        try {
                            const remote = await fetch('./version.json', { cache: 'no-store' });
                            if (remote && remote.ok) {
                                const remoteJson = await remote.json();

                                let localJson = null;
                                try {
                                    const resp = await fetch('./version.json');
                                    if (resp && resp.ok) localJson = await resp.json();
                                } catch (e) { localJson = null; }

                                const remoteAt = remoteJson && remoteJson.updateAt ? new Date(remoteJson.updateAt).getTime() : 0;
                                const localAt = localJson && localJson.updateAt ? new Date(localJson.updateAt).getTime() : 0;
                                if (remoteAt > localAt && navigator.onLine) {
                                    const proceed = confirm('アップデートが利用可能です。更新しますか？');
                                    if (proceed) {
                                        try {
                                            if ('caches' in window) {
                                                const keys = await caches.keys();
                                                await Promise.all(keys.map(k => caches.delete(k)));
                                            }

                                            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                                                const regs = await navigator.serviceWorker.getRegistrations();
                                                await Promise.all(regs.map(r => r.unregister()));
                                            }
                                            location.reload(true);
                                        } catch (e) { console.warn('Update flow failed', e); }
                                    }
                                }
                            }
                        } catch (e) { /* ignore */ }
                    })();
                } catch (e) {}
            }).catch(err => {
                console.warn('Service worker registration failed', err);
            });
        }
    } catch (e) {}

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => run());
    } else {
        await run();
    }
}