// DOMManager: UI操作の責務を持つクラス
export class DOMManager {
    constructor(i18n) {
        this.i18n = i18n;
        this.elements = {};
        this.initializeElements();
        this.setupEventListeners();
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
        Object.keys(data[0]).forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            headerRow.appendChild(th);
        });
        const tbody = table.createTBody();
        data.forEach(rowData => {
            const row = tbody.insertRow();
            Object.values(rowData).forEach(value => {
                const cell = row.insertCell();
                cell.textContent = value;
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
            this.elements['inventory-list'].appendChild(itemEl);
        });
    }
}
