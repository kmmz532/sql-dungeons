// ゲームライフサイクル管理（startGame, startSandbox, loadFloor等）

import { Player } from '../models/player.js';
import { loadGameData, filterSelectedTables } from '../data/data-loader.js';
import { Floor } from '../models/floor.js';
import { renderSchemaHTML } from '../ui/render-util.js';
import { renderStageSelect } from '../ui/stage-select.js';
import { getCurrentFloorKey } from './floor-key.js';

export class GameLifecycle {
    constructor(gameCore) {
        this.core = gameCore;
    }

    // Enter normal game mode (non-sandbox)
    async startGame() {
        try {
            console.debug('[startGame] Entering normal game mode');
            
            // ensure game data is loaded
            if (!this.core.gameData) {
                try { 
                    this.core.gameData = await loadGameData(); 
                } catch (e) { 
                    console.warn('Failed to load game data in startGame', e); 
                }
            }

            // start a fresh player for a new game
            this.core.player = new Player();
            this.core.isSandbox = false;
            this.core.currentFloor = 0;
            
            // hide load button when starting new game
            try { 
                if (this.core.dom && this.core.dom.elements && this.core.dom.elements['load-button']) {
                    this.core.dom.elements['load-button'].classList.add('hidden'); 
                }
            } catch(e) {}
            
            // 新規開始は先頭のダンジョン（チュートリアル）から
            this.selectDungeon(this.getDungeonKeys()[0]);

            // Clean up sandbox artifacts
            this.core.sandboxUI.cleanup();
            
            this.core.dom.showScreen('game');
            
            this.loadFloor(this.core.currentFloor);
            
            // ensure UI elements reflect new player state
            try { this.updateUI(); } catch(e) {}
        } catch (e) {
            console.error('startGame failed', e);
        }
    }

    // Enter sandbox mode (no player, use mock databases)
    async startSandbox() {
        try {
            console.debug('[startSandbox] Entering sandbox mode');
            
            if (!this.core.gameData) {
                try { 
                    this.core.gameData = await loadGameData(); 
                } catch (e) { 
                    console.warn('Failed to load game data in startSandbox', e); 
                }
            }

            // sandbox has no player
            this.core.player = null;
            this.core.isSandbox = true;
            this.core.currentFloor = 0;

            // Clean up any existing sandbox artifacts
            this.core.sandboxUI.cleanup();
            
            try { document.body.classList.add('sandbox-mode'); } catch(e){}
            
            this.core.dom.showScreen('game');
            
            // set fixed title for sandbox
            try { 
                if (this.core.dom && this.core.dom.elements && this.core.dom.elements['floor-title']) {
                    this.core.dom.elements['floor-title'].textContent = (this.core.i18n && typeof this.core.i18n.t === 'function') 
                        ? this.core.i18n.t('button.sandbox') 
                        : 'Sandbox'; 
                }
            } catch(e){}
            
            // Recreate sandbox controls
            this.core.sandboxUI.createControls();
            
            // ensure schema and controls are present for sandbox
            try { this.loadFloor(0); } catch(e) {}
        } catch (e) {
            console.error('startSandbox failed', e);
        }
    }

    // ダンジョン（ステージ）キーの一覧（dungeons/manifest.json の順序）
    getDungeonKeys() {
        return Object.keys(this.core.gameData?.dungeons || {});
    }

    // 指定ダンジョンを現在のダンジョンに設定する
    selectDungeon(key) {
        if (!key || !this.core.gameData?.dungeons?.[key]) return false;
        this.core.currentDungeon = key;
        this.core.gameData.dungeonData = this.core.gameData.dungeons[key];
        return true;
    }

    // ステージ（ダンジョン）を先頭フロアから開始する。プレイヤーの進行データは引き継ぐ
    enterStage(key) {
        if (!this.selectDungeon(key)) return;
        if (!this.core.player) this.core.player = new Player();
        this.core.isSandbox = false;
        this.core.currentFloor = 0;
        try { this.core.dom.elements['load-button'].classList.add('hidden'); } catch (e) {}
        this.core.sandboxUI.cleanup();
        this.core.dom.showScreen('game');
        this.loadFloor(0);
        this.updateUI();
    }

    // ステージ選択画面を表示する（message があれば上部に表示）
    showStageSelect(message = '') {
        this.core.sandboxUI.cleanup();
        this.core.isSandbox = false;
        renderStageSelect(this.core, message);
        this.core.dom.showScreen('stage-select');
    }

