odoo.define('google_drive.gdrive_integration', function (require) {
    "use strict";
    //rebuild
    const FormView = require('web.FormView');
    const testUtils = require('web.test_utils');
    const GoogleDriveSideBar = require('google_drive.Sidebar');
    const makeTestEnvironment = require('web.test_env');

    const createView = testUtils.createView;

    /*
     * @override
     * Avoid breaking other tests because of the new route
     * that the module introduces
     */
    const _getGoogleDocItemsOriginal = GoogleDriveSideBar.prototype._getGoogleDocItems;

    async function _getGoogleDocItemsMocked() { }

    GoogleDriveSideBar.prototype._getGoogleDocItems = _getGoogleDocItemsMocked;

    QUnit.module('gdrive_integration', {
        beforeEach() {
            // For our test to work, the _getGoogleDocItems function needs to be the original
            GoogleDriveSideBar.prototype._getGoogleDocItems = _getGoogleDocItemsOriginal;

            this.data = {
                partner: {
                    fields: {
                        display_name: { string: "Displayed name", type: "char", searchable: true },
                    },
                    records: [{
                        id: 1,
                        display_name: "Locomotive Breath",
                    }, {
                        id: 2,
                        display_name: "Hey Macarena",
                    }],
                },
                'google.drive.config': {
                    fields: {
                        model_id: { string: 'Model', type: 'int' },
                        name: { string: 'Name', type: 'char' },
                        google_drive_resource_id: { string: 'Resource ID', type: 'char' },
                    },
                    records: [{
                        id: 27,
                        name: 'Cyberdyne Systems',
                        model_id: 1,
                        google_drive_resource_id: 'T1000',
                    }],
                },
                'ir.attachment': {
                    fields: {
                        name: { string: 'Name', type: 'char' }
                    },
                    records: [],
                }
            };
        },

        afterEach() {
            GoogleDriveSideBar.prototype._getGoogleDocItems = _getGoogleDocItemsMocked;
        },
    }, function () {
        QUnit.module('Google Drive Sidebar');

        QUnit.test('rendering of the google drive attachments in Sidebar', async function (assert) {
            assert.expect(3);

            async function mockRPC(route, args) {
                if (route === '/web/dataset/call_kw/google.drive.config/get_google_drive_config') {
                    assert.deepEqual(args.args, ['partner', 1],
                        'The route to get google drive config should have been called');
                    return [{
                        id: 27,
                        name: 'Cyberdyne Systems',
                    }];
                }
                if (route === '/web/dataset/call_kw/google.drive.config/search_read') {
                    return [{
                        google_drive_resource_id: "T1000",
                        google_drive_client_id: "cyberdyne.org",
                        id: 1,
                    }];
                }
                if (route === '/web/dataset/call_kw/google.drive.config/get_google_drive_url') {
                    assert.deepEqual(args.args, [27, 1, 'T1000'],
                        'The route to get the Google url should have been called');
                    // We don't return anything useful, otherwise it will open a new tab
                    return;
                }
                return this._super(...arguments);
            }

            owl.Component.env = makeTestEnvironment({}, mockRPC);

            const form = await createView({
                model: 'partner',
                data: this.data,
                arch:
                    `<form string="Partners">
                        <field name="display_name"/>
                    </form>`,
                res_id: 1,
                mockRPC,
                View: FormView,
                viewOptions: { hasSidebar: true },
            });
            const sidebar = new GoogleDriveSideBar(null, form._getSidebarProps());
            await sidebar.mount(testUtils.prepareTarget(), { position: 'first-child' });

            const actionToggleButton = [...sidebar.el.querySelectorAll('.o_dropdown_toggler_btn')].find(
                el => el.innerText.match("Action")
            );

            // click on gdrive sidebar item
            await testUtils.dom.click(actionToggleButton);
            await testUtils.dom.click(sidebar.el.querySelector('.oe_share_gdoc'));

            form.destroy();
        });

        QUnit.only('click on the google drive attachments after switching records', async function (assert) {
            assert.expect(3);

            async function mockRPC(route, args) {
                if (route === '/web/dataset/call_kw/google.drive.config/get_google_drive_config') {
                    assert.deepEqual(args.args, ['partner', 1],
                        'The route to get google drive config should have been called');
                    return [{
                        id: 27,
                        name: 'Cyberdyne Systems',
                    }];
                }
                if (route === '/web/dataset/call_kw/google.drive.config/search_read') {
                    return [{
                        google_drive_resource_id: "T1000",
                        google_drive_client_id: "cyberdyne.org",
                        id: 1,
                    }];
                }
                if (route === '/web/dataset/call_kw/google.drive.config/get_google_drive_url') {
                    assert.deepEqual(args.args, [27, currentID, 'T1000'],
                        'The route to get the Google url should have been called');
                    // We don't return anything useful, otherwise it will open a new tab
                    return;
                }
                return this._super(...arguments);
            }

            owl.Component.env = makeTestEnvironment({}, mockRPC);

            let currentID;
            const form = await createView({
                arch:
                    `<form string="Partners">
                        <field name="display_name"/>
                    </form>`,
                data: this.data,
                mockRPC,
                model: 'partner',
                res_id: 1,
                View: FormView,
                viewOptions: {
                    hasSidebar: true,
                    ids: [1, 2],
                    index: 0,
                },
                debug: 1
            });

            console.log([...document.querySelectorAll('.o_cp_sidebar .o_dropdown_toggler_btn')].find(
                el => el.innerText.match("Action")
            ));

            const actionToggleButton = [...document.querySelectorAll('.o_cp_sidebar .o_dropdown_toggler_btn')].find(
                el => el.innerText.match("Action")
            );

            await testUtils.nextTick();

            console.log([...document.querySelectorAll('.o_cp_sidebar .o_dropdown_toggler_btn')].find(
                el => el.innerText.match("Action")
            ));

            await testUtils.nextTick();

            console.log([...document.querySelectorAll('.o_cp_sidebar .o_dropdown_toggler_btn')].find(
                el => el.innerText.match("Action")
            ));

            return;

            currentID = 1;
            await testUtils.dom.click(actionToggleButton);
            await testUtils.dom.click(document.querySelector('.o_cp_sidebar .oe_share_gdoc'));

            await testUtils.dom.click(document.querySelector('.o_cp_pager .o_pager_next'));

            currentID = 2;
            await testUtils.dom.click(actionToggleButton);
            await testUtils.dom.click(document.querySelector('.o_cp_sidebar .oe_share_gdoc'));

            form.destroy();
        });
    });
});
