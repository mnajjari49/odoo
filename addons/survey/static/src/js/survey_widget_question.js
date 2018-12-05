odoo.define('survey.page_and_question_backend', function (require) {
// The goal of this file is to contain JS hacks related to allowing
// page and question on survey.

"use strict";
var FieldOne2Many = require('web.relational_fields').FieldOne2Many;
var fieldRegistry = require('web.field_registry');
var ListRenderer = require('web.ListRenderer');

var QuestionListRenderer = ListRenderer.extend({
    /**
     * We want page to take the whole line (except handle and trash)
     * to look better and to hide the unnecessary fields.
     *
     * @override
     */
    _renderBodyCell: function (record, node, index, options) {
        var $cell = this._super.apply(this, arguments);

        if (record.data.line_type === 'page') {
            if (node.attrs.widget === "handle") {
                return $cell;
            } else if (node.attrs.name === "question") {
                var nbrColumns = this._getNumberOfCols();
                if (this.handleField) {
                    nbrColumns--;
                }
                if (this.addTrashIcon) {
                    nbrColumns--;
                }
                $cell.attr('colspan', nbrColumns);
            } else {
                return $cell.addClass('o_hidden');
            }
        }

        return $cell;
    },
    /**
     * We add the o_is_{display_type} class to allow custom behaviour both in JS and CSS.
     *
     * @override
     */
    _renderRow: function (record, index) {
        var $row = this._super.apply(this, arguments);

        if (record.data.line_type) {
            $row.addClass('o_is_' + record.data.line_type);
        }

        return $row;
    },
    /**
     * We want to add .o_question_list_view on the table to have stronger CSS.
     *
     * @override
     * @private
     */
    _renderView: function () {
        var def = this._super();
        this.$el.find('> table').addClass('o_question_list_view');
        return def;
    },
});

// We create a custom widget because this is the cleanest way to do it:
// to be sure this custom code will only impact selected fields having the widget
// and not applied to any other existing ListRenderer.
var QuestionFieldOne2Many = FieldOne2Many.extend({
    /**
     * We want to use our custom renderer for the list.
     *
     * @override
     */
    _getRenderer: function () {
        if (this.view.arch.tag === 'tree') {
            return QuestionListRenderer;
        }
        return this._super.apply(this, arguments);
    },
});

fieldRegistry.add('question_one2many', QuestionFieldOne2Many);

});
