import { DOMManager } from './ui/dom-manager.js';
import { GameCore } from './core/game-core.js';

// i18n-init.jsから呼ばれるエントリポイント
export async function startApp(i18n) {
    document.addEventListener('DOMContentLoaded', async () => {
        const dom = new DOMManager(i18n);
        const game = new GameCore(dom, i18n);
        try {
            await game.initialize();
        } catch (error) {
            console.error('Game initialization failed:', error);
            dom.showResult('ゲームデータの読み込みに失敗しました。', 'error');
        }
    });
}