    loadFloor(floorIndex) {
        try { 
            console.debug('[GameCore] loadFloor', { 
                floorIndex, 
                currentFloor: this.core.currentFloor, 
                dungeonFloorsLength: (this.core.gameData && this.core.gameData.dungeonData && this.core.gameData.dungeonData.floors) 
                    ? this.core.gameData.dungeonData.floors.length 
                    : null, 
                currentDungeon: this.core.currentDungeon 
            }); 
        } catch(e) {}
        
        let idx = Number(floorIndex);
        if (Number.isNaN(idx) || !isFinite(idx)) idx = 0;
        
        const floors = this.core.gameData && this.core.gameData.dungeonData && Array.isArray(this.core.gameData.dungeonData.floors) 
            ? this.core.gameData.dungeonData.floors 
            : [];
        
        if (idx < 0) idx = 0;
        if (idx >= floors.length) idx = Math.max(0, floors.length - 1);
        
        this.core.currentFloor = idx;
        const floorRaw = floors[idx];
        const floorData = new Floor(floorRaw);
        
        // Reset button states
        this.core.dom.elements['floor-actions-container'].classList.add('hidden');
        this.core.dom.elements['next-floor-btn'].classList.add('hidden');
        this.core.dom.elements['next-dungeon-btn'] && this.core.dom.elements['next-dungeon-btn'].classList.add('hidden');
        this.core.dom.elements['prev-floor-btn'] && this.core.dom.elements['prev-floor-btn'].classList.add('hidden');
        
        if (this.core.dom.elements['next-floor-btn']) this.core.dom.elements['next-floor-btn'].onclick = null;
        if (this.core.dom.elements['next-dungeon-btn']) this.core.dom.elements['next-dungeon-btn'].onclick = null;
        if (this.core.dom.elements['prev-floor-btn']) this.core.dom.elements['prev-floor-btn'].onclick = null;
        
        this.core.dom.elements['shop-btn'].classList.add('hidden');
        
        let canonicalFloorNumber = 0;
        try {
            if (floorData && (floorData.floor || floorData.id)) {
                canonicalFloorNumber = Number(floorData.floor || floorData.id);
            } else {
                canonicalFloorNumber = Number(this.core.currentFloor) + 1;
            }
        } catch (e) { 
            canonicalFloorNumber = Number(this.core.currentFloor) + 1; 
        }

        let leftLabel = null;
        try {
            if (this.core.currentDungeon && this.core.i18n && typeof this.core.i18n.t === 'function') {
                const tryLabel = this.core.i18n.t(`dungeon.${this.core.currentDungeon}.prefix`, canonicalFloorNumber);
                // if i18n returns the key itself or an empty value, treat as missing
                if (tryLabel && !String(tryLabel).startsWith('dungeon.')) {
                    leftLabel = tryLabel;
                }
            }
        } catch (e) { 
            leftLabel = null; 
        }
        
        if (!leftLabel) {
            leftLabel = this.core.i18n.t('message.floor_label', canonicalFloorNumber);
        }

        // If sandbox mode, show fixed title and show schema for selected tables
        if (this.core.isSandbox) {
            try { 
                if (this.core.dom && this.core.dom.elements && this.core.dom.elements['floor-title']) {
                    this.core.dom.elements['floor-title'].textContent = (this.core.i18n && typeof this.core.i18n.t === 'function') 
                        ? this.core.i18n.t('button.sandbox') 
                        : 'Sandbox'; 
                }
            } catch(e){}
            
            try { 
                if (this.core.dom && this.core.dom.elements && this.core.dom.elements['quest-story']) {
                    this.core.dom.elements['quest-story'].innerHTML = ''; 
                }
            } catch(e){}
            
            try {
                const allDb = this.core.getCurrentMockDatabase();
                const selected = Array.isArray(this.core.sandboxSelectedTables) && this.core.sandboxSelectedTables.length 
                    ? this.core.sandboxSelectedTables 
                    : Object.keys(allDb).filter(k => !k.startsWith('__'));
                
                // 選択されたテーブルの中で重複がない場合はハイフンを除去
                const currentDb = filterSelectedTables(allDb, selected);
                
                // フィルタリング後のテーブル名を取得（ハイフン除去済み）
                const filteredTableNames = Object.keys(currentDb).filter(k => !k.startsWith('__'));
                
                // Use Floor.getSchema() for consistent schema generation with normal mode
                const dummyFloor = new Floor({ 
                    floor: 0, 
                    tables: filteredTableNames,
                    title: 'Sandbox',
                    story: '',
                    schema: ''
                }, this.core.i18n);
                
                const schemaText = dummyFloor.getSchema({ 
                    i18n: this.core.i18n, 
                    mockDatabase: currentDb,
                    selectedTables: filteredTableNames
                });
                
                if (this.core.dom.elements['quest-schema']) {
                    this.core.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
                }
            } catch (e) { 
                console.error('Failed to render sandbox schema in loadFloor', e); 
            }
        } else {
            this.core.dom.elements['floor-title'].textContent = `${leftLabel} - ${floorData.getTitle({ i18n: this.core.i18n, currentDungeon: this.core.currentDungeon })}`;
            this.core.dom.elements['quest-story'].innerHTML = floorData.getStory({ i18n: this.core.i18n, currentDungeon: this.core.currentDungeon });

            if (this.core.dom.elements['quest-schema']) {
                const currentDb = this.core.getCurrentMockDatabase();
                const schemaText = (typeof floorData.getSchema === 'function') 
                    ? floorData.getSchema({ i18n: this.core.i18n, mockDatabase: currentDb }) 
                    : floorData.schema || '';
                this.core.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
            }
        }
        
        // Show/hide hint button depending on whether this floor has a hint
        try {
            const hintText = (typeof floorData.getHint === 'function') 
                ? floorData.getHint({ i18n: this.core.i18n, currentDungeon: this.core.currentDungeon }) 
                : floorData.hint;
            
            if (this.core.dom.elements['hint-btn']) {
                if (hintText && String(hintText).trim() !== '') {
                    this.core.dom.elements['hint-btn'].classList.remove('hidden');
                } else {
                    this.core.dom.elements['hint-btn'].classList.add('hidden');
                }
            }
        } catch (e) { 
            console.error('Error updating hint button visibility', e); 
        }
        
        this.core.dom.elements['sql-editor'].value = '';
        this.core.dom.elements['result-area'].innerHTML = '';
        this.core.dom.elements['result-area'].className = '';
        
        if (this.core.player) {
            this.core.player.borrowedItems.clear();
            (floorData.borrowed || []).forEach(item => this.core.player.borrowedItems.add(item));
        }
        
        // Show prev-floor button if applicable
        this._updatePrevFloorButton(floors);
        
        // Show next-floor button if floor was already cleared
        this._updateNextFloorButton(floors);

        if (!this.core.isSandbox) this.updateUI();
    }

