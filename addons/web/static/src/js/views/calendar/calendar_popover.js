odoo.define('web.CalendarPopover', function (require) {
    "use strict";

    // TODO: MSH: Convert it to OWL component
    // TODO: MSH: Create generic class, like FieldAdapter extends AdapterComponent
    // where Component for fieldAdapter we will pass in props from where FieldAdapter is initialized
    // Component will be result of fieldRegistry.getAny([field.widget, field.type])
    // and FieldAdater will have widgetArgs method which will have [this.props.name, this.props.record, this.props.options]
    // where options will be self.displayFields[field.name] in our case
    // use mount instead of appendTo everywhere, code of start of CalendarPopover will moved to mounted method
    // not sure but we may need to move processFields in mounted method of CaledarPopover instead of willStart, like we have to do in calendar_renderer

    const { Component } = owl;

    const AdapterComponent = require('web.AdapterComponent');
    const fieldRegistry = require('web.field_registry');
    const ServicesMixin = require('web.ServicesMixin');
    const StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');

    class FieldWidgetAdapter extends AdapterComponent {
        constructor(parent, props) {
            props.Component = props.widget;
            super(...arguments);
        }

        get widgetArgs() {
            return [this.props.name, this.props.record, this.props.options];
        }

        patched() {
            this.widget._reset(this.props.record);
        }
    }

    class CalendarPopover extends Component {

        /**
         * @constructor
         * @param {Widget} parent
         * @param {Object} eventInfo
         */
        constructor(parent, eventInfo) {
            super(...arguments);
            StandaloneFieldManagerMixin.init.call(this);
            this.hideDate = eventInfo.hideDate;
            this.hideTime = eventInfo.hideTime;
            this.eventTime = eventInfo.eventTime;
            this.eventDate = eventInfo.eventDate;
            this.displayFields = eventInfo.displayFields;
            this.fields = eventInfo.fields;
            this.event = eventInfo.event;
            this.modelName = eventInfo.modelName;
        }
        /**
         * @override
         */
        willStart() {
            return Promise.all([super.willStart(...arguments), this._processFields()]);
        }
        /**
         * @override
         */
        mounted() {
            this.$fieldsList.forEach(($field) => {
                $field.appendTo(this.$('.o_cw_popover_fields_secondary'));
            });
            // return this._super(...arguments);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Generate fields to render into popover
         *
         * @private
         * @returns {Promise}
         */
        _processFields() {
            const self = this;
            const fieldsToGenerate = [];
            // _.each(this.displayFields, function (displayFieldInfo, fieldName) {
            // this.displayFields.forEach((displayFieldInfo, fieldName) => {
            for (const [fieldName, displayFieldInfo] of Object.entries(this.displayFields)) {
                const fieldInfo = this.fields[fieldName];
                const field = {
                    name: fieldName,
                    string: displayFieldInfo.attrs.string || fieldInfo.string,
                    value: this.event.record[fieldName],
                    type: fieldInfo.type,
                };
                if (field.type === 'selection') {
                    field.selection = fieldInfo.selection;
                }
                if (fieldInfo.relation) {
                    field.relation = fieldInfo.relation;
                }
                if (displayFieldInfo.attrs.widget) {
                    field.widget = displayFieldInfo.attrs.widget;
                } else if (['many2many', 'one2many'].includes(field.type)) {
                    field.widget = 'many2many_tags';
                }
                if (['many2many', 'one2many'].includes(field.type)) {
                    field.fields = [{
                        name: 'id',
                        type: 'integer',
                    }, {
                        name: 'display_name',
                        type: 'char',
                    }];
                }
                fieldsToGenerate.push(field);
            }

            this.$fieldsList = [];
            return this.model.makeRecord(this.modelName, fieldsToGenerate).then(function (recordID) {
                const defs = [];

                const record = self.model.get(recordID);
                // _.each(fieldsToGenerate, function (field) {
                fieldsToGenerate.forEach(field => {
                    const FieldClass = fieldRegistry.getAny([field.widget, field.type]);
                    // const fieldWidget = new FieldClass(self, field.name, record, self.displayFields[field.name]);
                    const fieldWidgetAdapter = new FieldWidgetAdapter(this, {
                        name: field.name,
                        record: record,
                        options: self.displayFields[field.name],
                        widget: FieldClass,
                    });
                    // TODO: MSH: register fieldWidgetAdapter.widget
                    // this._registerWidget(recordID, field.name, fieldWidget);

                    const $field = $('<li>', {class: 'list-group-item flex-shrink-0 d-flex flex-wrap'});
                    const $fieldLabel = $('<strong>', { class: 'mr-2', text: `${field.string} : `});
                    $fieldLabel.appendTo($field);
                    const $fieldContainer = $('<div>', {class: 'flex-grow-1'});
                    $fieldContainer.appendTo($field);

                    defs.push(fieldWidgetAdapter.mount($fieldContainer[0]).then(function () {
                        self.$fieldsList.push($field);
                    }));
                });
                return Promise.all(defs);
            });
        }

        // TODO: MSH: added mock of _trigger_up, we can create CalendarPopover using  AdapterComponent
        /**
         * Mocks _trigger_up to redirect Odoo legacy events to OWL events.
         *
         * @private
         * @param {OdooEvent} ev
         */
        _trigger_up(ev) {
            const evType = ev.name;
            const payload = ev.data;
            if (evType === 'call_service') {
                let args = payload.args || [];
                if (payload.service === 'ajax' && payload.method === 'rpc') {
                    // ajax service uses an extra 'target' argument for rpc
                    args = args.concat(ev.target);
                }
                const service = this.env.services[payload.service];
                const result = service[payload.method].apply(service, args);
                payload.callback(result);
            } else if (evType === 'get_session') {
                if (payload.callback) {
                    payload.callback(this.env.session);
                }
            } else if (evType === 'load_views') {
                const params = {
                    model: payload.modelName,
                    context: payload.context,
                    views_descr: payload.views,
                };
                this.env.dataManager
                    .load_views(params, payload.options || {})
                    .then(payload.on_success);
            } else if (evType === 'load_filters') {
                return this.env.dataManager
                    .load_filters(payload)
                    .then(payload.on_success);
            } else {
                this.trigger(evType.replace(/_/g, '-'), payload);
            }
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {jQueryEvent} ev
         */
        _onClickPopoverEdit(ev) {
            ev.preventDefault();
            this.trigger('edit_event', {
                id: this.event.id,
                title: this.event.record.display_name,
            });
        }
        /**
         * @private
         * @param {jQueryEvent} ev
         */
        _onClickPopoverDelete(ev) {
            ev.preventDefault();
            this.trigger('delete_event', {id: this.event.id});
        }
    }

    CalendarPopover.template = 'CalendarView.event.popover';
    _.defaults(CalendarPopover.prototype, StandaloneFieldManagerMixin);
    _.defaults(CalendarPopover.prototype, ServicesMixin);

    return CalendarPopover;

});
