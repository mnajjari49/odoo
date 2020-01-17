odoo.define('web.ControlPanelWrapper', function (require) {
"use strict";

    const { ComponentWrapper } = require('web.OwlCompatibility');

    class ControlPanelWrapper extends ComponentWrapper {

        /**
         * @override
         */
        async update(newProps) {
            const additionnalContent = {};
            if ('buttons' in newProps) {
                additionnalContent.buttons = newProps.buttons;
                delete newProps.buttons;
            }
            if ('searchView' in newProps) {
                additionnalContent.searchView = newProps.searchView;
                delete newProps.searchView;
            }
            if ('searchViewButtons' in newProps) {
                additionnalContent.searchViewButtons = newProps.searchViewButtons;
                delete newProps.searchViewButtons;
            }
            await super.update(newProps);

            const controlPanel = Object.values(this.__owl__.children)[0];

            for (const key in additionnalContent) {
                const target = controlPanel.contentRefs[key].el;
                target.innerHTML = "";
                target.append(...additionnalContent[key]);
            }
        }
    }

    return ControlPanelWrapper;

});