// DOMManager: UI操作の責務を持つクラス
import { SAVE_KEY } from '../constants.js';

export class DOMManager {
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
        // 外部で言語変更を受け取るためのコールバックを保持できるように
        this.onLanguageChange = null;

        this.setupEventListeners();

        // ツールチップ
        try {
            this.tooltipEl = document.createElement('div');
            this.tooltipEl.id = 'tooltip';
            this.tooltipEl.className = 'tooltip';
            this.tooltipEl.style.display = 'none';
            document.body.appendChild(this.tooltipEl);
        } catch (e) { this.tooltipEl = null; }
    }

    initializeElements() {
        const ids = [
            'start-screen', 'game-screen', 'end-screen', 'game-grid',
            'start-button', 'load-button', 'sandbox-button', 'retry-button', 'save-button',
            'next-floor-btn', 'floor-title', 'gold-status', 'energy-status',
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

    setupEventListeners() {
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(document.getElementById(btn.dataset.modalId));
            });
        });
        // グローバルなキーボード操作: ESCでモーダル閉じる / Ctrl+S (Cmd+S) でセーブ
        document.addEventListener('keydown', (ev) => {
            // 入力中はショートカットを無視（例: テキストエリアや入力フィールド）
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

            // ESC: 開いているモーダルがあれば閉じる（設定で無効化可能）
            if (ev.key === 'Escape') {
                if (!this.settings.enableEsc) return;
                ev.preventDefault();
                const openModal = document.querySelector('.modal-overlay:not(.hidden)');
                if (openModal) this.closeModal(openModal);
                return;
            }

            // Ctrl+S または Cmd+S: セーブをトリガー（設定で無効化可能）
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
            const langVal = (this.settings && this.settings.language) ? this.settings.language : 'ja';
            langSelect.value = langVal;

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
            // apply pendingSettings to actual settings and persist
            if (this.pendingSettings) {
                this.settings = Object.assign({}, this.settings, this.pendingSettings);
                this.saveSettings();
                // Apply language change if any
                if (typeof this.onLanguageChange === 'function') {
                    try { await this.onLanguageChange(this.settings.language); } catch (e) { console.warn('Language change failed', e); }
                }
                // close modal
                const modal = document.getElementById('settings-modal');
                if (modal) this.closeModal(modal);
            }
        });
        if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', () => {
            // discard pending settings and reset UI controls to current settings
            this.pendingSettings = Object.assign({}, this.settings);
            const modal = document.getElementById('settings-modal');
            if (modal) this.applyI18nToModal(modal);
            // reset controls
            const langSel = document.getElementById('settings-language'); if (langSel) langSel.value = this.settings.language || 'ja';
            const escChk = document.getElementById('settings-enable-esc'); if (escChk) escChk.checked = !!this.settings.enableEsc;
            const saveChk = document.getElementById('settings-enable-save-shortcut'); if (saveChk) saveChk.checked = !!this.settings.enableSaveShortcut;
            if (modal) this.closeModal(modal);
        });
    }

    // Apply data-i18n attributes inside a modal element using this.i18n
    applyI18nToModal(modalEl) {
        if (!modalEl || !this.i18n) return;
        // find any elements with data-i18n or data-i18n-placeholder
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

    // ゲームデータをJSONとしてエクスポート（localStorageのSAVE_KEYを想定）
    exportJSON() {
        try {
            const data = localStorage.getItem(SAVE_KEY);
            if (!data) { this.showFeedback('保存データが存在しません'); return; }
            // pretty-print JSON for readability
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

    // JSONインポート: ファイル選択イベントを受け取る
    importJSON(ev) {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                // validate JSON
                let parsed;
                try { parsed = JSON.parse(text); } catch (err) { this.showFeedback('無効なJSONです'); return; }
                // 上書き保存（整形して保存）
                localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
                this.showFeedback('インポート成功。ゲームをロードします...');
                // If DOMManager has a reference to game, call its loadGame
                if (this.game && typeof this.game.loadGame === 'function') {
                    try { this.game.loadGame(); this.showFeedback('ゲームデータを読み込みました'); } catch (err) { this.showFeedback('ゲーム読み込みに失敗しました'); }
                } else {
                    // Fallback: reload the page
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
            if (typeof k === 'string' && k.indexOf('.') !== -1) return k.split('.').pop();
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
