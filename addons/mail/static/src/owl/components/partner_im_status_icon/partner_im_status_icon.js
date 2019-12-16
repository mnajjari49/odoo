odoo.define('mail.component.PartnerImStatusIcon', function (require) {
'use strict';

const { useStoreCompareKeys } = require('mail.hooks.useStoreCompareKeys');

const { Component } = owl;

class PartnerImStatusIcon extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeProps = useStoreCompareKeys((state, props) => {
            return {
                partner: state.partners[props.partnerLocalId],
            };
        });
    }
}

PartnerImStatusIcon.template = 'mail.component.PartnerImStatusIcon';

return PartnerImStatusIcon;

});
