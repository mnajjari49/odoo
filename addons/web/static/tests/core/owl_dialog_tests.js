odoo.define('web.owl_dialog_tests', function (require) {
    "use strict";

    const LegacyDialog = require('web.Dialog');
    const makeTestEnvironment = require('web.test_env');
    const Dialog = require('web.OwlDialog');
    const testUtils = require('web.test_utils');

    const { Component, tags, useState } = owl;
    const EscapeKey = { key: 'Escape', keyCode: 27, which: 27 };
    const { xml } = tags;

    QUnit.module('core', {}, function () {
        QUnit.module('OwlDialog');

        QUnit.test("Rendering of all props", async function (assert) {
            assert.expect(38);

            class SubComponent extends Component {
                // Handlers
                _onClick() {
                    assert.step('subcomponent_clicked');
                }
            }
            SubComponent.template = xml`<div class="o_subcomponent" t-esc="props.text" t-on-click="_onClick"/>`;

            class Parent extends Component {
                constructor() {
                    super(...arguments);
                    this.state = useState({ textContent: "sup" });
                }
                // Handlers
                _onDialogButtonClicked(ev) {
                    assert.ok(ev.detail.hiddenData,
                        "Detail should contain the keys and values of the given metadata object");
                    assert.step('dialog_button_clicked');
                }
                _onDialogClosed() {
                    assert.step('dialog_closed');
                }
            }
            Parent.components = { Dialog, SubComponent };
            Parent.env = makeTestEnvironment({ _t: str => str });
            Parent.template = xml`
                <Dialog target="'body'"
                    backdrop="state.backdrop"
                    buttons="state.buttons"
                    dialogClass="state.dialogClass"
                    focusFirstButton="state.focusFirstButton"
                    fullscreen="state.fullscreen"
                    renderFooter="state.renderFooter"
                    renderHeader="state.renderHeader"
                    sizeClass="state.sizeClass"
                    subtitle="state.subtitle"
                    technical="state.technical"
                    title="state.title"
                    t-on-dialog_button_clicked="_onDialogButtonClicked"
                    t-on-dialog_closed="_onDialogClosed"
                    >
                    <SubComponent text="state.textContent"/>
                </Dialog>`;

            const parent = new Parent();
            await parent.mount(testUtils.prepareTarget());
            const dialog = document.querySelector('.o_dialog');
            const changeProps = async (key, value) => {
                parent.state[key] = value;
                await testUtils.nextTick();
            };

            // Basic layout with default properties
            assert.containsOnce(dialog, '.modal-backdrop.show');
            assert.containsOnce(dialog, '.modal.o_technical_modal');
            assert.hasClass(dialog.querySelector('.modal .modal-dialog'), 'modal-lg');
            assert.containsOnce(dialog, '.modal-header > button.close');
            assert.containsOnce(dialog, '.modal-footer > button.btn.btn-primary');
            assert.strictEqual(dialog.querySelector('.modal-body').innerText.trim(), "sup",
                "Subcomponent should match with its given text");

            // Focus first button (default: true)
            await changeProps('focusFirstButton', false);
            document.activeElement.blur();
            await testUtils.dom.click(dialog.querySelector('.modal-backdrop'));
            assert.notEqual(document.activeElement, dialog.querySelector('.btn-primary'),
                "Button should not be focused when clicking on backdrop with focusFirstButton = false");

            // Backdrop (default: 'static')
            // Static backdrop click should focus first button
            // => we need to reset that property
            await changeProps('focusFirstButton', true);
            await testUtils.dom.click(dialog.querySelector('.modal-backdrop'));
            assert.strictEqual(document.activeElement, dialog.querySelector('.btn-primary'),
                "Button should be focused when clicking on backdrop with focusFirstButton = true");

            await changeProps('backdrop', false);
            assert.containsNone(document.body, '.modal-backdrop');

            await changeProps('backdrop', true);
            await testUtils.dom.click(dialog.querySelector('.modal-backdrop'));

            // Buttons (default: [{ text: 'OK' }])
            const defaultButton = dialog.querySelector('.modal-footer .btn');
            assert.hasClass(defaultButton, 'btn-primary');
            assert.strictEqual(defaultButton.innerText.trim().toUpperCase(), 'OK',
                "Button should match with its default text");
            await testUtils.dom.click(defaultButton);
            await changeProps('buttons', [
                {
                    class: 'btn-primary',
                    icon: 'fa-heart',
                    metadata: { hiddenData: true },
                    size: 'large',
                    text: "OUI",
                    name: "oui",
                }, {
                    text: "NON",
                    disabled: true,
                    style: 'color: red;',
                }
            ]);
            const [primary, secondary] = dialog.querySelectorAll('.modal-footer .btn');
            assert.hasClass(primary, 'btn-primary');
            assert.containsOnce(primary, 'i.fa-heart');
            assert.strictEqual(primary.querySelector('span').innerText.trim(), "OUI",
                "Primary button should match with its given text");
            assert.strictEqual(primary.name, "oui",
                "Primary button name should match with its given name");
            assert.hasClass(secondary, 'btn-secondary');
            assert.strictEqual(secondary.querySelector('span').innerText.trim(), "NON",
                "Secondary button should match with its given text");
            assert.strictEqual(secondary.style.color, 'red',
                "Secondary button appearance should match its assigned style");
            await testUtils.dom.click(primary);
            await testUtils.dom.click(secondary); // Shouldn't trigger anything (disabled)

            // Dialog class (default: '')
            await changeProps('dialogClass', 'my_dialog_class');
            assert.hasClass(dialog.querySelector('.modal-body'), 'my_dialog_class');

            // Full screen (default: false)
            assert.doesNotHaveClass(dialog.querySelector('.modal'), 'o_modal_full');
            await changeProps('fullscreen', true);
            assert.hasClass(dialog.querySelector('.modal'), 'o_modal_full');

            // Size class (default: 'large')
            await changeProps('sizeClass', 'extra-large');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog modal-xl',
                "Modal should have taken the class modal-xl");
            await changeProps('sizeClass', 'medium');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog',
                "Modal should not have any additionnal class with 'medium'");
            await changeProps('sizeClass', 'small');
            assert.strictEqual(dialog.querySelector('.modal-dialog').className, 'modal-dialog modal-sm',
                "Modal should have taken the class modal-sm");

            // Subtitle (default: '')
            await changeProps('subtitle', "The Subtitle");
            assert.strictEqual(dialog.querySelector('span.o_subtitle').innerText.trim(), "The Subtitle",
                "Subtitle should match with its given text");

            // Technical (default: true)
            assert.hasClass(dialog.querySelector('.modal'), 'o_technical_modal');
            await changeProps('technical', false);
            assert.doesNotHaveClass(dialog.querySelector('.modal'), 'o_technical_modal');

            // Title (default: 'Odoo')
            assert.strictEqual(dialog.querySelector('h4.modal-title').innerText.trim(), "Odoo" + "The Subtitle",
                "Title should match with its default text");
            await changeProps('title', "The Title");
            assert.strictEqual(dialog.querySelector('h4.modal-title').innerText.trim(), "The Title" + "The Subtitle",
                "Title should match with its given text");

            // Render footer (default: true)
            await changeProps('renderFooter', false);
            assert.containsNone(dialog, '.modal-footer');

            // Render header (default: true)
            await changeProps('renderHeader', false);
            assert.containsNone(dialog, '.header');

            // Reactivity of subcomponents
            await changeProps('textContent', "wassup");
            assert.strictEqual(dialog.querySelector('.o_subcomponent').innerText.trim(), "wassup",
                "Subcomponent should match with its given text");
            await testUtils.dom.click(dialog.querySelector('.o_subcomponent'));

            assert.verifySteps(['dialog_closed', 'dialog_closed', 'dialog_button_clicked', 'subcomponent_clicked']);

            parent.destroy();
        });

        QUnit.test("Interactions between multiple dialogs", async function (assert) {
            assert.expect(13);

            const textContent = `<div>${new Array(15).fill().map(() => 'a').join('<br/>')}</div>`;

            class Parent extends Component {
                constructor() {
                    super(...arguments);
                    this.dialogIds = useState([]);
                }
                // Handlers
                _onDialogButtonClicked(id) {
                    assert.step(`dialog_${id}_button_clicked`);
                }
                _onDialogClosed(id) {
                    assert.step(`dialog_${id}_closed`);
                    this.dialogIds.splice(this.dialogIds.findIndex(d => d === id), 1);
                }
            }
            Parent.components = { Dialog };
            Parent.env = makeTestEnvironment({ _t: str => str });
            Parent.template = xml`
                <div>
                    <t t-foreach="dialogIds" t-as="dialogId" t-key="dialogId">
                        <Dialog target="'body'"
                            t-on-dialog_button_clicked="_onDialogButtonClicked(dialogId)"
                            t-on-dialog_closed="_onDialogClosed(dialogId)"
                            >
                            ${textContent}
                        </Dialog>
                    </t>
                </div>`;

            const parent = new Parent();
            await parent.mount(testUtils.prepareTarget());

            const lastModal = () => {
                const modals = document.querySelectorAll('.modal');
                return modals[modals.length - 1];
            }

            // Instanciates 2 owl dialogs, 2 legacy dialogs and 2 other owl dialogs
            parent.dialogIds.push(1);
            await testUtils.nextTick();
            new LegacyDialog(null, { $content: textContent }).open();
            new LegacyDialog(null, { $content: textContent }).open();
            await testUtils.nextTick();
            parent.dialogIds.push(2, 3);
            await testUtils.nextTick();

            assert.containsN(document.body, '.modal', 5);
            assert.containsOnce(document.body, '.modal.active');

            // Reactivity with owl dialogs
            await testUtils.dom.triggerEvent(lastModal(), 'keydown', EscapeKey); // Press Escape
            assert.containsN(document.body, '.modal', 4);
            assert.containsNone(document.body, '.modal.active');

            await testUtils.dom.click(lastModal().querySelector('.close')); // Click on 'close' (X) button
            assert.containsN(document.body, '.modal', 3);
            assert.containsNone(document.body, '.modal.active');

            // Reactivity with legacy dialogs
            await testUtils.dom.triggerEvent(lastModal(), 'keydown', EscapeKey);
            assert.containsN(document.body, '.modal', 2);
            assert.containsNone(document.body, '.modal.active');

            await testUtils.dom.click(lastModal().querySelector('.close'));
            assert.containsOnce(document.body, '.o_dialog .modal.active');

            parent.unmount();

            assert.containsNone(document.body, '.modal');
            // dialog 1 is closed through the removal of its parent => no callback
            assert.verifySteps(['dialog_3_closed', 'dialog_2_closed']);

            parent.destroy();
        });

        // TODO: simplify (or remove) when t-portal is implemented
        QUnit.test("Dialog DOM movement", async function (assert) {
            assert.expect(8);
            class Parent extends Component {
                constructor() {
                    super(...arguments);
                    this.state = useState({
                        first: false,
                        second: false,
                    });
                }
            }
            Parent.components = { Dialog };
            Parent.env = makeTestEnvironment({ _t: str => str });
            Parent.template = xml`
                <div>
                    <Dialog target="'body'" t-if="state.first"/>
                    <Dialog target="'body'" t-if="state.second"/>
                </div>`;

            const parent = new Parent();
            await parent.mount(testUtils.prepareTarget());

            async function changeState(key, value) {
                parent.state[key] = value;
                await testUtils.nextTick();
            }

            assert.containsNone(document.body, '.modal',
                "There should be no modal at first");

            await changeState('first', true);

            assert.hasClass(document.body, 'modal-open',
                "Body should be aware that a modal is open");
            assert.ok([...document.body.children].find(child => child.classList.contains('o_dialog')),
                "Modal should be a direct child of the document body");

            await changeState('second', true);

            assert.containsN(document.body, '.modal', 2,
                "There should be two modals");

            await changeState('first', false);

            assert.containsOnce(document.body, '.modal',
                "There should be one modal remaining");
            assert.hasClass(document.body, 'modal-open',
                "Body should still be aware that a modal is open");
            assert.strictEqual(document.activeElement, document.querySelector('.o_dialog .btn-primary'),
                "Primary button of the second modal should be the focused element");

            parent.unmount();

            assert.containsNone(document.body, '.modal',
                "There should be no modal left");

            parent.destroy();
        });
    });
});
