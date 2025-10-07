// Playerモデル
export class Player {
    constructor() {
        this.gold = 100;
        this.energy = 10;
        this.inventory = new Set(['SELECT', 'FROM']);
        this.borrowedItems = new Set();
        this.purchasedHints = new Set();
        this.specialItems = { kuNext: 0 };
        this.consumableItems = {};
        this.clearedFloors = new Set();
    }

    addItem(item) {
        this.inventory.add(item);
    }

    hasItem(item) {
        return this.inventory.has(item) || 
               this.borrowedItems.has(item) ||
               (this.consumableItems[item] && this.consumableItems[item] > 0);
    }

    useConsumableItem(item) {
        if (this.consumableItems[item] > 0) {
            this.consumableItems[item]--;
            return true;
        }
        return false;
    }

    addGold(amount) {
        this.gold += amount;
    }

    spendGold(amount) {
        if (this.gold >= amount) {
            this.gold -= amount;
            return true;
        }
        return false;
    }

    addEnergy(amount) {
        this.energy += amount;
    }

    spendEnergy(amount) {
        if (this.energy >= amount) {
            this.energy -= amount;
            return true;
        }
        return false;
    }

    toJSON() {
        return {
            gold: this.gold,
            energy: this.energy,
            inventory: [...this.inventory],
            purchasedHints: [...this.purchasedHints],
            specialItems: this.specialItems,
            consumableItems: this.consumableItems
            ,clearedFloors: [...this.clearedFloors]
        };
    }

    static fromJSON(data) {
        const player = new Player();
        player.gold = data.gold;
        player.energy = data.energy;
        player.inventory = new Set(data.inventory);
        player.purchasedHints = new Set(data.purchasedHints);
        player.specialItems = data.specialItems || { kuNext: 0 };
        player.consumableItems = data.consumableItems || {};
        player.clearedFloors = new Set(data.clearedFloors || []);
        return player;
    }
}
