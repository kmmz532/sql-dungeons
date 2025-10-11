/**
 * DOMManager: UI操作の責務を持つクラス
 * DOM要素の管理、画面切り替え、フィードバック表示、設定管理を統括
 */
import { SAVE_KEY } from '../constants.js';

export class DOMManager {
    /**
     * コンストラクタ
     * @param {Object} i18n - 国際化オブジェクト
     */
    constructor(i18n) {
        this.i18n = i18n;
        this.elements = {};
        this.initializeElements();
        
        // ユーザー設定のデフォルト（localStorageから読み込む）
        this.settings = {
            enableEsc: true,
            enableSaveShortcut: true,
            language: (document.documentElement.lang && document.documentElement.lang.slice(0,2)) || 'ja'
        };
        this.loadSettings();
        
        // 外部で言語変更を受け取るためのコールバックを保持
        this.onLanguageChange = null;

        // ツールチップ要素をイベントリスナのセットアップ前に生成
        try {
            this.tooltipEl = document.createElement('div');
            this.tooltipEl.id = 'tooltip';
            this.tooltipEl.className = 'tooltip';
            this.tooltipEl.style.display = 'none';
            document.body.appendChild(this.tooltipEl);
        } catch (e) { this.tooltipEl = null; }

        this.setupEventListeners();

        try { this.applyI18nToUI(); } catch(e) {}
    }

    initializeElements() {
        const ids = [
            'start-screen', 'game-screen', 'end-screen', 'game-grid',
            'start-button', 'load-button', 'sandbox-button', 'retry-button', 'save-button',
            'next-floor-btn', 'next-dungeon-btn', 'prev-floor-btn', 'floor-title', 'gold-status', 'energy-status',
            'inventory-list', 'quest-story', 'quest-schema', 'sql-editor',
            'execute-btn', 'hint-btn', 'ku-next-btn', 'result-area',
            'end-title', 'end-message', 'feedback-message', 'shop-modal',
            'back-to-title-button',
            'hint-modal', 'shop-item-list', 'floor-actions-container',
            'shop-btn', 'hint-modal-title', 'hint-modal-text',
            'hint-modal-actions',
            // 設定UI
            'settings-button', 'settings-modal', 'settings-language', 'export-json', 'import-json', 'import-json-file', 'settings-enable-esc', 'settings-enable-save-shortcut'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    }

    applyI18nToUI() {
        if (!this.i18n) return;
        const t = (k, ...args) => { try { return this.i18n.t(k, ...args); } catch(e) { return null; } };
        const map = {
            'back-to-title-button': 'ui.back_to_title',
            'save-button': 'ui.save',
            'execute-btn': 'ui.execute',
            'prev-floor-btn': 'ui.prev_floor',
        };

        const pickKey = (candidates) => {
            for (const k of candidates) {
                try {
                    const val = this.i18n.t(k);
                    if (val && val !== k) return k;
                } catch(e) {}
            }
            return candidates[0];
        };
        try {
            const goldKey = pickKey(['ui.gold','ui.gold_status','status.gold']);
            const energyKey = pickKey(['ui.energy','ui.energy_status','status.energy']);
            map['gold-status'] = goldKey;
            map['energy-status'] = energyKey;
        } catch(e) { /* ignore */ }
        Object.keys(map).forEach(id => {
            try {
                const el = this.elements[id] || document.getElementById(id);
                if (!el) return;
                const key = map[id];
                const txt = t(key);
                if (txt && txt !== key) {
                    el.setAttribute('data-i18n-title', key);
                }
            } catch (e) {}
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(document.getElementById(btn.dataset.modalId));
            });
        });
        document.addEventListener('keydown', (ev) => {
            // 入力中はショートカットを無視（例: テキストエリアや入力フィールド）
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

            // ESCでダイアログを閉じる（設定で無効化可能）
            if (ev.key === 'Escape') {
                if (!this.settings.enableEsc) return;
                ev.preventDefault();
                const openModal = document.querySelector('.modal-overlay:not(.hidden)');
                if (openModal) this.closeModal(openModal);
                return;
            }

            // Ctrl+S でセーブ（設定で無効化可能）
            const isSave = (ev.key === 's' || ev.key === 'S') && (ev.ctrlKey || ev.metaKey);
            if (isSave) {
                if (!this.settings.enableSaveShortcut) return;
                // 入力中のテキスト編集での保存はユーザーに任せる（例: エディタ内でCtrl+Sを使いたい場合）
                if (isInput) return;
                ev.preventDefault();
                const saveBtn = this.elements['save-button'] || document.getElementById('save-button');
                if (saveBtn) saveBtn.click();
            }
        });

