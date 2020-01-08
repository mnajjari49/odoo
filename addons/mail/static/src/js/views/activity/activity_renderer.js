odoo.define('mail.ActivityRenderer', function (require) {
"use strict";

const AbstractRendererOwl = require('web.AbstractRendererOwl');
require('mail.Activity');
const ActivityRecord = require('mail.ActivityRecord');
const { ComponentAdapter } = require('web.OwlCompatibility');
const config = require('web.config');
const core = require('web.core');
const field_registry = require('web.field_registry');
const KanbanColumnProgressBar = require('web.KanbanColumnProgressBar');
const QWeb = require('web.QWeb');
const session = require('web.session');
const utils = require('web.utils');

const KanbanActivityDate = field_registry.get('kanban_activity_date');
const _t = core._t;

const { useState } = owl.hooks;

/**
 * Owl Component Adapter for ActivityRecord which is KanbanRecord (Odoo Widget)
 * TODO: Remove this adapter when ActivityRecord is a Component
 */
class ActivityRecordAdapter extends ComponentAdapter {
    get widgetArgs() {
        return [this.props.state, this.props.options];
    }
    render() {}
    update() {}
}

/**
 * Owl Component Adapter for KanbanActivityDate which is BasicActivity (AbstractField)
 * TODO: Remove this adapter when KanbanActivityDate is a Component
 */
class KanbanActivityDateAdapter extends ComponentAdapter {
    get widgetArgs() {
        return [this.props.name, this.props.record];
    }
    render() {}
    update() {}
}

/**
 * Owl Component Adapter for KanbanColumnProgressBar (Odoo Widget)
 * TODO: Remove this adapter when KanbanColumnProgressBar is a Component
 */
class KanbanColumnProgressBarAdapter extends ComponentAdapter {
    get widgetArgs() {
        return [this.props.options, this.props.columnState];
    }
    render() {}

    update(nextProps) {
        const columnId = nextProps.options.columnID;
        const nextActiveFilter = nextProps.options.progressBarStates[columnId].activeFilter;
        this.widget.activeFilter = nextActiveFilter ? this.widget.activeFilter : false;
        this.widget.columnState = nextProps.columnState;
        this.widget.resetCounters();
    }

    _trigger_up(ev) {
        if (this.el) {
            super._trigger_up(ev);
        }
    }
}

class ActivityRenderer extends AbstractRendererOwl {
	constructor(parent, props) {
        super(...arguments);
        this.qweb = new QWeb(config.isDebug(), {_s: session.origin});
        this.qweb.add_template(utils.json_node_to_xml(props.templates));
        this.activeFilter = useState({
            state: null,
            activityTypeId: null,
            resIds: []
        });
        this.widgetComponents = {
            ActivityRecord,
            KanbanActivityDate,
            KanbanColumnProgressBar,
        };
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get activityResIds() {
        const idsNotFiltered = this.props.activity_res_ids
            .filter(x => !this.activeFilter.resIds.includes(x));
        return this.activeFilter.resIds.concat(idsNotFiltered);
    }

	get activityTypeIds() {
        const activities = Object.values(this.props.grouped_activities);
        const activityIds = activities.flatMap(Object.keys);
        const uniqueIds = Array.from(new Set(activityIds));
        return uniqueIds.map(Number);
	}

    getProgressBarOptions(typeId) {
        return {
            columnID: typeId,
            progressBarStates: {
                [typeId]: {
                    activeFilter: this.activeFilter.activityTypeId === typeId
                }
            }
        };
    }

    getProgressBarColumnState(typeId) {
        const counts = { planned: 0, today: 0, overdue: 0 };
        for (let activities of Object.values(this.props.grouped_activities)) {
            if (typeId in activities) {
                counts[activities[typeId].state] += 1;
            }
        }
        return {
            count: Object.values(counts).reduce((x, y) => x + y),
            fields: {
                activity_state: {
                    type: 'selection',
                    selection: [
                        ['planned', _t('Planned')],
                        ['today', _t('Today')],
                        ['overdue', _t('Overdue')],
                    ],
                },
            },
            progressBarValues: {
                field: 'activity_state',
                colors: { planned: 'success', today: 'warning', overdue: 'danger' },
                counts: counts,
            },
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onEmptyCellClicked(ev) {
        this.trigger('empty_cell_clicked', {
            resId: parseInt(ev.currentTarget.dataset.resId, 10),
            activityTypeId: parseInt(ev.currentTarget.dataset.activityTypeId, 10),
        });
    }
    /**
     * @private
     */
    _onScheduleActivity() {
        this.trigger('schedule_activity');
    }
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onSendMailTemplateClicked(ev) {
        this.trigger('send_mail_template', {
            activityTypeID: parseInt(ev.currentTarget.dataset.activityTypeId, 10),
            templateID: parseInt(ev.currentTarget.dataset.templateId, 10),
        });
    }
    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onSetProgressBarState(ev) {
        if (ev.detail.values.activeFilter) {
            this.activeFilter.state = ev.detail.values.activeFilter;
            this.activeFilter.activityTypeId = ev.detail.columnID;
            this.activeFilter.resIds = Object.entries(this.props.grouped_activities)
                .filter(([, resIds]) => ev.detail.columnID in resIds &&
                    resIds[ev.detail.columnID].state === ev.detail.values.activeFilter)
                .map(([key]) => parseInt(key));
        } else {
            this.activeFilter.state = null;
            this.activeFilter.activityTypeId = null;
            this.activeFilter.resIds = [];
        }
    }
}

ActivityRenderer.components = {
    ActivityRecordAdapter,
    KanbanActivityDateAdapter,
    KanbanColumnProgressBarAdapter
};
ActivityRenderer.template = 'mail.ActivityRenderer';

return ActivityRenderer;

});
