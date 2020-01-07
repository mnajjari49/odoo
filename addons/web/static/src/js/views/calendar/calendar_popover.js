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

    const fieldRegistry = require('web.field_registry');
    const StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
    const Widget = require('web.Widget');

    const CalendarPopover = Widget.extend(StandaloneFieldManagerMixin, {
        template: 'CalendarView.event.popover',
        events: {
            'click .o_cw_popover_edit': '_onClickPopoverEdit',
            'click .o_cw_popover_delete': '_onClickPopoverDelete',
        },
        /**
         * @constructor
         * @param {Widget} parent
         * @param {Object} eventInfo
         */
        init(parent, eventInfo) {
            this._super(...arguments);
            StandaloneFieldManagerMixin.init.call(this);
            this.hideDate = eventInfo.hideDate;
            this.hideTime = eventInfo.hideTime;
            this.eventTime = eventInfo.eventTime;
            this.eventDate = eventInfo.eventDate;
            this.displayFields = eventInfo.displayFields;
            this.fields = eventInfo.fields;
            this.event = eventInfo.event;
            this.modelName = eventInfo.modelName;
        },
        /**
         * @override
         */
        willStart() {
            return Promise.all([this._super(...arguments), this._processFields()]);
        },
        /**
         * @override
         */
        start() {
            this.$fieldsList.forEach(($field) => {
                $field.appendTo(this.$('.o_cw_popover_fields_secondary'));
            });
            return this._super(...arguments);
        },

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
            for (const [displayFieldInfo, fieldName] of Object.entries(this.displayFields)) {
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
                    const fieldWidget = new FieldClass(self, field.name, record, self.displayFields[field.name]);
                    this._registerWidget(recordID, field.name, fieldWidget);

                    const $field = $('<li>', {class: 'list-group-item flex-shrink-0 d-flex flex-wrap'});
                    const $fieldLabel = $('<strong>', { class: 'mr-2', text: `${field.string} : `});
                    $fieldLabel.appendTo($field);
                    const $fieldContainer = $('<div>', {class: 'flex-grow-1'});
                    $fieldContainer.appendTo($field);

                    defs.push(fieldWidget.appendTo($fieldContainer).then(function () {
                        self.$fieldsList.push($field);
                    }));
                });
                return Promise.all(defs);
            });
        },

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
        },
        /**
         * @private
         * @param {jQueryEvent} ev
         */
        _onClickPopoverDelete(ev) {
            ev.preventDefault();
            this.trigger('delete_event', {id: this.event.id});
        },
    });

    return CalendarPopover;

});