    _updatePrevFloorButton(floors) {
        try {
            if (this.core.dom.elements['prev-floor-btn']) {
                const hasPrevFloor = (!this.core.isSandbox && Array.isArray(floors) && (this.core.currentFloor - 1) >= 0 && !!floors[this.core.currentFloor - 1]);
                
                if (hasPrevFloor) {
                    const el = this.core.dom.elements['prev-floor-btn'];
                    el.classList.remove('hidden');
                    try { el.style.display = ''; } catch(e) {}
                    el.onclick = () => {
                        this.core.currentFloor = Math.max(0, this.core.currentFloor - 1);
                        this.loadFloor(this.core.currentFloor);
                    };
                } else {
                    const el = this.core.dom.elements['prev-floor-btn'];
                    el.classList.add('hidden');
                    try { el.style.display = 'none'; } catch(e) {}
                    el.onclick = null;
                }
            }
        } catch (e) { 
            console.error('Error updating prev-floor button visibility', e); 
        }
    }

    _updateNextFloorButton(floors) {
        try {
            if (!this.core.isSandbox && this.core.dom.elements['next-floor-btn']) {
                const nextExists = Array.isArray(floors) && (this.core.currentFloor + 1) < floors.length && !!floors[this.core.currentFloor + 1];
                const isCleared = this.core.player && this.core.player.clearedFloors && this.core.player.clearedFloors.has(getCurrentFloorKey(this.core));
                
                if (nextExists && isCleared) {
                    const el = this.core.dom.elements['next-floor-btn'];
                    el.classList.remove('hidden');
                    try { el.style.display = ''; } catch(e) {}
                    try { 
                        this.core.dom.elements['floor-actions-container'] && this.core.dom.elements['floor-actions-container'].classList.remove('hidden'); 
                    } catch(e) {}
                    el.onclick = () => {
                        this.core.currentFloor = Math.min(floors.length - 1, this.core.currentFloor + 1);
                        this.loadFloor(this.core.currentFloor);
                    };
                } else {
                    this.core.dom.elements['next-floor-btn'].classList.add('hidden');
                    try { this.core.dom.elements['next-floor-btn'].style.display = 'none'; } catch(e) {}
                    this.core.dom.elements['next-floor-btn'].onclick = null;
                }
            }
        } catch (e) { 
            console.error('Error updating next-floor button visibility', e); 
        }
    }

    updateUI() {
        if (!this.core.player) return;
        
        this.core.dom.updateStats(this.core.player);
        this.core.dom.updateInventory(this.core.player);
        this.core.dom.elements['ku-next-btn'].classList.toggle('hidden', this.core.player.specialItems.kuNext <= 0);
        
        if (this.core.player.specialItems.kuNext > 0) {
            this.core.dom.elements['ku-next-btn'].textContent = `${this.core.i18n.t('button.ku_next')} (x${this.core.player.specialItems.kuNext})`;
        }
        
        this.core.dom.elements['hint-btn'].classList.toggle('purchased', this.core.player.purchasedHints.has(getCurrentFloorKey(this.core)));
    }

    showEndScreen(title, message) {
        this.core.dom.elements['end-title'].textContent = title;
        this.core.dom.elements['end-message'].textContent = message;
        this.core.dom.showScreen('end');
        
        // Clean up sandbox artifacts
        this.core.sandboxUI.cleanup();
    }
}
