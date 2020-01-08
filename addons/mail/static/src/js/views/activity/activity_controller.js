odoo.define('mail.ActivityController', function (require) {
"use strict";

require('mail.Activity');
const BasicController = require('web.BasicController');
const core = require('web.core');
const field_registry = require('web.field_registry');
const ViewDialogs = require('web.view_dialogs');

const KanbanActivityDate = field_registry.get('kanban_activity_date');
const _t = core._t;

const ActivityController = BasicController.extend({
    custom_events: _.extend({}, BasicController.prototype.custom_events, {
        empty_cell_clicked: '_onEmptyCell',
        send_mail_template: '_onSendMailTemplate',
        schedule_activity: '_onScheduleActivity',
    }),

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Overridden to remove the pager as it makes no sense in this view.
     *
     * @override
     */
    renderPager: function () {
        return Promise.resolve();
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onEmptyCell: function (ev) {
        const state = this.model.get(this.handle);
        this.do_action({
            type: 'ir.actions.act_window',
            res_model: 'mail.activity',
            view_mode: 'form',
            view_type: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_res_id: ev.data.resId,
                default_res_model: state.model,
                default_activity_type_id: ev.data.activityTypeId,
            },
            res_id: false,
        }, {
            on_close: this.reload.bind(this),
        });
    },
    /**
     * @private
     */
    _onScheduleActivity: function () {
        const self = this;
        const state = this.model.get(this.handle);
        new ViewDialogs.SelectCreateDialog(this, {
            res_model: state.model,
            domain: this.model.originalDomain,
            title: _.str.sprintf(_t("Search: %s"), this.renderer.props.arch.attrs.string),
            no_create: !this.activeActions.create,
            disable_multiple_selection: true,
            context: state.context,
            on_selected: function (record) {
                const fakeRecord = state.getKanbanActivityData({}, record[0]);
                const widget = new KanbanActivityDate(self, 'activity_ids', fakeRecord, {});
                widget.scheduleActivity();
            },
        }).open();
    },
    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onSendMailTemplate: function (ev) {
        const templateID = ev.data.templateID;
        const activityTypeID = ev.data.activityTypeID;
        const state = this.model.get(this.handle);
        const groupedActivities = state.grouped_activities;
        const resIDS = [];
        Object.keys(groupedActivities).forEach(function (resID) {
            const activityByType = groupedActivities[resID];
            const activity = activityByType[activityTypeID];
            if (activity) {
                resIDS.push(parseInt(resID));
            }
        });
        this._rpc({
            model: this.model.modelName,
            method: 'activity_send_mail',
            args: [resIDS, templateID],
        });
    },
});

return ActivityController;

});
