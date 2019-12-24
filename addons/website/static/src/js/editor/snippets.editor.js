odoo.define('website.snippet.editor', function (require) {
'use strict';

const weSnippetEditor = require('web_editor.snippet.editor');

weSnippetEditor.Class.include({
    events: _.extend({}, weSnippetEditor.Class.prototype.events, {
        'click .o_we_customize_theme_btn': '_onThemeTabClick',
    }),
    tabs: _.extend({}, weSnippetEditor.Class.prototype.tabs, {
        THEME: 'theme',
    }),

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _updateLeftPanelContent: function ({content, tab}) {
        this._super(...arguments);
        this.$('.o_we_customize_theme_btn').toggleClass('active', tab === this.tabs.THEME);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onThemeTabClick: async function (ev) {
        const $theme = $('<theme data-name="">').appendTo(document.body);
        const themeCustomizationMenuEl = document.createElement('div');
        await this._activateSnippet($theme);
        for (const node of this.customizePanel.childNodes) {
            themeCustomizationMenuEl.appendChild(node);
        }
        $theme.remove();
        await this._activateSnippet(false);

        this._updateLeftPanelContent({
            content: themeCustomizationMenuEl,
            tab: this.tabs.THEME,
        });
    },
});
});
