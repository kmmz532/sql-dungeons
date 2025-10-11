// サンドボックスUI制御

export class SandboxUI {
    constructor(gameCore) {
        this.core = gameCore;
    }

    // Build or re-build the sandbox controls that appear above the schema panel.
    // This method is idempotent: it removes prior controls before creating new ones,
    // and wires change events to update this.core.sandboxSelectedTables and re-render schema.
    createControls() {
        try {
            // remove any existing controls/wrappers
            try { 
                document.querySelectorAll('.sandbox-controls').forEach(n => n.remove()); 
            } catch (e) {}
            try { 
                document.querySelectorAll('.sandbox-schema-wrapper').forEach(n => n.remove()); 
            } catch (e) {}

            const schemaContainer = this.core.dom && this.core.dom.elements ? this.core.dom.elements['quest-schema'] : null;
            if (!schemaContainer) return;

            // サンドボックスモードでは統合された全データベースを使用
            const mockDb = this.core.gameData?.mergedMockDatabase || this.core.gameData?.mockDatabase || {};
            const tables = Object.keys(mockDb).filter(k => !k.startsWith('__'));
            if (!tables || tables.length === 0) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'sandbox-schema-wrapper';

            const controls = document.createElement('div');
            controls.className = 'sandbox-controls';

            const label = document.createElement('label');
            label.className = 'sandbox-controls-label';
            label.textContent = "";
            label.style.marginRight = '8px';
            controls.appendChild(label);

            const select = document.createElement('select');
            select.className = 'sandbox-table-select';
            select.multiple = true;
            select.size = Math.min(8, tables.length);
            select.style.minWidth = '220px';

            tables.forEach(tn => {
                const opt = document.createElement('option');
                opt.value = tn;
                opt.textContent = tn;
                select.appendChild(opt);
            });

            // default selection: prefer table001 if present, otherwise keep current or select all
            const defaultSel = Array.isArray(this.core.sandboxSelectedTables) && this.core.sandboxSelectedTables.length 
                ? this.core.sandboxSelectedTables 
                : (tables.includes('table001') ? ['table001'] : tables.slice());
            
            Array.from(select.options).forEach(o => { 
                if (defaultSel.includes(o.value)) o.selected = true; 
            });

            select.addEventListener('change', () => {
                try {
                    const sel = Array.from(select.selectedOptions).map(o => o.value);
                    this.core.sandboxSelectedTables = sel;
                    // re-render schema for sandbox
                    try { 
                        this.core.lifecycle.loadFloor(this.core.currentFloor || 0); 
                    } catch (e) { /* non-fatal */ }
                } catch (e) { 
                    console.error('Failed to handle table select change', e); 
                }
            });

            controls.appendChild(select);
            wrapper.appendChild(controls);
            schemaContainer.parentNode.insertBefore(wrapper, schemaContainer);

            // ensure property is set
            this.core.sandboxSelectedTables = Array.isArray(this.core.sandboxSelectedTables) && this.core.sandboxSelectedTables.length 
                ? this.core.sandboxSelectedTables 
                : defaultSel;
        } catch (e) {
            console.error('Failed to create sandbox controls', e);
        }
    }

    // Clean up sandbox UI artifacts
    cleanup() {
        try { 
            const sc = document.querySelector('.sandbox-controls'); 
            if (sc) sc.remove(); 
        } catch(e) { console.error(e); }
        
        try { 
            const sw = document.querySelectorAll('.sandbox-schema-wrapper'); 
            if (sw) sw.forEach(s => s.remove()); 
        } catch(e) { console.error(e); }
        
        try { 
            document.body.classList.remove('sandbox-mode'); 
        } catch(e) { console.error(e); }
    }
}
