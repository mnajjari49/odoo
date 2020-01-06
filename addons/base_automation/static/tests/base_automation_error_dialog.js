odoo.define('base_automation.BaseAutomatioErrorDialogTests', function (require) {
"use strict";

    const CrashManager = require('web.CrashManager').CrashManager;

    QUnit.module('base_automation', {}, function () {

        QUnit.module('Error Dialog');

        QUnit.test('Error dialog with disable/edit automated actions buttons', async function (assert) {
            assert.expect(4);

            let baseAutomationName = "Test base automation error dialog";
            let error = {
                type: "Odoo Client Error",
                message: "Message",
                data: {
                    debug: 'Traceback',
                    context: {
                        exception_class: 'base_automation',
                        base_automation: {
                            id: 1,
                            name: baseAutomationName,
                            is_admin: true,
                        },
                    },
                },
            };
            let crashManager = new CrashManager();
            let dialog = crashManager.show_error(error);

            await dialog._opened;

            let $el = dialog.$el;

            assert.strictEqual($el.find('.o_clipboard_button').length, 1, "should display Copy full error button");
            assert.strictEqual($el.find('.o_disable_action_button').length, 1, "should display Disable action button");
            assert.strictEqual($el.find('.o_edit_action_button').length, 1, "should display Edit action button");
            assert.ok($el.text().indexOf(baseAutomationName) !== -1, "should display the automated action name");

            crashManager.destroy();
        });

        QUnit.test('Error dialog without automated action', async function (assert) {
            assert.expect(3);

            let error = {
                type: "Odoo Client Error",
                message: "Message",
                data: {
                    debug: 'Traceback',
                },
            };
            let crashManager = new CrashManager();
            let dialog = crashManager.show_error(error);

            await dialog._opened;

            let $el = dialog.$el;

            assert.strictEqual($el.find('.o_clipboard_button').length, 1, "should display Copy full error button");
            assert.strictEqual($el.find('.o_disable_action_button').length, 0, "should not display Disable action button");
            assert.strictEqual($el.find('.o_edit_action_button').length, 0, "should not display Edit action button");

            crashManager.destroy();
        });

    });

});
