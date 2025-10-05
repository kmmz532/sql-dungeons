import { DOMManager } from './ui/dom-manager.js';
import { GameCore } from './core/game-core.js';

// i18n-init.jsから呼ばれるエントリポイント
export async function startApp(i18n) {
    const run = async () => {
        const dom = new DOMManager(i18n);
        const game = new GameCore(dom, i18n);
        try {
            await game.initialize();
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