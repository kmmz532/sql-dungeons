
// Game進行、状態管理、セーブ/ロードなどの本体

import { Player } from '../models/player.js';
import { loadGameData } from '../data/data-loader.js';
import { Floor } from '../models/floor.js';
import { SAVE_KEY } from '../constants.js';
import { setupUIHandlers } from '../ui/ui-handlers.js';
import { renderSchemaHTML } from '../ui/render-util.js';
import Register from '../register.js';

export class GameCore {
    constructor(dom, i18n) {
        this.dom = dom;
        this.i18n = i18n;
        this.player = null;
        this.currentFloor = 0;
        this.gameData = null;
        this._isDirty = false;
    }

    async initialize() {
        const clauseManifestUrl = new URL('../sql/clause/manifest.json', import.meta.url).href;
        const aggregateManifestUrl = new URL('../sql/aggregate/manifest.json', import.meta.url).href;
        try {
            await Register.init(aggregateManifestUrl, 'aggregate');
        } catch (e) {
            console.warn('Aggregate registry init failed', e);
        }
        const showBanner = (msg, isError) => {
            try {
                let b = document.getElementById('clause-banner');
                if (!b) {
                    b = document.createElement('div');
                    b.id = 'clause-banner';
                    b.style.position = 'fixed';
                    b.style.right = '12px';
                    b.style.top = '12px';
                    b.style.padding = '8px 12px';
                    b.style.borderRadius = '6px';
                    b.style.zIndex = 9999;
                    document.body.appendChild(b);
                }
                b.textContent = msg;
                b.style.background = isError ? 'rgba(220,80,80,0.95)' : 'rgba(50,160,80,0.95)';
                if (isError) {
                    let r = document.getElementById('clause-banner-retry');
                    if (!r) {
                        r = document.createElement('button');
                        r.id = 'clause-banner-retry';
                        r.textContent = 'Retry';
                        r.style.marginLeft = '8px';
                        r.onclick = async () => {
                            showBanner('Retrying manifest...', false);
                            try { await Register.init(clauseManifestUrl); showBanner('Loaded clause manifest', false); } catch (err) { showBanner('Failed to load clause manifest', true); }
                        };
                        b.appendChild(r);
                    }
                }
            } catch (e) { 
                console.error('Failed to show banner', e);
            }
        }

        try {
            await Register.init(clauseManifestUrl);
            showBanner('Loaded clause manifest', false);
            setTimeout(() => { try { const b = document.getElementById('clause-banner'); if (b) b.style.display = 'none'; } catch(e){} }, 2500);
        } catch (e) {
            console.warn('Clause registry init failed', e);
            showBanner('Failed to load clause manifest', true);
        }
        this.gameData = await loadGameData();
        setupUIHandlers(this);
        this.checkForSaveData();
    }

