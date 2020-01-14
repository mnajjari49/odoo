odoo.define('web.control_panel_tests', function (require) {
"use strict";

const AbstractAction = require('web.AbstractAction');
const ControlPanelStore = require('web.ControlPanelStore');
const core = require('web.core');
const dataManager = require('web.data_manager');
const makeTestEnvironment = require('web.test_env');
const testUtils = require('web.test_utils');

const createActionManager = testUtils.createActionManager;
const setUpControlPanelEnvironment = testUtils.setUpControlPanelEnvironment;

function createControlPanelStore(arch = '<search/>', fields = {}) {
    return new ControlPanelStore({
        actionDomain: "",
        actionContext: {},
        env: makeTestEnvironment(),
        modelName: "",
        viewInfo: { arch, fields },
    });
}

function filtersAreEqualTo(assert, store, comparison) {
    const filters = Object.values(store.state.filters).map(filter => {
        const copy = Object.assign({}, filter);
        delete copy.groupId;
        delete copy.groupNumber;
        delete copy.id;
        return copy;
    });
    return assert.deepEqual(filters, comparison,
        `Control Panel state should have ${comparison.length} filters.`
    );
}

QUnit.module('ControlPanel', {
    beforeEach() {
        this.data = {
            partner: {
                fields: {
                    display_name: { string: "Displayed name", type: 'char' },
                    foo: {string: "Foo", type: "char", default: "My little Foo Value", store: true, sortable: true},
                    date_field: {string: "Date", type: "date", store: true, sortable: true},
                    float_field: {string: "Float", type: "float"},
                    bar: {string: "Bar", type: "many2one", relation: 'partner'},
                },
                records: [],
                onchanges: {},
            },
        };
    }
}, function () {
    QUnit.module('Control panel arch parsing');

    QUnit.test('empty arch', function (assert) {
        assert.expect(1);

        const controlPanelStore = createControlPanelStore();
        filtersAreEqualTo(assert, controlPanelStore, []);
    });

    QUnit.test('one field tag', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <field name="bar"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);

        filtersAreEqualTo(assert, controlPanelStore, [
            {
                attrs: {
                    name: "bar",
                    string: "Bar"
                },
                autoCompleteValues: [],
                description: "bar",
                isDefault: false,
                type: "field",
            },
        ]);
    });

    QUnit.test('one separator tag', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <separator/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, []);
    });

    QUnit.test('one separator tag and one field tag', function (assert) {
        assert.expect(1);
        const arch =
            `<search>
                <separator/>
                <field name="bar"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                attrs: {
                    name: "bar",
                    string: "Bar",
                },
                autoCompleteValues: [],
                description: "bar",
                isDefault: false,
                type: "field",
            },
        ]);
    });

    QUnit.test('one filter tag', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <filter name="filter" string="Hello" domain="[]"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                context: {},
                description: "Hello",
                domain: "[]",
                isDefault: false,
                type: "filter",
            },
        ]);
    });

    QUnit.test('one groupBy tag', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <groupBy name="groupby" string="Hi" context="{ 'group_by': 'date_field:day'}"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                currentOptionIds: [],
                defaultOptionId: "month",
                description: "Hi",
                fieldName: "date_field",
                fieldType: "date",
                hasOptions: true,
                isDefault: false,
                options: [
                    {
                        groupNumber: 1,
                        optionId: "year",
                    },
                    {
                        groupNumber: 1,
                        optionId: "quarter",
                    },
                    {
                        groupNumber: 1,
                        optionId: "month",
                    },
                    {
                        groupNumber: 1,
                        optionId: "week",
                    },
                    {
                        groupNumber: 1,
                        optionId: "day",
                    },
                ],
                type: "groupBy",
            },
        ]);
    });

    QUnit.test('two filter tags', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <filter name="filter_1" string="Hello One" domain="[]"/>
                <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                context: {},
                description: "Hello One",
                domain: "[]",
                isDefault: false,
                type: "filter",
            },
            {
                context: {},
                description: "Hello Two",
                domain: "[('bar', '=', 3)]",
                isDefault: false,
                type: "filter",
            }
        ]);
    });

    QUnit.test('two filter tags separated by a separator', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <filter name="filter_1" string="Hello One" domain="[]"/>
                <separator/>
                <filter name="filter_2" string="Hello Two" domain="[('bar', '=', 3)]"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                context: {},
                description: "Hello One",
                domain: "[]",
                isDefault: false,
                type: "filter",
            },
            {
                context: {},
                description: "Hello Two",
                domain: "[('bar', '=', 3)]",
                isDefault: false,
                type: "filter",
            },
        ]);
    });

    QUnit.test('one filter tag and one field', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <filter name="filter" string="Hello" domain="[]"/>
                <field name="bar"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                context: {},
                description: "Hello",
                domain: "[]",
                isDefault: false,
                type: "filter",
            },
            {
                attrs: {
                    name: "bar",
                    string: "Bar",
                },
                autoCompleteValues: [],
                description: "bar",
                isDefault: false,
                type: "field",
            },
        ]);
    });

    QUnit.test('two field tags', function (assert) {
        assert.expect(1);
        const arch = `
            <search>
                <field name="foo"/>
                <field name="bar"/>
            </search>`;
        const fields = this.data.partner.fields;
        const controlPanelStore = createControlPanelStore(arch, fields);
        filtersAreEqualTo(assert, controlPanelStore, [
            {
                attrs: {
                    name: "foo",
                    string: "Foo",
                },
                autoCompleteValues: [],
                description: "foo",
                isDefault: false,
                type: "field",
            },
            {
                attrs: {
                    name: "bar",
                    string: "Bar",
                },
                autoCompleteValues: [],
                description: "bar",
                isDefault: false,
                type: "field",
            },
        ]);
    });

    QUnit.module('Control panel behaviour');

    QUnit.test('remove a facet with backspace', async function (assert) {
        assert.expect(2);

        const webClient = await setUpControlPanelEnvironment({
            arch: `
                <search>
                    <filter name="filterA" string="A" domain="[]"/>
                </search>`,
            data: this.data,
            model: 'partner',
            searchMenuTypes: ['filter'],
        });
        const controlPanel = webClient.controlPanel.comp;

        await testUtils.dom.click(controlPanel.el.querySelector('.o_filter_menu button'));
        await testUtils.dom.click(controlPanel.el.querySelector('.o_menu_item a'));
        assert.strictEqual(controlPanel.el.querySelector('.o_searchview .o_searchview_facet .o_facet_values span').innerText.trim(), 'A',
            'should have a facet with A');

        // delete a facet
        const searchInput = controlPanel.el.querySelector('input.o_searchview_input');
        await testUtils.dom.triggerEvent(searchInput, 'keydown', { key: 'Backspace' });

        assert.containsNone(controlPanel, '.o_searchview .o_searchview_facet .o_facet_values span',
            'there should be no facet');

        // delete nothing (should not crash)
        await testUtils.dom.triggerEvent(searchInput, 'keydown', { key: 'Backspace' });

        webClient.destroy();
    });

    QUnit.test('keyboard navigation', async function (assert) {
        assert.expect(1);
        // TODO
        assert.ok(1);
    });

    QUnit.module('Control panel rendering');

    QUnit.test('default breadcrumb in abstract action', async function (assert) {
        assert.expect(1);

        const ConcreteAction = AbstractAction.extend({
            hasControlPanel: true,
        });
        core.action_registry.add('ConcreteAction', ConcreteAction);

        const actionManager = await createActionManager();
        await actionManager.doAction({
            id: 1,
            name: "A Concrete Action",
            tag: 'ConcreteAction',
            type: 'ir.actions.client',
        });

        assert.strictEqual(actionManager.el.querySelector('.breadcrumb').innerText, "A Concrete Action");

        actionManager.destroy();
    });

    QUnit.test('fields and filters with groups/invisible attribute', async function (assert) {
        assert.expect(13);
        const webClient = await setUpControlPanelEnvironment({
            arch: `
                <search>
                    <field name="display_name" string="Foo B" invisible="1"/>
                    <field name="foo" string="Foo A"/>
                    <filter name="filterA" string="FA" domain="[]"/>
                    <filter name="filterB" string="FB" invisible="1" domain="[]"/>
                    <filter name="groupByA" string="GA" context="{ 'group_by': 'date_field:day' }"/>
                    <filter name="groupByB" string="GB" context="{ 'group_by': 'date_field:day' }" invisible="1"/>
                </search>`,
            context: {
                search_default_display_name: 'value',
                search_default_filterB: true,
                search_default_groupByB: true,
            },
            data: this.data,
            model: 'partner',
            searchMenuTypes: ['filter', 'groupBy'],
        });
        const controlPanel = webClient.controlPanel.comp;

        function selectorContainsValue(selector, value, shouldContain) {
            const elements = [...controlPanel.el.querySelectorAll(selector)];
            const matches = elements.filter(el => el.innerText.match(value));
            assert.strictEqual(matches.length, shouldContain ? 1 : 0,
                `${selector} in the control panel should${shouldContain ? '' : ' not'} contain ${value}.`
            );
        }

        // default filters/fields should be activated even if invisible
        assert.containsN(controlPanel, '.o_searchview_facet', 3);

        await testUtils.dom.click(controlPanel.el.querySelector('.o_filter_menu button'));

        selectorContainsValue('.o_menu_item a', "FA", true);
        selectorContainsValue('.o_menu_item a', "FB", false);
        // default filter should be activated even if invisible
        selectorContainsValue('.o_searchview_facet .o_facet_values', "FB", true);

        await testUtils.dom.click(controlPanel.el.querySelector('.o_group_by_menu button'));

        selectorContainsValue('.o_menu_item a', "GA", true);
        selectorContainsValue('.o_menu_item a', "GB", false);
        // default filter should be activated even if invisible
        selectorContainsValue('.o_searchview_facet .o_facet_values', "GB", true);

        assert.strictEqual(controlPanel.el.querySelector('.o_searchview_facet').innerText.replace(/[\s\t]+/g, ""), "FooBvalue");

        // 'A' to filter nothing on bar
        const searchInput = controlPanel.el.querySelector('.o_searchview_input');
        await testUtils.fields.editInput(searchInput, 'A');
        // the only item in autocomplete menu should be FooA: a
        assert.strictEqual(controlPanel.el.querySelector('.o_searchview_autocomplete').innerText.replace(/[\s\t]+/g, ""), "SearchFooAfor:A");
        await testUtils.dom.triggerEvent(searchInput, 'keydown', { key: 'Enter' });

        // The items in the Filters menu and the Group By menu should be the same as before
        await testUtils.dom.click(controlPanel.el.querySelector('.o_filter_menu button'));

        selectorContainsValue('.o_menu_item a', "FA", true);
        selectorContainsValue('.o_menu_item a', "FB", false);

        await testUtils.dom.click(controlPanel.el.querySelector('.o_group_by_menu button'));

        selectorContainsValue('.o_menu_item a', "GA", true);
        selectorContainsValue('.o_menu_item a', "GB", false);

        webClient.destroy();
    });

    QUnit.test('favorites use by default and share are exclusive', async function (assert) {
        assert.expect(11);
        const webClient = await setUpControlPanelEnvironment({
            arch: '<search/>',
            data: this.data,
            model: 'partner',
            searchMenuTypes: ['favorite'],
        });
        const controlPanel = webClient.controlPanel.comp;

        await testUtils.dom.click(controlPanel.el.querySelector('.o_favorite_menu button'));
        await testUtils.dom.click(controlPanel.el.querySelector('.o_add_favorite button'));
        const checkboxes = controlPanel.el.querySelectorAll('input[type="checkbox"]');

        assert.strictEqual(checkboxes.length, 2, '2 checkboxes are present');

        assert.notOk(checkboxes[0].checked, 'Start: None of the checkboxes are checked (1)');
        assert.notOk(checkboxes[1].checked, 'Start: None of the checkboxes are checked (2)');

        await testUtils.dom.click(checkboxes[0]);
        assert.ok(checkboxes[0].checked, 'The first checkbox is checked');
        assert.notOk(checkboxes[1].checked, 'The second checkbox is not checked');

        await testUtils.dom.click(checkboxes[1]);
        assert.notOk(checkboxes[0].checked,
            'Clicking on the second checkbox checks it, and unchecks the first (1)');
        assert.ok(checkboxes[1].checked,
            'Clicking on the second checkbox checks it, and unchecks the first (2)');

        await testUtils.dom.click(checkboxes[0]);
        assert.ok(checkboxes[0].checked,
            'Clicking on the first checkbox checks it, and unchecks the second (1)');
        assert.notOk(checkboxes[1].checked,
            'Clicking on the first checkbox checks it, and unchecks the second (2)');

        await testUtils.dom.click(checkboxes[0]);
        assert.notOk(checkboxes[0].checked, 'End: None of the checkboxes are checked (1)');
        assert.notOk(checkboxes[1].checked, 'End: None of the checkboxes are checked (2)');

        webClient.destroy();
    });

    // TOREMOVE
    QUnit.skip('load filter', async function (assert) {
        assert.expect(1);

        const webClient = await setUpControlPanelEnvironment({
            arch: '<search/>',
            data: this.data,
            intercepts: {
                load_filters(ev) {
                    ev.data.on_success([
                        {
                            user_id: [2, "Mitchell Admin"],
                            name: 'sorted filter',
                            id: 5,
                            context: {},
                            sort: '["foo", "-bar"]',
                            domain: "[('user_id', '=', uid)]",
                        },
                    ]);
                }
            },
            model: 'partner',
            searchMenuTypes: ['filter'],
        });
        const controlPanel = webClient.controlPanel.comp;
        const store = controlPanel.env.controlPanelStore;
        const exportedState = store.exportState();
        for (const filter in exportedState.filters) {
            if (filter.type === 'favorite') {
                assert.deepEqual(filter.orderedBy,
                    [
                        {
                            asc: true,
                            name: 'foo',
                        }, {
                            asc: false,
                            name: 'bar',
                        }
                    ],
                    'the filter should have the right orderedBy values'
                );
            }
        }

        webClient.destroy();
    });

    QUnit.test('save filter', async function (assert) {
        assert.expect(1);

        owl.Component.env = makeTestEnvironment({
            session: {
                user_context: {
                    length: undefined,
                    __ref: undefined,
                },
            },
        });
        const testPromise = testUtils.makeTestPromise();
        const webClient = await setUpControlPanelEnvironment({
            arch: '<search/>',
            data: this.data,
            intercepts: {
                get_controller_query_params(callback) {
                    callback({
                        orderedBy: [
                            {
                                asc: true,
                                name: 'foo',
                            }, {
                                asc: false,
                                name: 'bar',
                            },
                        ],
                    });
                },
            },
            model: 'partner',
            searchMenuTypes: ['favorite'],
        });
        const controlPanel = webClient.controlPanel.comp;

        // Patch create filter since this is no event and cannot be intercepted.
        const createFilter = dataManager.create_filter;
        dataManager.create_filter = function (filter) {
            assert.strictEqual(filter.sort, '["foo","bar desc"]',
                'The right format for the string "sort" should be sent to the server'
            );
            testPromise.resolve();
            return createFilter(...arguments);
        }

        await testUtils.dom.click(controlPanel.el.querySelector('.o_favorite_menu button'));
        await testUtils.dom.click(controlPanel.el.querySelector('.o_add_favorite button'));

        await testUtils.fields.editInput(controlPanel.el.querySelector('.o_add_favorite input'), "aaa");
        await testUtils.dom.click(controlPanel.el.querySelector('.o_add_favorite .btn-primary'));

        await testPromise;

        webClient.destroy();

        // Unpatch the data manager.
        dataManager.create_filter = createFilter;
    });
});
});
