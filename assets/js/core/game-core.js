// Game進行、状態管理、セーブ/ロードなどの本体
import { loadGameData, mergeDatabases, mergeAllDatabases, filterSelectedTables } from '../data/data-loader.js';
import { setupUIHandlers } from '../ui/ui-handlers.js';
import { GameState } from './game-state.js';
import { GameLifecycle } from './game-lifecycle.js';
import { SandboxUI } from './sandbox-ui.js';
import Register from '../register.js';

export class GameCore {
    constructor(dom, i18n) {
        this.dom = dom;
        this.i18n = i18n;
        this.player = null;
        this.currentFloor = 0;
        this.currentDungeon = null;
        this.gameData = null;
        this.isSandbox = false;
        this.sandboxSelectedTables = [];
        this._isDirty = false;
        
        this.state = new GameState(this);
        this.lifecycle = new GameLifecycle(this);
        this.sandboxUI = new SandboxUI(this);
        
        try { 
            if (typeof window !== 'undefined') window.game = this;
        } catch (e) {}
    }

    async initialize() {
        // レジストリの初期化（SQL句と集約関数）
        try {
            console.log('[GameCore] Initializing registries...');
            await Register.init('./assets/js/sql/clause/manifest.json', 'clause');
            await Register.init('./assets/js/sql/aggregate/manifest.json', 'aggregate');
            console.log('[GameCore] Registries initialized:', {
                clause: Object.keys(Register.getAll('clause')),
                aggregate: Object.keys(Register.getAll('aggregate'))
            });
        } catch (e) {
            console.error('Failed to initialize registries', e);
        }

        try {
            if (!this.gameData) this.gameData = await loadGameData();
        } catch (e) {
            console.warn('Failed to load game data in initialize', e);
        }

        // サンドボックスモード用：全データベースを統合
        try {
            if (this.gameData && this.gameData.mockDatabases) {
                this.gameData.mergedMockDatabase = mergeAllDatabases(this.gameData.mockDatabases);
                console.debug('[GameCore] Merged all databases for sandbox:', Object.keys(this.gameData.mergedMockDatabase).filter(k => !k.startsWith('__')));
            }
        } catch (e) {
            console.error('Failed to merge databases for sandbox', e);
        }

        try {
            const mockDb = this.gameData?.mergedMockDatabase || this.gameData?.mockDatabase || {};
            const tables = Object.keys(mockDb).filter(k => !k.startsWith('__'));
            if (!Array.isArray(this.sandboxSelectedTables) || this.sandboxSelectedTables.length === 0) {
                if (tables.includes('table001')) this.sandboxSelectedTables = ['table001'];
                else this.sandboxSelectedTables = tables.slice();
            }
        } catch (e) { /* non-fatal */ }

        try { this.sandboxUI.createControls(); } catch (e) {
            console.error('Failed to render sandbox controls', e);
        }

        try { setupUIHandlers(this); } catch (e) {
             console.error('Failed to bind UI handlers in initialize', e);
        }

        try { this.state.checkForSaveData(); } catch (e) {}
    }

    /**
     * 現在のフロア設定に基づいてモックデータベースを取得
     * フロアのdatabasesフィールドが指定されていればそれらを統合、なければデフォルトを使用
     * @returns {Object} 使用するモックデータベース
     */
    getCurrentMockDatabase() {
        try {
            // サンドボックスモードでは統合されたデータベースを使用
            if (this.isSandbox) {
                return this.gameData?.mergedMockDatabase || this.gameData?.mockDatabase || {};
            }

            // 通常モード：現在のフロアのdatabasesフィールドをチェック
            const floorData = this.gameData?.dungeonData?.floors?.[this.currentFloor];
            if (floorData && Array.isArray(floorData.databases) && floorData.databases.length > 0) {
                console.debug('[GameCore] Using floor databases:', floorData.databases);
                return mergeDatabases(this.gameData.mockDatabases, floorData.databases);
            }

            // フォールバック：デフォルトのmockDatabaseを使用
            return this.gameData?.mockDatabase || {};
        } catch (e) {
            console.error('Failed to get current mock database', e);
            return this.gameData?.mockDatabase || {};
        }
    }

    async startGame() {
        return this.lifecycle.startGame();
    }

    async startSandbox() {
        return this.lifecycle.startSandbox();
    }

    loadFloor(floorIndex) {
        return this.lifecycle.loadFloor(floorIndex);
    }

    updateUI() {
        return this.lifecycle.updateUI();
    }

    advanceToNextDungeon() {
        return this.lifecycle.advanceToNextDungeon();
    }

    showEndScreen(title, message) {
        return this.lifecycle.showEndScreen(title, message);
    }

    saveGame() {
        return this.state.saveGame();
    }

    loadGame() {
        return this.state.loadGame();
    }

    markDirty() {
        return this.state.markDirty();
    }

    markSaved() {
        return this.state.markSaved();
    }

    isDirty() {
        return this.state.isDirty();
    }

    checkForSaveData() {
        return this.state.checkForSaveData();
    }

    createSandboxControls() {
        return this.sandboxUI.createControls();
    }
}
