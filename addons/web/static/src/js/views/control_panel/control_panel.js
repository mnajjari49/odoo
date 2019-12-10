odoo.define('web.ControlPanel', function (require) {
"use strict";

const Breadcrumbs = require('web.Breadcrumbs');
const Pager = require('web.Pager');
const SearchBar = require('web.SearchBar');
const Sidebar = require('web.Sidebar');
const SearchMenus = require('web.SearchMenus');
const ViewSwitcher = require('web.ViewSwitcher');

const { Component, hooks } = owl;
const { useState, useStore, useSubEnv } = hooks;

class ControlPanel extends Component {
    constructor() {
        super(...arguments);

        useSubEnv({
            controlPanelStore: this.props.controlPanelStore,
        });

        this.state = useState({
            submenus: false,
        });
        this.buttons = useStore(state => state.buttons, { store: this.env.controlPanelStore });
        this.sidebar = useStore(state => state.sidebar, { store: this.env.controlPanelStore });
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------


}

ControlPanel.components = { Breadcrumbs, Pager, SearchBar, Sidebar, SearchMenus, ViewSwitcher };
// ControlPanel.props = {};
ControlPanel.template = 'ControlPanel';

return ControlPanel;

});
