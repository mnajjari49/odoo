odoo.define('account.ShowReseqenceRenderer', function (require) {
"use strict";

const { Component } = owl;
const { useState } = owl.hooks;
const OwlAbstractRenderer = require('web.AbstractRendererOwl');

class ChangeLine extends Component { }
ChangeLine.template = 'account.ResequenceChangeLine';
ChangeLine.props = ["changeLine", 'ordering'];


class ShowReseqenceRenderer extends OwlAbstractRenderer {
    constructor(...args) {
        super(...args);
        this.data = useState({
            changeLines: [],
            ordering: 'date',
        });
    }
    updateProps(props) {
        Object.assign(this.data, JSON.parse(props));
    }
}
ShowReseqenceRenderer.template = 'account.ResequenceRenderer';
ShowReseqenceRenderer.components = { ChangeLine }

require('web.field_registry_owl').add('account_resequence_widget', ShowReseqenceRenderer);
return ShowReseqenceRenderer;
});
