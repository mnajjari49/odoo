odoo.define('web.datepicker_owl', function (require) {
    "use strict";

    const field_utils = require('web.field_utils');
    const time = require('web.time');
    const { useExternalListener } = require('web.custom_hooks');

    const { Component, hooks } = owl;
    const { useRef, useState } = hooks;

    let datePickerId = 0;

    class DatePicker extends Component {
        constructor() {
            super(...arguments);
            // tempusdominus doesn't offer any elegant way to check whether the
            // datepicker is open or not, so we have to listen to hide/show events
            // and manually keep track of the 'open' state
            this.__isOpen = false;
            this.__libInput = 0;
            this.datepickerID = `o_datepicker_${datePickerId ++}`;
            this.inputRef = useRef('input');

            this.state = useState({
                value: null,
                warning: false,
            });

            useExternalListener(window, 'scroll', this._onScroll);
        }

        mounted() {
            $(this.el).on('show.datetimepicker', this._onDateTimePickerShow.bind(this));
            $(this.el).on('hide.datetimepicker', this._onDateTimePickerHide.bind(this));
            $(this.el).on('error.datetimepicker', this._onDateTimePickerError.bind(this));

            this._datetimepicker(this.props);

            if ('value' in this.props || 'defaultValue' in this.props) {
                this.value = this.props.value || moment(...this.props.defaultValue);
                this.trigger('datetime-changed', this.value);
            }
        }

        patched() {
            this._datetimepicker(this.props);
        }

        async willUnmount() {
            this._datetimepicker('destroy');
        }

        //--------------------------------------------------------------------------
        // Properties
        //--------------------------------------------------------------------------

        /**
         * @returns {(Moment|boolean)}
         */
        get value() {
            return this.state.value && this.state.value.clone();
        }

        /**
         * @param {(Moment|boolean)} value
         */
        set value(value) {
            this.state.value = value;
            this.formattedDate = value ? this._formatClient(value) : null;
            this._datetimepicker('date', value);
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * set datetime value
         */
        changeDatetime() {
            const currentDate = moment().format('YYYY-MM-DD');
            if (this.__libInput > 0) {
                this.state.warning = this.props.warn_future &&
                    this.value &&
                    this.value.format('YYYY-MM-DD') > currentDate;
                return this.trigger('datetime-changed', this.value);
            }
            const oldValue = this.value;
            if (this.isValid()) {
                this._setValueFromUi();
                const newValue = this.value;
                let hasChanged = Boolean(oldValue) !== Boolean(newValue);
                if (oldValue && newValue) {
                    const formattedOldValue = oldValue.format(time.getLangDatetimeFormat());
                    const formattedNewValue = newValue.format(time.getLangDatetimeFormat());
                    if (formattedNewValue !== formattedOldValue) {
                        hasChanged = true;
                    }
                }
                if (hasChanged) {
                    this.state.warning = this.props.warn_future &&
                        newValue &&
                        newValue.format('YYYY-MM-DD') > currentDate;
                    this.trigger('datetime-changed', this.value);
                }
            } else {
                const formattedValue = oldValue ? this._formatClient(oldValue) : null;
                this.inputRef.el.value = formattedValue;
            }
        }

        /**
         * Library clears the wrong date format so just ignore error
         */
        _onDateTimePickerError() {
            return false;
        }

        /**
         * Focuses the datepicker input. This function must be called in order to
         * prevent 'input' events triggered by the lib to bubble up, and to cause
         * unwanted effects (like triggering 'field_changed' events)
         */
        focus() {
            this.__libInput ++;
            this.inputRef.el.focus();
            this.__libInput --;
        }

        /**
         * @returns {boolean}
         */
        isValid() {
            const value = this.inputRef.el.value;
            if (value === "") {
                return true;
            } else {
                try {
                    this._parseClient(value);
                    return true;
                } catch (err) {
                    return false;
                }
            }
        }

        /**
         * @returns {Moment|false} value
         */
        maxDate(date) {
            this._datetimepicker('maxDate', date || null);
        }

        /**
         * @returns {Moment|false} value
         */
        minDate(date) {
            this._datetimepicker('minDate', date || null);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Handles bootstrap datetimepicker calls.
         * @param {any} arguments anything that will be passed to the datetimepicker function.
         */
        _datetimepicker() {
            this.__libInput++;
            $(this.el).datetimepicker(...arguments);
            this.__libInput--;
        }

        /**
         * @private
         * @param {Moment} v
         * @returns {string}
         */
        _formatClient(v) {
            return field_utils.format[this.props.type_of_date](v, null, { timezone: false });
        }

        /**
         * @private
         * @param {string|false} v
         * @returns {Moment}
         */
        _parseClient(v) {
            return field_utils.parse[this.props.type_of_date](v, null, { timezone: false });
        }

        /**
         * set the value from the input value
         *
         * @private
         */
        _setValueFromUi() {
            const value = this.inputRef.el.value || false;
            this.value = this._parseClient(value);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Reacts to the datetimepicker being hidden
         * Used to unbind the scroll event from the datetimepicker
         *
         * @private
         */
        _onDateTimePickerHide() {
            this.__isOpen = false;
            this.changeDatetime();
        }

        /**
         * Reacts to the datetimepicker being shown
         * Could set/verify our widget value
         * And subsequently update the datetimepicker
         *
         * @private
         */
        _onDateTimePickerShow() {
            this.__isOpen = true;
            if (this.inputRef.el.value.length !== 0 && this.isValid()) {
                this.inputRef.el.select();
            }
        }

        /**
         * @private
         * @param {KeyEvent} ev
         */
        _onKeydown(ev) {
            if (ev.key === 'Escape') {
                if (this.__isOpen) {
                    // we don't want any other effects than closing the datepicker,
                    // like leaving the edition of a row in editable list view
                    ev.stopImmediatePropagation();
                    this._datetimepicker('hide');
                    this.focus();
                }
            }
        }

        /**
         * Prevents 'input' events triggered by the library to bubble up, as they
         * might have unwanted effects (like triggering 'field_changed' events in
         * the context of field widgets)
         *
         * @private
         * @param {Event} ev
         */
        _onInput(ev) {
            if (this.__libInput > 0) {
                ev.stopImmediatePropagation();
            }
        }

        /**
         * @private
         */
        _onInputClicked() {
            this._datetimepicker('toggle');
            this.focus();
        }

        _onScroll() {
            if (ev.target !== this.inputRef.el) {
                this._datetimepicker('hide');
            }
        }
    }

    DatePicker.defaultProps = {
        buttons: {
            showClear: false,
            showClose: false,
            showToday: false,
        },
        calendarWeeks: true,
        defaultValue: [],
        format: time.getLangDateFormat(),
        icons: {
            clear: 'fa fa-delete',
            close: 'fa fa-check primary',
            date: 'fa fa-calendar',
            down: 'fa fa-chevron-down',
            next: 'fa fa-chevron-right',
            previous: 'fa fa-chevron-left',
            time: 'fa fa-clock-o',
            today: 'fa fa-calendar-check-o',
            up: 'fa fa-chevron-up',
        },
        keyBinds: null,
        locale: moment.locale(),
        maxDate: moment({ y: 9999, M: 11, d: 31 }),
        minDate: moment({ y: 1900 }),
        type_of_date: 'date',
        useCurrent: false,
        widgetParent: 'body',
    };

    class DateTimePicker extends DatePicker { }

    DateTimePicker.defaultProps = Object.assign({}, DatePicker.defaultProps, {
        buttons: {
            showClear: false,
            showClose: true,
            showToday: false,
        },
        format: time.getLangDatetimeFormat(),
        type_of_date: 'datetime',
    });

    return {
        DatePicker,
        DateTimePicker,
    };
});
