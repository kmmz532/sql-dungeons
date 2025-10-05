// DOMManager: UI操作の責務を持つクラス
export class DOMManager {
    constructor(i18n) {
        this.i18n = i18n;
        this.elements = {};
        this.initializeElements();
        this.setupEventListeners();
        // Create a global tooltip element for inventory/tooltips
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
            'hint-modal', 'shop-item-list', 'floor-actions-container',
            'shop-btn', 'hint-modal-title', 'hint-modal-text',
            'hint-modal-actions'
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
    }

    showScreen(screenName) {
        ['start-screen', 'game-screen', 'end-screen'].forEach(id => {
            this.elements[id].classList.add('hidden');
        });
        this.elements[`${screenName}-screen`].classList.remove('hidden');
    }

    openModal(modalId) {
        this.elements[modalId].classList.remove('hidden');
    }

    closeModal(modal) {
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
        // Use stable keys from the first row and display simplified header names
        const keys = Object.keys(data[0]);
        const simplify = (k) => {
            // If qualified like 'table.column', show only the column part
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
            // Render cells in the same key order as headers
            keys.forEach(k => {
                const cell = row.insertCell();
                const v = rowData.hasOwnProperty(k) ? rowData[k] : rowData[k.replace(/^[^\.]+\./, '')];
                // fallback: if key missing (because server returned unqualified keys), try without prefix
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
            // tooltip: show usage/help when hovering over learned spells
            try {
                if (this.tooltipEl) {
                    itemEl.addEventListener('mouseenter', (ev) => {
                        const keyBase = String(item).toLowerCase().replace(/\s+/g, '_');
                        const tryKey = `sql.keyword.${String(item).toLowerCase()}.desc`;
                        let desc = this.i18n.t(tryKey);
                        // if t returned the key itself, it means missing; fall back to item name
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
                }
            } catch (e) { /* ignore tooltip binding errors */ }
            this.elements['inventory-list'].appendChild(itemEl);
        });
    }
}
