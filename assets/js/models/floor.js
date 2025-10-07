// Floorモデル
/**
 * フロアモデル。i18n対応のタイトル・ストーリー・ヒント・スキーマ取得メソッドを持つ。
 */
export class Floor {
    constructor({ floor, title, story, schema, tables, reward, hint, borrowed, opensShop, solutionPatterns, specialValidation }, i18n) {
        this.floor = floor;
        this.title = title;
        this.story = story;
        this.schema = schema;
        this.tables = tables || [];
        this.reward = reward;
        this.hint = hint;
        this.borrowed = borrowed || [];
        this.opensShop = opensShop || false;
        this.solutionPatterns = solutionPatterns || [];
        this.specialValidation = specialValidation || false;
        this.i18n = i18n;
    }

    /**
     * フロアタイトルを取得（i18n優先）。
     */
    getTitle(options = {}) {
        const i18n = options.i18n || this.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        const currentDungeon = options.currentDungeon || (window && window.game && window.game.currentDungeon) || null;
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            // prefer per-dungeon key if available
            let title = null;
            if (currentDungeon) {
                const pdKey = `dungeon.${currentDungeon}.floor${this.floor}.title`;
                title = i18n.t(pdKey);
                if (title && title.startsWith('dungeon.')) title = null;
            }
            if (!title) {
                const key = `dungeon.floor${this.floor}.title`;
                title = i18n.t(key);
            }
            if (locale && locale !== prev) i18n.locale = prev;
            if (title && !title.startsWith('dungeon.')) return title;
        }
        return this.title;
    }

    /**
     * フロアストーリーを取得（i18n優先）。
     */
    getStory(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        const currentDungeon = options.currentDungeon || (window && window.game && window.game.currentDungeon) || null;
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            let story = null;
            if (currentDungeon) {
                const pdKey = `dungeon.${currentDungeon}.floor${this.floor}.story`;
                story = i18n.t(pdKey);
                if (story && story.startsWith('dungeon.')) story = null;
            }
            if (!story) {
                const key = `dungeon.floor${this.floor}.story`;
                story = i18n.t(key);
            }
            if (locale && locale !== prev) i18n.locale = prev;
            if (story && !story.startsWith('dungeon.')) return story;
        }
        return this.story;
    }

    /**
     * フロアヒントを取得（i18n優先）。
     */
    getHint(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        const currentDungeon = options.currentDungeon || (window && window.game && window.game.currentDungeon) || null;
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            let hint = null;
            if (currentDungeon) {
                const pdKey = `dungeon.${currentDungeon}.floor${this.floor}.hint`;
                hint = i18n.t(pdKey);
                if (hint && hint.startsWith('dungeon.')) hint = null;
            }
            if (!hint) {
                const key = `dungeon.floor${this.floor}.hint`;
                hint = i18n.t(key);
            }
            if (locale && locale !== prev) i18n.locale = prev;
            if (hint && !hint.startsWith('dungeon.')) return hint;
        }
        return this.hint;
    }

    /**
     * フロアのスキーマ（表定義）を取得（i18n優先）。
     * options.mockDatabase が渡された場合、this.tables を使ってmockから自動生成する。
     */
    getSchema(options = {}) {
        const i18n = options.i18n || window.i18n;
        const locale = options.locale || (i18n && i18n.locale);
        const mockDatabase = options.mockDatabase || null;
        // Prefer programmatic schema from mock database __schema metadata when available.
        if (Array.isArray(this.tables) && this.tables.length > 0 && mockDatabase && mockDatabase.__schema) {
            const meta = mockDatabase.__schema || {};

            const parts = [];

            const tnames = this.tables;
            for (const t of tnames) {
                const tmeta = meta[t] || meta[t.toLowerCase()];
                // gather columns order
                const cols = tmeta && tmeta.columns ? Object.keys(tmeta.columns) : [];
                parts.push(`${t} (${cols.join(', ')})`);

                if (cols.length === 0) {
                    parts.push('');
                    continue;
                }

                for (const c of cols) {
                    const colMeta = (tmeta && tmeta.columns && tmeta.columns[c]) || {};
                    const typeKey = `schema.type.${colMeta.type || 'text'}`;
                    const typeLabel = i18n ? i18n.t(typeKey) : (colMeta.type || 'text');

                    if (colMeta.pk) {
                        const pkLabel = i18n ? i18n.t('schema.pk') : 'PK';
                        parts.push(`- ${c}: ${pkLabel} (${typeLabel})`);
                        continue;
                    }

                    if (colMeta.fk) {
                        const fkTarget = colMeta.fk.table || colMeta.fk;
                        const fkLabel = i18n ? i18n.t('schema.fk', fkTarget) : `FK -> ${fkTarget}`;
                        parts.push(`- ${c}: ${fkLabel} (${typeLabel})`);
                        continue;
                    }

                    // candidate key (CK) detection: if column appears in candidateKeys
                    let isCk = false;
                    if (tmeta && Array.isArray(tmeta.candidateKeys)) {
                        isCk = tmeta.candidateKeys.some(ck => Array.isArray(ck) && ck.length === 1 && ck[0] === c);
                    }
                    if (isCk) {
                        const ckLabel = i18n ? i18n.t('schema.ck') : 'CK';
                        parts.push(`- ${c}: ${ckLabel} (${typeLabel})`);
                        continue;
                    }

                    // notNull marker
                    const notNull = colMeta.notNull;
                    if (notNull) {
                        if (i18n) {
                            const nn = i18n.t('schema.not_null') || 'NOT NULL';
                            parts.push(`- ${c}: ${typeLabel} (${nn})`);
                        } else {
                            parts.push(`- ${c}: ${typeLabel} (NOT NULL)`);
                        }
                    } else {
                        parts.push(`- ${c}: ${typeLabel}`);
                    }
                }

                parts.push('');
            }

            return parts.join('\n').trim();
        }

        // Fallback: try i18n key (legacy). If present and not untranslated, return it.
        if (i18n) {
            const prev = i18n.locale;
            if (locale && locale !== prev) i18n.locale = locale;
            const key = `dungeon.floor${this.floor}.schema`;
            let schema = i18n.t(key);
            if (locale && locale !== prev) i18n.locale = prev;
            if (schema && !schema.startsWith('dungeon.')) return schema;
        }

        if (Array.isArray(this.tables) && this.tables.length > 0 && mockDatabase) {
            // build a map of table -> columns and sample values
            const tableCols = {};
            for (const t of this.tables) {
                const rows = mockDatabase[t] || mockDatabase[t.toLowerCase()] || [];
                tableCols[t] = {
                    cols: (Array.isArray(rows) && rows.length > 0) ? Object.keys(rows[0]) : [],
                    sampleRows: rows.slice(0, 5)
                };
            }

            const parts = [];
            // helper type detection
            const detectType = (vals) => {
                // if all numbers -> integer
                if (vals.every(v => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)))) return 'integer';
                // if looks like YYYY-MM-DD
                if (vals.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) return 'date';
                return 'text';
            };

            // find primary keys (col name ends with _id) across tables
            const pks = {};
            for (const t of Object.keys(tableCols)) {
                const pk = tableCols[t].cols.find(c => /_id$/.test(c));
                if (pk) pks[t] = pk;
            }

            for (const t of this.tables) {
                const info = tableCols[t];
                const cols = info.cols || [];
                parts.push(`${t} (${cols.join(', ')})`);

                for (const c of cols) {
                    // gather sample values for type detection
                    const vals = info.sampleRows.map(r => r[c]).filter(v => v !== undefined && v !== null);
                    const type = vals.length ? detectType(vals) : 'text';
                    // determine flags
                    const isPk = /_id$/.test(c);
                    // check foreign key: if col matches another table's pk
                    const fkTable = Object.keys(pks).find(tt => pks[tt] === c);

                    if (isPk) {
                        parts.push(`- ${c}: ${this.i18n ? this.i18n.t('schema.pk') : 'PK'} (${this.i18n ? this.i18n.t('schema.type.' + type) : type})`);
                    } else if (fkTable) {
                        const fkLabel = this.i18n ? this.i18n.t('schema.fk', fkTable) : `FK -> ${fkTable}`;
                        parts.push(`- ${c}: ${fkLabel} (${this.i18n ? this.i18n.t('schema.type.' + type) : type})`);
                    } else {
                        parts.push(`- ${c}: ${this.i18n ? this.i18n.t('schema.type.' + type) : type}`);
                    }
                }
                parts.push('');
            }
            return parts.join('\n').trim();
        }

        return this.schema;
    }
}
