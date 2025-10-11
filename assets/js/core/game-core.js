// Game進行、状態管理、セーブ/ロードなどの本体
import { loadGameData } from '../data/data-loader.js';
import { setupUIHandlers } from '../ui/ui-handlers.js';
import { GameState } from './game-state.js';
import { GameLifecycle } from './game-lifecycle.js';
import { SandboxUI } from './sandbox-ui.js';

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
        try {
            if (!this.gameData) this.gameData = await loadGameData();
        } catch (e) {
            console.warn('Failed to load game data in initialize', e);
        }

        try {
            const mockDb = this.gameData?.mockDatabase || {};
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
