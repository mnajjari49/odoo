odoo.define('base_automation.CrashManager', function (require) {
  "use strict";
  var CrashManager = require('web.CrashManager');
  var ErrorDialog = CrashManager.ErrorDialog;
  ErrorDialog.include({
    xmlDependencies: (ErrorDialog.prototype.xmlDependencies || []).concat(
        ['/base_automation/static/src/xml/crash_manager.xml']
    ),
    events: {
        'click .o_disable_action_button': '_onDisableAction',
        'click .o_edit_action_button': '_onEditAction',
    },
    _onDisableAction: function (ev) {
        var self = this;
        ev.preventDefault();
        this._rpc({
            model: 'base.automation',
            method: 'write',
            args: [[this.options.base_automation_id], {
                active: false,
            }],
        }).then(function () {
            self.destroy();
        });
    },
    _onEditAction: function (ev) {
        ev.preventDefault();
        this.do_action({
            name: 'Automated Actions',
            res_model: 'base.automation',
            res_id: this.options.base_automation_id,
            views: [[false, 'form']],
            type: 'ir.actions.act_window',
            view_mode: 'form',
        });
    },
  });
});
