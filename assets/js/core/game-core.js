
// Game進行・状態管理・セーブ/ロードなどの本体


import { Player } from '../models/player.js';
import { loadGameData } from '../data/data-loader.js';
import { Floor } from '../models/floor.js';
import { SAVE_KEY } from '../constants.js';
import { setupUIHandlers } from '../ui/ui-handlers.js';

export class GameCore {
    constructor(dom, i18n) {
        this.dom = dom;
        this.i18n = i18n;
        this.player = null;
        this.currentFloor = 0;
        this.gameData = null;
    }

    async initialize() {
        this.gameData = await loadGameData();
        setupUIHandlers(this);
        this.checkForSaveData();
    }

    startGame() {
        this.player = new Player();
        this.currentFloor = 0;
        this.dom.showScreen('game');
        this.loadFloor(this.currentFloor);
    }

    loadFloor(floorIndex) {
        // Floorモデルでラップ
        const floorRaw = this.gameData.dungeonData.floors[floorIndex];
        const floorData = new Floor(floorRaw);
        this.dom.elements['floor-actions-container'].classList.add('hidden');
        this.dom.elements['next-floor-btn'].classList.add('hidden');
        this.dom.elements['shop-btn'].classList.add('hidden');
        this.dom.elements['floor-title'].textContent = `フロア ${floorData.floor} - ${floorData.title}`;
        this.dom.elements['quest-story'].innerHTML = floorData.story;
        this.dom.elements['sql-editor'].value = '';
        this.dom.elements['result-area'].innerHTML = '';
        this.dom.elements['result-area'].className = '';
        this.player.borrowedItems.clear();
        (floorData.borrowed || []).forEach(item => this.player.borrowedItems.add(item));
        this.updateUI();
    }

    updateUI() {
        this.dom.updateStats(this.player);
        this.dom.updateInventory(this.player);
        this.dom.elements['ku-next-btn'].classList.toggle('hidden', this.player.specialItems.kuNext <= 0);
        if (this.player.specialItems.kuNext > 0) {
            this.dom.elements['ku-next-btn'].textContent = `句ネクスト (x${this.player.specialItems.kuNext})`;
        }
        this.dom.elements['hint-btn'].classList.toggle('purchased', this.player.purchasedHints.has(this.currentFloor));
    }

    saveGame() {
        if (!this.player) return;
        const saveData = {
            ...this.player.toJSON(),
            currentFloor: this.currentFloor
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        this.dom.showFeedback('セーブしました！');
    }

    loadGame() {
        const savedDataString = localStorage.getItem(SAVE_KEY);
        if (savedDataString) {
            const loadedData = JSON.parse(savedDataString);
            this.player = Player.fromJSON(loadedData);
            this.currentFloor = loadedData.currentFloor;
            this.dom.showScreen('game');
            this.loadFloor(this.currentFloor);
            this.dom.showFeedback('ロードしました！');
        }
    }

    checkForSaveData() {
        if (localStorage.getItem(SAVE_KEY)) {
            this.dom.elements['load-button'].classList.remove('hidden');
        }
    }

    showEndScreen(title, message) {
        this.dom.elements['end-title'].textContent = title;
        this.dom.elements['end-message'].textContent = message;
        this.dom.showScreen('end');
    }
}