    startGame() {
        this.isSandbox = false;
        this.player = new Player();
        this.currentFloor = 0;
        this._isDirty = false;
        // remove sandbox controls if present
        try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){}
        try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){}
        try { document.body.classList.remove('sandbox-mode'); } catch(e){}
        // ensure player-only UI is visible again
        try { if (this.dom.elements['save-button']) this.dom.elements['save-button'].classList.remove('hidden'); } catch(e){}
        try { const ip = document.getElementById('inventory-panel'); if (ip) ip.classList.remove('hidden'); } catch(e){}
        try { if (this.dom.elements['hint-btn']) this.dom.elements['hint-btn'].classList.remove('hidden'); } catch(e){}
        try { const qp = document.querySelector('.quest-panel'); if (qp) qp.classList.remove('hidden'); } catch(e){}
        this.dom.showScreen('game');
        this.loadFloor(this.currentFloor);
    }

    /**
     * Enter sandbox mode: show the game UI but allow free queries without affecting player state.
     * Sandbox does not create a Player; it clears editor/result so user can experiment.
     */
    startSandbox() {
        // Ensure there's no player model to avoid spending energy/gold in sandbox
        this.player = null;
        this.isSandbox = true;
        this.dom.showScreen('game');
        try { 
            document.body.classList.add('sandbox-mode');
        } catch(e) {
            console.error('Failed to enter sandbox mode', e);
        }

        if (this.dom.elements['sql-editor']) this.dom.elements['sql-editor'].value = '';
        if (this.dom.elements['result-area']) {
            this.dom.elements['result-area'].innerHTML = '';
            this.dom.elements['result-area'].className = '';
        }
        if (this.dom.elements['floor-actions-container']) this.dom.elements['floor-actions-container'].classList.add('hidden');
        if (this.dom.elements['shop-btn']) this.dom.elements['shop-btn'].classList.add('hidden');
        if (this.dom.elements['next-floor-btn']) this.dom.elements['next-floor-btn'].classList.add('hidden');
        if (this.dom.elements['save-button']) this.dom.elements['save-button'].classList.add('hidden');
        try { const ip = document.getElementById('inventory-panel'); if (ip) ip.classList.add('hidden'); } catch(e) {}
        if (this.dom.elements['hint-btn']) this.dom.elements['hint-btn'].classList.add('hidden');
        try { const qp = document.querySelector('.quest-panel'); if (qp) qp.classList.add('hidden'); } catch(e) {}

        // Render a preview of the first floor's schema/story so users can experiment in sandbox
        this.currentFloor = 0;
        this._isDirty = false;
        const floorRaw = this.gameData?.dungeonData?.floors?.[this.currentFloor];
        if (floorRaw) {
            const floorData = new Floor(floorRaw, this.i18n);
            if (this.dom.elements['floor-title']) 
                this.dom.elements['floor-title'].textContent = `Sandbox - ${floorData.getTitle({ i18n: this.i18n })}`;
            if (this.dom.elements['quest-schema']) {
                // prepare initial schema display (will be overwritten by selector change handler)
                const schemaText = floorData.getSchema ? floorData.getSchema({ i18n: this.i18n }) : floorData.schema || '';
                this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
            }
        } else {
            if (this.dom.elements['floor-title']) this.dom.elements['floor-title'].textContent = 'Sandbox';
        }

        try {
            const headerEl = document.querySelector('.header');
            if (headerEl) {
                const existing = headerEl.querySelector('.sandbox-controls');
                if (existing) existing.remove();

                const controls = document.createElement('div');
                controls.className = 'sandbox-controls';
                const badge = document.createElement('span');
                badge.className = 'sandbox-badge';
                badge.textContent = 'SANDBOX';
                controls.appendChild(badge);

                const select = document.createElement('select');
                select.className = 'sandbox-select';
                (this.gameData?.dungeonData?.floors || []).forEach((f, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `Floor ${f.floor}`;
                    select.appendChild(opt);
                });
                select.value = this.currentFloor || 0;
                select.addEventListener('change', (ev) => {
                    const idx = parseInt(ev.target.value, 10);
                    this.currentFloor = idx;
                    const fr = this.gameData.dungeonData.floors[idx];
                    const fd = new Floor(fr, this.i18n);
                    if (this.dom.elements['floor-title']) this.dom.elements['floor-title'].textContent = `Sandbox - ${fd.getTitle({ i18n: this.i18n })}`;
                    // update quest-schema display to selected floor
                    if (this.dom.elements['quest-schema']) {
                        const schemaText = fd.getSchema ? fd.getSchema({ i18n: this.i18n }) : fd.schema || '';
                        this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
                    }
                });
                controls.appendChild(select);
                // place controls near the quest-schema area for clearer sandbox UX
                headerEl.appendChild(controls);
                // also move a clone of the selector above quest-schema for direct schema selection
                try {
                    const schemaContainer = this.dom.elements['quest-schema'];
                    if (schemaContainer) {
                        const localWrapper = document.createElement('div');
                        localWrapper.className = 'sandbox-schema-wrapper';
                        const label = document.createElement('label');
                        label.textContent = this.i18n.t('message.dataset_label') + ' ';
                        label.appendChild(select.cloneNode(true));
                        localWrapper.appendChild(label);
                        schemaContainer.parentNode.insertBefore(localWrapper, schemaContainer);
                        // wire change on this local select to trigger the header select change
                        const localSelect = localWrapper.querySelector('select');
                        localSelect.addEventListener('change', (ev) => {
                            const idx = parseInt(ev.target.value, 10);
                            // update both selects
                            select.value = idx;
                            select.dispatchEvent(new Event('change'));
                        });
                    }
                } catch (e) {
                    // ignore placement errors
                }
            }
        } catch (e) {
            // non-fatal
            console.error('Failed to render sandbox controls', e);
        }
    }

    loadFloor(floorIndex) {
        // Floorモデルでラップ
        const floorRaw = this.gameData.dungeonData.floors[floorIndex];
        const floorData = new Floor(floorRaw);
        this.dom.elements['floor-actions-container'].classList.add('hidden');
        this.dom.elements['next-floor-btn'].classList.add('hidden');
        this.dom.elements['shop-btn'].classList.add('hidden');
        this.dom.elements['floor-title'].textContent = this.i18n.t('message.floor_label', floorData.floor) + ` - ${floorData.getTitle({ i18n: this.i18n })}`;
        this.dom.elements['quest-story'].innerHTML = floorData.getStory({ i18n: this.i18n });

        if (this.dom.elements['quest-schema']) {
            const schemaText = (typeof floorData.getSchema === 'function') ? floorData.getSchema({ i18n: this.i18n }) : floorData.schema || '';
            this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
        }
        this.dom.elements['sql-editor'].value = '';
        this.dom.elements['result-area'].innerHTML = '';
        this.dom.elements['result-area'].className = '';
        if (this.player) {
            this.player.borrowedItems.clear();
            (floorData.borrowed || []).forEach(item => this.player.borrowedItems.add(item));
        }
        if (!this.isSandbox) this.updateUI();
    }

    updateUI() {
        // In sandbox mode there is no player; skip UI updates that depend on player state
        if (!this.player) return;
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
        this.dom.showFeedback(this.i18n.t('message.save_success'));
        this.markSaved();
    }

    // Mark that the game has unsaved changes
    markDirty() { this._isDirty = true; }

    // Mark that the game is saved
    markSaved() { this._isDirty = false; }

    // Accessor
    isDirty() { return !!this._isDirty; }

    loadGame() {
        const savedDataString = localStorage.getItem(SAVE_KEY);
        if (savedDataString) {
            const loadedData = JSON.parse(savedDataString);
            this.player = Player.fromJSON(loadedData);
            this.currentFloor = loadedData.currentFloor;
            this.dom.showScreen('game');
            this.loadFloor(this.currentFloor);
            this.dom.showFeedback(this.i18n.t('message.load_success'));
            try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){}
            try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){}
            try { document.body.classList.remove('sandbox-mode'); } catch(e){}
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
        try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){}
        try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){}
        try { document.body.classList.remove('sandbox-mode'); } catch(e){}
    }
}
