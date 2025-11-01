// ゲーム状態管理（セーブ/ロード、dirty フラグ等）
import { Player } from '../models/player.js';
import { SAVE_KEY } from '../constants.js';

export class GameState {
    constructor(gameCore) {
        this.core = gameCore;
    }

    markDirty() {
        this.core._isDirty = true;
    }

    markSaved() {
        this.core._isDirty = false;
    }

    isDirty() {
        return !!this.core._isDirty;
    }

    saveGame() {
        if (!this.core.player) return;
        const saveData = {
            ...this.core.player.toJSON(),
            currentFloor: this.core.currentFloor,
            currentDungeon: this.core.currentDungeon || null
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        this.core.dom.showFeedback(this.core.i18n.t('message.save_success'));
        this.markSaved();
    }

    async loadGame() {
        const savedDataString = localStorage.getItem(SAVE_KEY);
        if (!savedDataString) return;

        console.debug('[loadGame] Loading saved game');
        
        const loadedData = JSON.parse(savedDataString);
        this.core.player = Player.fromJSON(loadedData);
        this.core.isSandbox = false;
        
        // If any clearedFloors used legacy 'floor:N' format, ensure save is normalized by re-saving
        try {
            const orig = Array.isArray(loadedData.clearedFloors) ? loadedData.clearedFloors : [];
            const hasLegacy = orig.some(x => typeof x === 'string' && x.startsWith('floor:'));
            if (hasLegacy) {
                try { this.saveGame(); } catch(e) { /* ignore */ }
            }
        } catch(e) {}
        
        this.core.currentFloor = loadedData.currentFloor;
        
        try {
            if (loadedData.currentDungeon && this.core.gameData && this.core.gameData.dungeons && this.core.gameData.dungeons[loadedData.currentDungeon]) {
                this.core.gameData.dungeonData = this.core.gameData.dungeons[loadedData.currentDungeon];
                this.core.currentDungeon = loadedData.currentDungeon;
            }
        } catch (e) {}
        
        // Clean up sandbox mode artifacts before loading
        this.core.sandboxUI.cleanup();
        
        this.core.dom.showScreen('game');
        
        this.core.lifecycle.loadFloor(this.core.currentFloor);
        
        try { this.core.updateUI(); } catch(e) {}
        
        if (this.core.dom.elements['hint-btn']) {
            this.core.dom.elements['hint-btn'].classList.add('hidden');
        }
        
        this.core.dom.showFeedback(this.core.i18n.t('message.load_success'));
    }

    checkForSaveData() {
        if (localStorage.getItem(SAVE_KEY)) {
            this.core.dom.elements['load-button'].classList.remove('hidden');
        }
    }
}