        // 設定関連のUI要素が存在すれば初期化
        const settingsBtn = document.getElementById('settings-button');
        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('hidden');

            this.applyI18nToModal(modal);
        });

        const exportBtn = document.getElementById('export-json');
        const importBtn = document.getElementById('import-json');
        const importFile = document.getElementById('import-json-file');
        const langSelect = document.getElementById('settings-language');
        const escCheckbox = document.getElementById('settings-enable-esc');
        const saveShortcutCheckbox = document.getElementById('settings-enable-save-shortcut');

        if (exportBtn) exportBtn.addEventListener('click', () => this.exportJSON());
        if (importBtn && importFile) importBtn.addEventListener('click', () => importFile.click());
        if (importFile) importFile.addEventListener('change', (ev) => this.importJSON(ev));
        if (langSelect) {
            try {
                const avail = window.availableLocales || null;
                if (Array.isArray(avail) && avail.length) {
                    langSelect.innerHTML = '';
                    avail.forEach(l => {
                        const opt = document.createElement('option');
                        opt.value = l.code;
                        opt.textContent = l.name || l.code;
                        langSelect.appendChild(opt);
                    });
                }
            } catch (e) { 
                console.warn('Failed to populate language options', e);
            }

            const preferred = (this.i18n && this.i18n.locale) ? this.i18n.locale : ((this.settings && this.settings.language) ? this.settings.language : 'ja_jp');
            if ([...langSelect.options].some(o => o.value === preferred)) {
                langSelect.value = preferred;
            } else {
                const short = String(preferred).split('_')[0];
                const match = [...langSelect.options].find(o => String(o.value).startsWith(short));
                if (match) langSelect.value = match.value;
                else langSelect.value = langSelect.options.length ? langSelect.options[0].value : preferred;
            }

            if (!this.pendingSettings) this.pendingSettings = Object.assign({}, this.settings);
            langSelect.addEventListener('change', (ev) => {
                if (!this.pendingSettings) this.pendingSettings = {};
                this.pendingSettings.language = ev.target.value;
            });
        }
        if (escCheckbox) {
            escCheckbox.checked = !!this.settings.enableEsc;
            escCheckbox.addEventListener('change', (ev) => {
                if (!this.pendingSettings) this.pendingSettings = Object.assign({}, this.settings);
                this.pendingSettings.enableEsc = ev.target.checked;
            });
        }
        if (saveShortcutCheckbox) {
            saveShortcutCheckbox.checked = !!this.settings.enableSaveShortcut;
            saveShortcutCheckbox.addEventListener('change', (ev) => {
                if (!this.pendingSettings) this.pendingSettings = Object.assign({}, this.settings);
                this.pendingSettings.enableSaveShortcut = ev.target.checked;
            });
        }

        // Save / Cancelボタン
        const settingsSaveBtn = document.getElementById('settings-save');
        const settingsCancelBtn = document.getElementById('settings-cancel');
        if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', async () => {
            if (this.pendingSettings) {
                this.settings = Object.assign({}, this.settings, this.pendingSettings);
                this.saveSettings();
                if (typeof this.onLanguageChange === 'function') {
                    try { await this.onLanguageChange(this.settings.language); } catch (e) { console.warn('Language change failed', e); }
                }

                const modal = document.getElementById('settings-modal');
                if (modal) this.closeModal(modal);
            }
        });
        if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', () => {
            this.pendingSettings = Object.assign({}, this.settings);
            const modal = document.getElementById('settings-modal');
            if (modal) this.applyI18nToModal(modal);

            const langSel = document.getElementById('settings-language'); if (langSel) langSel.value = this.settings.language || 'ja';
            const escChk = document.getElementById('settings-enable-esc'); if (escChk) escChk.checked = !!this.settings.enableEsc;
            const saveChk = document.getElementById('settings-enable-save-shortcut'); if (saveChk) saveChk.checked = !!this.settings.enableSaveShortcut;
            if (modal) this.closeModal(modal);
        });

        // PWA: clear cache button (only shown when service worker is registered)
        try {
            const clearCacheBtn = document.getElementById('settings-clear-cache');
            if (clearCacheBtn) {
                // hide by default; visibility will be toggled if a service worker is active
                clearCacheBtn.classList.add('hidden');
                clearCacheBtn.addEventListener('click', async () => {
                    try {
                        // clear CacheStorage entries
                        if ('caches' in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map(k => caches.delete(k)));
                        }
                        // unregister service workers
                        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                            const regs = await navigator.serviceWorker.getRegistrations();
                            await Promise.all(regs.map(r => r.unregister()));
                        }
                        this.showFeedback('PWAキャッシュを消去しました');
                    } catch (e) {
                        console.warn('Failed to clear PWA caches', e);
                        this.showFeedback('PWAキャッシュの消去に失敗しました');
                    }
                });

                // If a service worker is registered, show the button
                try {
                    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                        navigator.serviceWorker.getRegistrations().then(regs => {
                            if (Array.isArray(regs) && regs.length > 0) {
                                clearCacheBtn.classList.remove('hidden');
                            }
                        }).catch(() => {});
                    }
                } catch (e) {}
            }
        } catch (e) {}

        try {
            const exclude = new Set(['start-button','load-button','sandbox-button']);
            const candidates = ['back-to-title-button','retry-button','save-button','execute-btn','hint-btn','ku-next-btn','shop-btn','next-floor-btn','next-dungeon-btn','settings-button','prev-floor-btn','gold-status','energy-status'];
            const getTextForEl = (el) => {
                if (!el) return '';
                const key = el.getAttribute('data-i18n-title');
                if (key && this.i18n) {
                    try { const t = this.i18n.t(key); if (t && t !== key) return t; } catch(e) {}
                }

                if (el.getAttribute('title')) return el.getAttribute('title');
                if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
                return (el.textContent || '').trim();
            };

            const attachTooltip = (el) => {
                if (!el || exclude.has(el.id)) return;
                if (!this.tooltipEl) return;
                let touchTimer = null;
                let touchStartX = 0;
                let touchStartY = 0;
                const LONGPRESS_MS = 400;

                const show = (x, y) => {
                    try {
                        const txt = getTextForEl(el);
                        if (!txt) return;
                        this.tooltipEl.textContent = txt;
                        this.tooltipEl.style.display = 'block';
                        this.tooltipEl.style.left = (x + 12) + 'px';
                        this.tooltipEl.style.top = (y + 12) + 'px';
                    } catch (e) {}
                };
                const hide = () => { try { if (this.tooltipEl) this.tooltipEl.style.display = 'none'; } catch(e) {} };

                el.addEventListener('mouseenter', (ev) => { try { show(ev.pageX, ev.pageY); } catch(e) {} });
                el.addEventListener('mousemove', (ev) => { try { if (this.tooltipEl && this.tooltipEl.style.display === 'block') { this.tooltipEl.style.left = (ev.pageX + 12) + 'px'; this.tooltipEl.style.top = (ev.pageY + 12) + 'px'; } } catch(e) {} });
                el.addEventListener('mouseleave', () => { hide(); });

                el.addEventListener('touchstart', (ev) => {
                    if (!ev.touches || ev.touches.length === 0) return;
                    const t = ev.touches[0];
                    touchStartX = t.pageX; touchStartY = t.pageY;
                    touchTimer = setTimeout(() => { show(touchStartX, touchStartY); }, LONGPRESS_MS);
                }, { passive: true });
                el.addEventListener('touchmove', (ev) => {
                    if (!ev.touches || ev.touches.length === 0) return;
                    const t = ev.touches[0];
                    const dx = Math.abs(t.pageX - touchStartX); const dy = Math.abs(t.pageY - touchStartY);
                    if (dx > 10 || dy > 10) { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } hide(); }
                }, { passive: true });
                el.addEventListener('touchend', () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } hide(); });
                el.addEventListener('touchcancel', () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } hide(); });
            };

            candidates.forEach(id => {
                try { const el = this.elements[id] || document.getElementById(id); if (el) attachTooltip(el); } catch(e) {}
            });

            try {
                const schemaRoot = document.getElementById('quest-schema');
                if (schemaRoot && this.tooltipEl) {
                    schemaRoot.addEventListener('mouseenter', (ev) => {
                        const t = ev.target;
                        if (t && t.classList && t.classList.contains('schema-term')) {
                            const term = t.getAttribute('data-term') || t.textContent || '';
                            const termType = t.getAttribute('data-term-type');
                            const line = t.closest('.schema-line');
                            const lineType = line ? line.getAttribute('data-line-type') : null;
                            try {
                                let key = null;
                                if (termType === 'column') key = 'ui.schema_column';
                                else if (termType === 'table') key = 'ui.schema_table';
                                else {
                                    if (lineType === 'table' || /table/i.test(lineType)) key = 'ui.schema_table';
                                    else key = 'ui.schema_column';
                                }

                                let txt = (this.i18n && typeof this.i18n.t === 'function') ? this.i18n.t(key, term) : null;
                                if (!txt || txt === key) {
                                    txt = term;
                                }

                                this.tooltipEl.textContent = txt;
                                this.tooltipEl.style.display = 'block';
                                const r = t.getBoundingClientRect();
                                this.tooltipEl.style.left = (window.scrollX + r.right + 8) + 'px';
                                this.tooltipEl.style.top = (window.scrollY + r.top) + 'px';
                            } catch (e) {
                                try { this.tooltipEl.textContent = term; this.tooltipEl.style.display = 'block'; } catch(_){ }
                            }
                        }
                    }, true);
                    schemaRoot.addEventListener('mouseleave', (ev) => {
                        const t = ev.target;
                        if (t && t.classList && t.classList.contains('schema-term')) {
                            try { this.tooltipEl.style.display = 'none'; } catch(e) {}
                        }
                    }, true);
                }
            } catch(e) {}

        } catch (e) {}
    }

    applyI18nToModal(modalEl) {
        if (!modalEl || !this.i18n) return;
        modalEl.querySelectorAll('[data-i18n]').forEach(el => {
            try {
                const key = el.getAttribute('data-i18n');
                const txt = this.i18n.t(key);
                if (txt && txt !== key) el.textContent = txt;
            } catch (e) { /* ignore */ }
        });
        modalEl.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            try {
                const key = el.getAttribute('data-i18n-placeholder');
                const txt = this.i18n.t(key);
                if (txt && txt !== key) el.setAttribute('placeholder', txt);
            } catch (e) { /* ignore */ }
        });

        try { this.applyI18nToUI(); } catch(e) {}
    }

    showScreen(screenName) {
        ['start-screen', 'game-screen', 'end-screen'].forEach(id => {
            this.elements[id].classList.add('hidden');
        });
        this.elements[`${screenName}-screen`].classList.remove('hidden');
    }

    openModal(modalId) {
        const el = this.elements[modalId] || document.getElementById(modalId);
        if (!el) return;
        el.classList.remove('hidden');
    }

    closeModal(modal) {
        if (!modal) return;
        if (typeof modal === 'string') {
            const el = this.elements[modal] || document.getElementById(modal);
            if (el) el.classList.add('hidden');
            return;
        }
        modal.classList.add('hidden');
    }

    showFeedback(message) {
        if (!this.elements['feedback-message']) return;
        this.elements['feedback-message'].textContent = message;
        this.elements['feedback-message'].classList.add('show');
        setTimeout(() => {
            this.elements['feedback-message'].classList.remove('show');
        }, 2000);
    }

    // 設定の永続化 / 読み込み
    saveSettings() {
        try { localStorage.setItem('sql_dungeons_settings', JSON.stringify(this.settings)); } catch (e) { console.warn('Settings save failed', e); }
    }

    loadSettings() {
        try {
            const s = localStorage.getItem('sql_dungeons_settings');
            if (s) {
                const parsed = JSON.parse(s);
                this.settings = Object.assign(this.settings, parsed);
            }
        } catch (e) { console.warn('Settings load failed', e); }
    }

    exportJSON() {
        try {
            const data = localStorage.getItem(SAVE_KEY);
            if (!data) { this.showFeedback('保存データが存在しません'); return; }

            let pretty;
            try { pretty = JSON.stringify(JSON.parse(data), null, 2); } catch (e) { pretty = data; }
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const blob = new Blob([pretty], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sql-dungeons-save-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) { this.showFeedback('エクスポートに失敗しました'); }
    }

    importJSON(ev) {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                let parsed;
                try { parsed = JSON.parse(text); } catch (err) { this.showFeedback('無効なJSONです'); return; }

                localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
                this.showFeedback('インポート成功。ゲームをロードします...');

                if (this.game && typeof this.game.loadGame === 'function') {
                    try { this.game.loadGame(); this.showFeedback('ゲームデータを読み込みました'); } catch (err) { this.showFeedback('ゲーム読み込みに失敗しました'); }
                } else {

                    setTimeout(() => { location.reload(); }, 700);
                }
            } catch (err) { this.showFeedback('インポートに失敗しました'); }
        };
        reader.readAsText(f);
    }

    showResult(message, type, keepTable = false) {
        const messageEl = document.createElement('p');
        messageEl.className = 'result-message';
        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        const table = this.elements['result-area'].querySelector('#result-table');
        this.elements['result-area'].innerHTML = '';
        this.elements['result-area'].appendChild(messageEl);
        if (keepTable && table) {
            this.elements['result-area'].appendChild(table);
        }
        this.elements['result-area'].className = `result-${type}`;
    }

    displayTable(data) {
        const existingTable = this.elements['result-area'].querySelector('#result-table');
        if (existingTable) existingTable.remove();
        if (!data || data.length === 0) return;
        const table = document.createElement('table');
        table.id = 'result-table';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const keys = Object.keys(data[0]);
        const simplify = (k) => {
            // テーブル名.カラム名 の形式ならカラム名だけ表示
            if (typeof k === 'string') {
                if (k.indexOf('.') !== -1 && k.indexOf('(') === -1 && /^\w+(?:\.\w+)+$/.test(k)) return k.split('.').pop();
                return k;
            }
            return k;
        };
        keys.forEach(key => {
            const th = document.createElement('th');
            th.textContent = simplify(key);
            th.dataset.key = key;
            headerRow.appendChild(th);
        });
        const tbody = table.createTBody();
        data.forEach(rowData => {
            const row = tbody.insertRow();
            keys.forEach(k => {
                const cell = row.insertCell();
                const v = rowData.hasOwnProperty(k) ? rowData[k] : rowData[k.replace(/^[^\.]+\./, '')];
                cell.textContent = (v === undefined || v === null) ? '' : v;
            });
        });
        this.elements['result-area'].appendChild(table);
    }

    updateStats(player) {
        this.elements['gold-status'].textContent = `💰 ${player.gold} G`;
        this.elements['energy-status'].textContent = `⚡ ${player.energy} E`;
    }

    updateInventory(player) {
        this.elements['inventory-list'].innerHTML = '';
        const allItems = new Set([
            ...player.inventory,
            ...player.borrowedItems,
            ...Object.keys(player.consumableItems)
        ]);
        [...allItems].sort().forEach(item => {
            const count = player.consumableItems[item];
            if (count === 0) return;
            const itemEl = document.createElement('div');
            itemEl.classList.add('inventory-item');
            if (player.borrowedItems.has(item) && !player.inventory.has(item)) {
                itemEl.classList.add('borrowed-item');
            }
            let text = item;
            if (count > 0) text += ` (x${count})`;
            itemEl.textContent = text;
            itemEl.dataset.item = item;
            // ツールチップ
            try {
                if (this.tooltipEl) {
                    // マウスカーソル (PC)
                    itemEl.addEventListener('mouseenter', (ev) => {
                        const keyBase = String(item).toLowerCase().replace(/\s+/g, '_');
                        const tryKey = `sql.keyword.${String(item).toLowerCase()}.desc`;
                        let desc = this.i18n.t(tryKey);

                        if (desc === tryKey || !desc) desc = itemEl.textContent || item;
                        this.tooltipEl.textContent = desc;
                        this.tooltipEl.style.display = 'block';
                        const x = ev.pageX + 12;
                        const y = ev.pageY + 12;
                        this.tooltipEl.style.left = x + 'px';
                        this.tooltipEl.style.top = y + 'px';
                    });
                    itemEl.addEventListener('mousemove', (ev) => {
                        if (!this.tooltipEl) return;
                        const x = ev.pageX + 12;
                        const y = ev.pageY + 12;
                        this.tooltipEl.style.left = x + 'px';
                        this.tooltipEl.style.top = y + 'px';
                    });
                    itemEl.addEventListener('mouseleave', () => {
                        if (!this.tooltipEl) return;
                        this.tooltipEl.style.display = 'none';
                    });

                    // タッチ操作 (モバイル)
                    let touchTimer = null;
                    let touchStartX = 0;
                    let touchStartY = 0;
                    const LONGPRESS_MS = 400;

                    const clearTouch = () => {
                        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
                    };

                    itemEl.addEventListener('touchstart', (ev) => {
                        if (!ev.touches || ev.touches.length === 0) return;
                        const t = ev.touches[0];
                        touchStartX = t.pageX;
                        touchStartY = t.pageY;

                        touchTimer = setTimeout(() => {
                            const tryKey = `sql.keyword.${String(item).toLowerCase()}.desc`;
                            let desc = this.i18n.t(tryKey);
                            if (desc === tryKey || !desc) desc = itemEl.textContent || item;
                            this.tooltipEl.textContent = desc;
                            this.tooltipEl.style.display = 'block';
                            const x = touchStartX + 12;
                            const y = touchStartY + 12;
                            this.tooltipEl.style.left = x + 'px';
                            this.tooltipEl.style.top = y + 'px';
                        }, LONGPRESS_MS);
                    }, { passive: true });

                    itemEl.addEventListener('touchmove', (ev) => {
                        if (!ev.touches || ev.touches.length === 0) return;
                        const t = ev.touches[0];
                        const dx = Math.abs(t.pageX - touchStartX);
                        const dy = Math.abs(t.pageY - touchStartY);

                        if (dx > 10 || dy > 10) {
                            clearTouch();
                            if (this.tooltipEl) this.tooltipEl.style.display = 'none';
                        }
                    }, { passive: true });

                    itemEl.addEventListener('touchend', (ev) => {
                        clearTouch();
                        if (this.tooltipEl) this.tooltipEl.style.display = 'none';
                    });

                    itemEl.addEventListener('touchcancel', (ev) => {
                        clearTouch();
                        if (this.tooltipEl) this.tooltipEl.style.display = 'none';
                    });
                }
            } catch (e) { 
                console.error('Tooltip setup error:', e);
             }
            this.elements['inventory-list'].appendChild(itemEl);
        });
    }
}
