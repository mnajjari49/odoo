odoo.define('web.ControlPanelX2Many', function (require) {

    const ControlPanel = require('web.ControlPanel');

    class ControlPanelX2Many extends ControlPanel {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * No store here.
         * @override
         */
        _connectToStore() {
            this.dispatch = () => { };
            this.getters = {};
            this.query = {};
        }
    }

    ControlPanelX2Many.defaultProps = {};
    ControlPanelX2Many.props = {
        buttons: Function,
        pager: Object,
    };
    ControlPanelX2Many.template = 'ControlPanelX2Many';

    return ControlPanelX2Many;
});
