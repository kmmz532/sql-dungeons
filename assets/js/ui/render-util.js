// UI描画ユーティリティ: スキーマテキスト→HTML変換

/**
 * スキーマテキストをHTMLに変換する。schema-termクラスとPK/CKクラスを付与
 * @param {string} schemaText
 * @returns {string}
 */
export function renderSchemaHTML(schemaText) {
    if (!schemaText) return '';
    const lines = schemaText.split('\n');
    const parsed = lines.map(rawLine => {
        const line = rawLine.replace(/\r$/, '');
        const trimmed = line.trim();
        let lineType = 'other';
        if (trimmed.startsWith('-')) lineType = 'columns';
        else if (/テーブル名|table/i.test(trimmed)) lineType = 'table';
        return { raw: line, trimmed, lineType };
    });

    // Match PK/CK markers in English (with word boundaries) and in CJK locales (no \b required)
    const hasPkToken = (txt) => /(\b(?:PK|PRIMARY\s*KEY|PRIMARYKEY)\b|\(PK\)|主キー)/i.test(txt);
    const hasCkToken = (txt) => /(\b(?:CK|CANDIDATE\s*KEY)\b|\(CK\)|候補キー)/i.test(txt);

    parsed.forEach(p => {
        if (p.lineType === 'columns') {
            const afterDash = p.trimmed.replace(/^[-\s]+/, '');
            const parts = afterDash.split(',').map(s => s.trim()).filter(Boolean);
            const cols = parts.map(part => {
                const m = part.match(/^([A-Za-z_][A-Za-z0-9_]*)(.*)$/);
                if (!m) return null;
                const name = m[1];
                const rest = (m[2] || '').trim();
                return {
                    name,
                    rest,
                    isPk: hasPkToken(rest),
                    isCk: false
                };
            }).filter(Boolean);
            cols.forEach(c => { c.isCk = !c.isPk && hasCkToken(c.rest); });
            p.columns = cols;
        } else {
            // detect pattern like: tableName (col1, col2, ...)
            const m = p.trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/);
            if (m) {
                const tableName = m[1];
                const inside = m[2] || '';
                const parts = inside.split(',').map(s => s.trim()).filter(Boolean);
                const cols = parts.map(name => ({ name, rest: '', isPk: false, isCk: false }));
                p.lineType = 'table';
                p.tableName = tableName;
                p.columns = cols;
            }
        }
    });

    const anyExplicitPk = parsed.some(p => (p.columns || []).some(c => c.isPk));
    if (!anyExplicitPk) {
        for (const p of parsed) {
            if (!p.columns) continue;
            const candidate = p.columns.find(c => /_id$/.test(c.name));
            if (candidate) { candidate.isPk = true; break; }
        }
    }

    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const out = parsed.map(p => {
        const esc = escapeHtml(p.raw);
            if (p.lineType === 'columns' && Array.isArray(p.columns) && p.columns.length > 0) {
            let rendered = esc;
            const cols = p.columns.slice().sort((a,b) => b.name.length - a.name.length);
            cols.forEach(col => {
                const classes = ['schema-term'];
                if (col.isPk) classes.push('pk');
                if (col.isCk) classes.push('ck');
                const span = `<span class="${classes.join(' ')}" data-term="${col.name}" data-term-type="column">${col.name}</span>`;
                rendered = rendered.replace(new RegExp('\\b' + col.name + '\\b'), span);
            });
            return `<div class="schema-line" data-line-type="${p.lineType}">${rendered}</div>`;
        }
            // special handling for table lines where we detected tableName and columns in parentheses
            if (p.lineType === 'table' && p.tableName) {
                const tbl = `<span class="schema-term table-name" data-term-type="table" data-term="${p.tableName}">${p.tableName}</span>`;
                const colSpans = (Array.isArray(p.columns) ? p.columns.map(c => `<span class="schema-term" data-term="${c.name}" data-term-type="column">${c.name}</span>`) : []).join(', ');
                return `<div class="schema-line" data-line-type="table">${tbl} (${colSpans})</div>`;
            }

        const replaced = esc.replace(/([A-Za-z_][A-Za-z0-9_]*)/g, (m) => {
            return `<span class="schema-term" data-term="${m}" data-term-type="column">${m}</span>`;
        });
        return `<div class="schema-line" data-line-type="${p.lineType}">${replaced}</div>`;
    }).join('');

    return out;
}
