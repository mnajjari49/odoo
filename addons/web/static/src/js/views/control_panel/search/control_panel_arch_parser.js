odoo.define('web.parseControlPanelArch', async function (require) {
    "use strict";

    const { parseArch } = require('web.viewUtils');
    const pyUtils = require('web.py_utils');

    /**
     * @param {string} arch 'search' arch
     * @param {Object} [fields={}] information on fields
     * @param {Object} [context={}] used to determine the filter to activate by default
     * @returns {Object[]}
     */
    async function parseControlPanelArch(arch, fields={}, context={}) {

        const searchDefaults = {};
        for (const key in context) {
            const match = /^search_default_(.*)$/.exec(key);
            if (match) {
                searchDefaults[match[1]] = context[key];
                delete context[key];
            }
        }

        function evalArchChild(child) {
            if (child.attrs.context) {
                try {
                    const context = pyUtils.eval('context', child.attrs.context);
                    child.attrs.context = context;
                    if (context.group_by) {
                        // let us extract basic data since we just evaluated context
                        // and use a correct tag!
                        child.attrs.fieldName = context.group_by.split(':')[0];
                        child.attrs.defaultInterval = context.group_by.split(':')[1];
                        child.tag = 'groupBy';
                    }
                } catch (err) { }
            }
            if (child.attrs.name in searchDefaults) {
                child.attrs.isDefault = true;
                let val = searchDefaults[child.attrs.name];
                if (child.tag === 'field') {
                    if (val instanceof Array) {
                        val = val[0];
                    }
                    child.attrs.defaultAutocompleteValues = { val };
                } else if (child.tag === 'groupBy') {
                    child.attrs.defaultRank = typeof val === 'number' ? val : 100;
                }
            }
            return child;
        }

        const parsedArch = parseArch(arch);

        const children = parsedArch.children.filter(child => child.tag !== 'searchpanel');
        const preFilters = children.reduce((acc, child) => {
            if (child.tag === 'group') {
                return acc.concat(child.children.map(evalArchChild));
            } else {
                return [...acc, evalArchChild(child)];
            }
        }, []);
        preFilters.push({ tag: 'separator' });

        const promises = [];
        preFilters.forEach(preFilter => {
            if (preFilter.tag === 'field' && preFilter.attrs.isDefault) {
                const { defaultAutocompleteValues } = preFilter.attrs;
                const field = fields[preFilter.attrs.name] || {};
                defaultAutocompleteValues.isExactValue = true;
                if (field.type === 'many2one') {
                    const promise = rpc.query({
                        args: [defaultAutocompleteValues.value],
                        context: field.context,
                        method: 'name_get',
                        model: field.relation,
                    }).then(results => {
                        defaultAutocompleteValues.label = results[0][1];
                    }).guardedCatch(() => {
                        defaultAutocompleteValues.label = defaultAutocompleteValues.value;
                    });
                    promises.push(promise);
                } else {
                    defaultAutocompleteValues.label = defaultAutocompleteValues.value;
                }
            }
        });
        await Promise.all(promises);

        return preFilters;
    }

    return parseControlPanelArch;
});