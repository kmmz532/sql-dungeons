
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
        // Debug: report actual DOM state of prev button to help diagnose cases where it remains visible
        try {
            const el = this.dom.elements['prev-floor-btn'];
            if (el) {
                try { console.debug('[GameCore] prev-btn state', { exists: true, className: el.className, containsHidden: el.classList.contains('hidden'), inlineDisplay: el.style && el.style.display }); } catch(e) {}
            } else {
                try { console.debug('[GameCore] prev-btn state', { exists: false }); } catch(e) {}
            }
        } catch (e) {}
        this.currentFloor = 0;
        this.gameData = null;
        this._isDirty = false;
        // expose game instance globally for convenience (used by Floor.lookup fallback)
        try { if (typeof window !== 'undefined') window.game = this; } catch (e) {}
    }

    async initialize() {
        const clauseManifestUrl = new URL('../sql/clause/manifest.json', import.meta.url).href;
        const aggregateManifestUrl = new URL('../sql/aggregate/manifest.json', import.meta.url).href;
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
                            try { await Register.init(clauseManifestUrl, 'clause');
                                showBanner('Loaded clause manifest', false); } catch (err) { showBanner('Failed to load clause manifest', true); }
                        };
                        b.appendChild(r);
                    }
                }
            } catch (e) { 
                console.error('Failed to show banner', e);
            }
        }

        try {
            await Register.init(aggregateManifestUrl, 'aggregate');
            console.log('Loaded aggregate manifest');
            showBanner('Loaded aggregate manifest', false);
        } catch (e) {
            console.warn('Aggregate registry init failed', e);
            showBanner('Failed to load aggregate manifest', true);
        }

        try {
            await Register.init(clauseManifestUrl, 'clause');
            console.log('Loaded clause manifest');
            showBanner('Loaded clause manifest', false);
            setTimeout(() => { try { const b = document.getElementById('clause-banner'); if (b) b.style.display = 'none'; } catch(e){} }, 2500);
        } catch (e) {
            console.warn('Clause registry init failed', e);
            showBanner('Failed to load clause manifest', true);
        }
        
        this.gameData = await loadGameData();
        // default currentDungeon to 'tutorial' if available
        this.currentDungeon = (this.gameData && this.gameData.dungeons && this.gameData.dungeons.tutorial) ? 'tutorial' : Object.keys(this.gameData?.dungeons || {})[0] || null;
        setupUIHandlers(this);
        this.checkForSaveData();
    }

    startGame() {
        this.isSandbox = false;
        this.player = new Player();
    this.currentFloor = 0;
        this._isDirty = false;

        // サンドボックスモードのUIを削除
    try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){console.error(e);}
    try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){console.error(e);}
        try { document.body.classList.remove('sandbox-mode'); } catch(e){console.error(e);}
        // 通常モードのUIを表示
        try { if (this.dom.elements['save-button']) this.dom.elements['save-button'].classList.remove('hidden'); } catch(e){console.error(e);}
        try { const ip = document.getElementById('inventory-panel'); if (ip) ip.classList.remove('hidden'); } catch(e){console.error(e);}
        try { if (this.dom.elements['hint-btn']) this.dom.elements['hint-btn'].classList.remove('hidden'); } catch(e){console.error(e);}
        try { const qp = document.querySelector('.quest-panel'); if (qp) qp.classList.remove('hidden'); } catch(e){console.error(e);}
        this.dom.showScreen('game');
        setupUIHandlers(this);
        this.loadFloor(this.currentFloor);
    }

    startSandbox() {
        this.player = null;
        this.isSandbox = true;
        this.dom.showScreen('game');
        setupUIHandlers(this);
        try { 
            document.body.classList.add('sandbox-mode');
        } catch(e) {
            console.error('Failed to enter sandbox mode', e);
            console.error(e);
        }

        try { if (this.dom.elements['sql-editor']) this.dom.elements['sql-editor'].value = ''; } catch(e){console.error(e);}
        try {
            if (this.dom.elements['result-area']) {
                this.dom.elements['result-area'].innerHTML = '';
                this.dom.elements['result-area'].className = '';
            }
        } catch(e){console.error(e);}
        try { if (this.dom.elements['floor-actions-container']) this.dom.elements['floor-actions-container'].classList.add('hidden'); } catch(e){console.error(e);}
        if (this.dom.elements['shop-btn']) this.dom.elements['shop-btn'].classList.add('hidden');
        if (this.dom.elements['next-floor-btn']) this.dom.elements['next-floor-btn'].classList.add('hidden');
        if (this.dom.elements['save-button']) this.dom.elements['save-button'].classList.add('hidden');
        try { const ip = document.getElementById('inventory-panel'); if (ip) ip.classList.add('hidden'); } catch(e) {}
        if (this.dom.elements['hint-btn']) this.dom.elements['hint-btn'].classList.add('hidden');
        try { const qp = document.querySelector('.quest-panel'); if (qp) qp.classList.add('hidden'); } catch(e) {}

        this.currentFloor = 0;
        this._isDirty = false;
        const floorRaw = this.gameData?.dungeonData?.floors?.[this.currentFloor];
        if (floorRaw) {
            const floorData = new Floor(floorRaw, this.i18n);
            if (this.dom.elements['floor-title']) 
                this.dom.elements['floor-title'].textContent = `Sandbox - ${floorData.getTitle({ i18n: this.i18n })}`;
            if (this.dom.elements['quest-schema']) {
                // prepare initial schema display (will be overwritten by selector change handler)
                const schemaText = floorData.getSchema ? floorData.getSchema({ i18n: this.i18n, mockDatabase: this.gameData?.mockDatabase }) : floorData.schema || '';
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

                try { const existingWrapper = document.querySelector('.sandbox-schema-wrapper'); if (existingWrapper) existingWrapper.remove(); } catch(e){}

                const controls = document.createElement('div');
                controls.className = 'sandbox-controls';
                const badge = document.createElement('span');
                badge.className = 'sandbox-badge';
                badge.textContent = 'SANDBOX';
                controls.appendChild(badge);

                const select = document.createElement('select');
                select.className = 'sandbox-select';

                // (no datasetSelect) we'll offer table multi-select only

                const opts = [];
                if (this.gameData && this.gameData.dungeons) {
                    Object.keys(this.gameData.dungeons).forEach(dkey => {
                        const set = this.gameData.dungeons[dkey];
                        if (!set || !Array.isArray(set.floors)) return;
                        set.floors.forEach((f, idx) => {
                            const opt = document.createElement('option');

                            opt.value = `${dkey}:${idx}`;
                            try {
                                const fd = new Floor(f, this.i18n);
                                opt.textContent = fd.getTitle ? fd.getTitle({ i18n: this.i18n, currentDungeon: dkey }) : (`Floor ${f.floor}`);
                            } catch (e) { opt.textContent = `Floor ${f.floor}`; }
                            select.appendChild(opt);
                            opts.push({ dungeon: dkey, idx });
                        });
                    });
                }

                if (select.options.length > 0) select.value = select.options[0].value;
                // ensure mockDatabase is set from loader (fallback sets mockDatabaseKey/default earlier)
                try { if (!this.gameData.mockDatabase && this.gameData.mockDatabases && this.gameData.mockDatabaseKey) this.gameData.mockDatabase = this.gameData.mockDatabases[this.gameData.mockDatabaseKey]; } catch(e) {}
                // Table multi-select: allow choosing one or more tables from the active mockDatabase
                const tableMulti = document.createElement('div');
                tableMulti.className = 'sandbox-table-multi';
                try {
                    const activeDb = this.gameData?.mockDatabase || (this.gameData?.mockDatabases && this.gameData.mockDatabases[this.gameData.mockDatabaseKey]) || {};
                    const tableKeys = Object.keys(activeDb || {}).filter(k => !k.startsWith('__'));
                    const initiallySelected = [];
                    if (tableKeys.length > 0) {
                        tableKeys.forEach(tk => {
                            const cb = document.createElement('label');
                            cb.className = 'sandbox-table-item';
                            const input = document.createElement('input');
                            input.type = 'checkbox';
                            input.value = tk;
                            input.checked = true; // default: all selected
                            cb.appendChild(input);
                            const span = document.createElement('span');
                            span.textContent = tk;
                            cb.appendChild(span);
                            tableMulti.appendChild(cb);
                            initiallySelected.push(tk);
                        });
                    }
                    // set initial selection on game instance for UI handlers to consume
                    try { this.sandboxSelectedTables = initiallySelected; } catch(e) {}
                } catch (e) { console.error('Failed to initialize table multi-select', e); }
                controls.appendChild(tableMulti);
                select.addEventListener('change', (ev) => {
                    const raw = ev.target.value || '';
                    const parts = String(raw).split(':');
                    const dkey = parts[0] || Object.keys(this.gameData.dungeons || {})[0];
                    const idx = parseInt(parts[1] || '0', 10);
                    this.currentDungeon = dkey;
                    this.currentFloor = idx;
                    const fr = this.gameData.dungeons?.[dkey]?.floors?.[idx];
                    if (!fr) return;
                    const fd = new Floor(fr, this.i18n);
                    if (this.dom.elements['floor-title']) this.dom.elements['floor-title'].textContent = `Sandbox - ${fd.getTitle({ i18n: this.i18n, currentDungeon: dkey })}`;
                    if (this.dom.elements['quest-schema']) {
                        const schemaText = fd.getSchema ? fd.getSchema({ i18n: this.i18n, mockDatabase: this.gameData?.mockDatabase }) : fd.schema || '';
                        this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
                    }

                    try {
                        const hintText = (typeof fd.getHint === 'function') ? fd.getHint({ i18n: this.i18n }) : fd.hint;
                        if (this.dom.elements['hint-btn']) {
                            if (hintText && String(hintText).trim() !== '') {
                                this.dom.elements['hint-btn'].classList.remove('hidden');
                            } else {
                                this.dom.elements['hint-btn'].classList.add('hidden');
                            }
                        }
                    } catch (e) { console.error('Error updating hint button in sandbox selector', e); }
                });
                controls.appendChild(select);
                // when any table checkbox changes, update game.sandboxSelectedTables and re-render schema
                tableMulti.addEventListener('change', (ev) => {
                    try {
                        const checks = Array.from(tableMulti.querySelectorAll('input[type=checkbox]'));
                        const selected = checks.filter(c => c.checked).map(c => c.value);
                        // expose on game for UI handlers to use
                        try { this.sandboxSelectedTables = selected; } catch(e){}
                        // refresh schema for current floor (so schema view can reflect only selected tables if desired)
                        const fr = this.gameData.dungeons?.[this.currentDungeon]?.floors?.[this.currentFloor];
                        if (fr) {
                            const fd = new Floor(fr, this.i18n);
                            if (this.dom.elements['quest-schema']) {
                                const schemaText = fd.getSchema ? fd.getSchema({ i18n: this.i18n, mockDatabase: this.gameData?.mockDatabase, selectedTables: selected }) : fd.schema || '';
                                this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
                            }
                        }
                    } catch (e) { console.error('Failed to handle table multi change', e); }
                });
                headerEl.appendChild(controls);

                try {
                    const schemaContainer = this.dom.elements['quest-schema'];
                    if (schemaContainer) {
                        const localWrapper = document.createElement('div');
                        localWrapper.className = 'sandbox-schema-wrapper';
                        const label = document.createElement('label');
                        label.textContent = this.i18n.t('message.dataset_label') + ' ';
                        label.appendChild(select.cloneNode(true));
                        label.appendChild(document.createTextNode(' '));
                        // clone dataset select (if header has one)
                        try {
                            const clonedDataset = datasetSelect.cloneNode(true);
                            label.appendChild(clonedDataset);
                            // when local cloned dataset changes, update header datasetSelect and propagate
                            clonedDataset.addEventListener('change', (ev) => {
                                try {
                                    datasetSelect.value = ev.target.value;
                                    datasetSelect.dispatchEvent(new Event('change'));
                                } catch (e) { console.error('Failed to propagate local dataset change', e); }
                            });
                        } catch (e) {
                            // if datasetSelect is not defined in this scope, ignore
                        }
                        localWrapper.appendChild(label);
                        schemaContainer.parentNode.insertBefore(localWrapper, schemaContainer);
                        
                        const localSelect = localWrapper.querySelector('select');
                        localSelect.addEventListener('change', (ev) => {
                            select.value = ev.target.value;
                            select.dispatchEvent(new Event('change'));
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        } catch (e) {
            console.error('Failed to render sandbox controls', e);
            console.error(e);
        }
    }

    loadFloor(floorIndex) {
        try { console.debug('[GameCore] loadFloor', { floorIndex, currentFloor: this.currentFloor, dungeonFloorsLength: (this.gameData && this.gameData.dungeonData && this.gameData.dungeonData.floors) ? this.gameData.dungeonData.floors.length : null, currentDungeon: this.currentDungeon }); } catch(e) {}
           let idx = Number(floorIndex);
           if (Number.isNaN(idx) || !isFinite(idx)) idx = 0;
           const floors = this.gameData && this.gameData.dungeonData && Array.isArray(this.gameData.dungeonData.floors) ? this.gameData.dungeonData.floors : [];
           if (idx < 0) idx = 0;
           if (idx >= floors.length) idx = Math.max(0, floors.length - 1);
           this.currentFloor = idx;
           const floorRaw = floors[idx];
        const floorData = new Floor(floorRaw);
        this.dom.elements['floor-actions-container'].classList.add('hidden');
        this.dom.elements['next-floor-btn'].classList.add('hidden');
        this.dom.elements['next-dungeon-btn'] && this.dom.elements['next-dungeon-btn'].classList.add('hidden');
        this.dom.elements['prev-floor-btn'] && this.dom.elements['prev-floor-btn'].classList.add('hidden');
        if (this.dom.elements['next-floor-btn']) this.dom.elements['next-floor-btn'].onclick = null;
        if (this.dom.elements['next-dungeon-btn']) this.dom.elements['next-dungeon-btn'].onclick = null;
        if (this.dom.elements['prev-floor-btn']) this.dom.elements['prev-floor-btn'].onclick = null;
        this.dom.elements['shop-btn'].classList.add('hidden');
        let canonicalFloorNumber = 0;
        try {
            if (floorData && (floorData.floor || floorData.id)) canonicalFloorNumber = Number(floorData.floor || floorData.id);
            else canonicalFloorNumber = Number(this.currentFloor) + 1;
        } catch (e) { canonicalFloorNumber = Number(this.currentFloor) + 1; }

        let leftLabel = null;
        try {
            if (this.currentDungeon && this.i18n && typeof this.i18n.t === 'function') {
                const tryLabel = this.i18n.t(`dungeon.${this.currentDungeon}.prefix`, canonicalFloorNumber);
                // if i18n returns the key itself or an empty value, treat as missing
                if (tryLabel && !String(tryLabel).startsWith('dungeon.')) leftLabel = tryLabel;
            }
        } catch (e) { leftLabel = null; }
        if (!leftLabel) leftLabel = this.i18n.t('message.floor_label', canonicalFloorNumber);

        this.dom.elements['floor-title'].textContent = `${leftLabel} - ${floorData.getTitle({ i18n: this.i18n, currentDungeon: this.currentDungeon })}`;
        this.dom.elements['quest-story'].innerHTML = floorData.getStory({ i18n: this.i18n, currentDungeon: this.currentDungeon });

        if (this.dom.elements['quest-schema']) {
            const schemaText = (typeof floorData.getSchema === 'function') ? floorData.getSchema({ i18n: this.i18n, mockDatabase: this.gameData?.mockDatabase }) : floorData.schema || '';
            this.dom.elements['quest-schema'].innerHTML = renderSchemaHTML(schemaText);
        }
        // Show/hide hint button depending on whether this floor has a hint
        try {
            const hintText = (typeof floorData.getHint === 'function') ? floorData.getHint({ i18n: this.i18n, currentDungeon: this.currentDungeon }) : floorData.hint;
            if (this.dom.elements['hint-btn']) {
                if (hintText && String(hintText).trim() !== '') {
                    this.dom.elements['hint-btn'].classList.remove('hidden');
                } else {
                    this.dom.elements['hint-btn'].classList.add('hidden');
                }
            }
        } catch (e) { console.error('Error updating hint button visibility', e); }
        this.dom.elements['sql-editor'].value = '';
        this.dom.elements['result-area'].innerHTML = '';
        this.dom.elements['result-area'].className = '';
        if (this.player) {
            this.player.borrowedItems.clear();
            (floorData.borrowed || []).forEach(item => this.player.borrowedItems.add(item));
        }
        // Show prev-floor button if applicable — set explicitly to avoid stale visibility
        try {
            if (this.dom.elements['prev-floor-btn']) {
                // Show prev button only when there is a previous floor available in the current dungeonData and not in sandbox
                const hasPrevFloor = (!this.isSandbox && Array.isArray(floors) && (this.currentFloor - 1) >= 0 && !!floors[this.currentFloor - 1]);
                    if (hasPrevFloor) {
                        const el = this.dom.elements['prev-floor-btn'];
                        // remove hidden class and ensure inline display is visible
                        el.classList.remove('hidden');
                        try { el.style.display = ''; } catch(e) {}
                        el.onclick = () => {
                            this.currentFloor = Math.max(0, this.currentFloor - 1);
                            this.loadFloor(this.currentFloor);
                        };
                    } else {
                        const el = this.dom.elements['prev-floor-btn'];
                        // add hidden class and force inline display none to override possible CSS overrides
                        el.classList.add('hidden');
                        try { el.style.display = 'none'; } catch(e) {}
                        el.onclick = null;
                    }
            }
        } catch (e) { console.error('Error updating prev-floor button visibility', e); }

        // Additionally: if this floor was already cleared previously and there is a next floor,
        // show the "next floor" button so the player can advance without re-running the query.
        try {
            if (!this.isSandbox && this.dom.elements['next-floor-btn']) {
                const nextExists = Array.isArray(floors) && (this.currentFloor + 1) < floors.length && !!floors[this.currentFloor + 1];
                // canonical floor number and normalized key for lookup in clearedFloors
                const fd = floors[this.currentFloor] || {};
                const canonicalFloorNum = fd && (fd.floor || fd.id) ? Number(fd.floor || fd.id) : (Number(this.currentFloor) + 1);
                const floorKey = Number(canonicalFloorNum);
                const isCleared = this.player && this.player.clearedFloors && this.player.clearedFloors.has(floorKey);
                try { console.debug('[GameCore] loadFloor - floorKey check', { currentFloorIndex: this.currentFloor, canonicalFloorNum, floorKey, clearedFloors: Array.from(this.player.clearedFloors || []) }); } catch(e) {}
                if (nextExists && isCleared) {
                    const el = this.dom.elements['next-floor-btn'];
                    el.classList.remove('hidden');
                    try { el.style.display = ''; } catch(e) {}
                    // ensure the bottom action container (where the next button lives) is visible
                    try { this.dom.elements['floor-actions-container'] && this.dom.elements['floor-actions-container'].classList.remove('hidden'); } catch(e) {}
                    el.onclick = () => {
                        this.currentFloor = Math.min(floors.length - 1, this.currentFloor + 1);
                        this.loadFloor(this.currentFloor);
                    };
                } else {
                    // keep previously set behavior: hide next button until cleared in-session
                    this.dom.elements['next-floor-btn'].classList.add('hidden');
                    try { this.dom.elements['next-floor-btn'].style.display = 'none'; } catch(e) {}
                    this.dom.elements['next-floor-btn'].onclick = null;
                }
            }
        } catch (e) { console.error('Error updating next-floor button visibility', e); }

        if (!this.isSandbox) this.updateUI();
    }

    // Advance to the next dungeon set if available (e.g., tutorial -> beginner)
    advanceToNextDungeon() {
        try {
            if (!this.gameData || !this.gameData.dungeons) return false;
            // Find order: tutorial, beginner (future: intermediate, advanced)
            const order = ['tutorial', 'beginner'];
            // Determine current set by checking whether current floor exists in each set
            let currentSet = null;
            for (const key of order) {
                const set = this.gameData.dungeons[key];
                if (!set || !Array.isArray(set.floors)) continue;
                // if currentFloor matches some floor number in set
                if (set.floors.some(f => String(f.floor) === String(this.gameData.dungeonData.floors[this.currentFloor]?.floor))) {
                    currentSet = key;
                    break;
                }
            }
            const idx = currentSet ? order.indexOf(currentSet) : 0;
            const next = order[idx + 1];
            if (!next) return false;

            this.gameData.dungeonData = this.gameData.dungeons[next];
            this.currentDungeon = next;
            this.currentFloor = 0;

            // Reset per-dungeon cleared floors when entering a new dungeon
            try {
                // Mark the just-completed dungeon as cleared for the player so it appears in exports
                try {
                    const prevDungeon = currentSet || this.currentDungeon; // best-effort previous key
                    if (this.player && prevDungeon) {
                        if (!this.player.clearedDungeons) this.player.clearedDungeons = new Set();
                        this.player.clearedDungeons.add(prevDungeon);
                    }
                } catch (e) { console.warn('Failed to mark prev dungeon cleared', e); }

                if (this.player && this.player.clearedFloors) this.player.clearedFloors = new Set();
                // persist the reset state so export/load reflect per-dungeon progress (and clearedDungeons)
                try { this.saveGame(); } catch (e) { /* non-fatal */ }
            } catch (e) { console.warn('Failed to reset clearedFloors on dungeon advance', e); }

            this.loadFloor(this.currentFloor);
            return true;
        } catch (e) {
            console.error('Failed to advance to next dungeon', e);
            return false;
        }
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
            currentFloor: this.currentFloor,
            currentDungeon: this.currentDungeon || null
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
            // If any clearedFloors used legacy 'floor:N' format, ensure save is normalized by re-saving
            try {
                const orig = Array.isArray(loadedData.clearedFloors) ? loadedData.clearedFloors : [];
                const hasLegacy = orig.some(x => typeof x === 'string' && x.startsWith('floor:'));
                if (hasLegacy) {
                    try { this.saveGame(); } catch(e) { /* ignore */ }
                }
            } catch(e) {}
            this.currentFloor = loadedData.currentFloor;
            try {
                if (loadedData.currentDungeon && this.gameData && this.gameData.dungeons && this.gameData.dungeons[loadedData.currentDungeon]) {
                    this.gameData.dungeonData = this.gameData.dungeons[loadedData.currentDungeon];
                    this.currentDungeon = loadedData.currentDungeon;
                }
            } catch (e) {}
            this.dom.showScreen('game');
            setupUIHandlers(this); // 画面切り替え時に再バインド
            this.loadFloor(this.currentFloor);
        if (this.dom.elements['hint-btn']) this.dom.elements['hint-btn'].classList.add('hidden');
            this.dom.showFeedback(this.i18n.t('message.load_success'));
                try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){console.error(e);}
                try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){console.error(e);}
            try { document.body.classList.remove('sandbox-mode'); } catch(e){console.error(e);}
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
    try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){console.error(e);}
    try { const sw = document.querySelector('.sandbox-schema-wrapper'); if (sw) sw.remove(); } catch(e){console.error(e);}
    try { document.body.classList.remove('sandbox-mode'); } catch(e){console.error(e);}
    }
}
