odoo.define('website.theme', function (require) {
'use strict';

var core = require('web.core');
var Dialog = require('web.Dialog');
var Widget = require('web.Widget');
var weWidgets = require('wysiwyg.widgets');

var _t = core._t;

// var ThemeCustomizationMenu = Widget.extend({
//     xmlDependencies: ['/website/static/src/xml/website.editor.xml'],
//     events: {
//         'click .o_theme_customize_add_google_font': '_onAddGoogleFontClick',
//         'click .o_theme_customize_delete_google_font': '_onDeleteGoogleFontClick',
//     },
//     CUSTOM_BODY_IMAGE_XML_ID: 'option_custom_body_image',

//     /**
//      * @constructor
//      */
//     init: function (parent) {
//         this._super(...arguments);
//         this.fontVariables = [];
//     },
//     /**
//      * @override
//      */
//     start: function () {
//         this.nbFonts = parseInt(this.style.getPropertyValue('--number-of-fonts'));
//         var googleFontsProperty = this.style.getPropertyValue('--google-fonts').trim();
//         this.googleFonts = googleFontsProperty ? googleFontsProperty.split(/\s*,\s*/g) : [];
//     },

//     //--------------------------------------------------------------------------
//     // Private
//     //--------------------------------------------------------------------------

//     /**
//      * @private
//      */
//     _chooseBodyCustomImage: function () {
//         var self = this;
//         var def = new Promise(function (resolve, reject) {
//             var $image = $('<img/>');
//             var editor = new weWidgets.MediaDialog(self, {
//                 mediaWidth: 1920,
//                 onlyImages: true,
//                 firstFilters: ['background'],
//             }, $image[0]);

//             editor.on('save', self, function (media) { // TODO use scss customization instead (like for user colors)
//                 self._rpc({
//                     model: 'ir.model.data',
//                     method: 'get_object_reference',
//                     args: ['website', self.CUSTOM_BODY_IMAGE_XML_ID],
//                 }).then(function (data) {
//                     return self._rpc({
//                         model: 'ir.ui.view',
//                         method: 'save',
//                         args: [
//                             data[1],
//                             '#wrapwrap { background-image: url("' + media.src + '"); }',
//                             '//style',
//                         ],
//                     });
//                 }).then(resolve).guardedCatch(resolve);
//             });
//             editor.on('cancel', self, function () {
//                 resolve();
//             });

//             editor.open();
//         });

//         return def;
//     },
//     /**
//      * @private
//      * @param {Object} data - @see this._loadViews
//      */
//     _generateDialogHTML: function (data) {
//         // case 'FONTSELECTION':
//         //     var $options = $();
//         //     var variable = $item.data('variable');
//         //     self.fontVariables.push(variable);
//         //     _.times(self.nbFonts, function (font) {
//         //         $options = $options.add($('<opt/>', {
//         //             'data-widget': 'auto',
//         //             'data-variable': variable,
//         //             'data-value': font + 1,
//         //             'data-font': font + 1,
//         //         }));
//         //     });
//         //     $element = $(core.qweb.render('website.theme_customize_dropdown_option'));
//         //     var $selection = $element.find('.o_theme_customize_selection');
//         //     _processItems($options, $selection, true);

//         //     if (self.googleFonts.length) {
//         //         var $googleFontItems = $selection.children().slice(-self.googleFonts.length);
//         //         _.each($googleFontItems, function (el, index) {
//         //             $(el).append(core.qweb.render('website.theme_customize_delete_font', {
//         //                 'index': index,
//         //             }));
//         //         });
//         //     }
//         //     $selection.append($(core.qweb.render('website.theme_customize_add_google_font_option', {
//         //         'variable': variable,
//         //     })));
//         //     break;

//         // case 'A':
//         //     $element = $item.clone();
//         //     $element.on('click', (ev) => {
//         //         ev.preventDefault();
//         //         Dialog.confirm(self, _t("Switching theme cannot be done directly from edit mode, click ok to save your current changes and go to the theme selection page."), {
//         //             confirm_callback: () => self.trigger_up('request_save', {
//         //                 reload: false,
//         //                 onSuccess: function () {
//         //                     window.location.href = ev.target.href;
//         //                 },
//         //             }),
//         //         });
//         //     });
//         //     break;
//     },
//     /**
//      * @private
//      * @param {object} [values]
//      *        When a new set of google fonts are saved, other variables
//      *        potentially have to be adapted.
//      */
//     _makeGoogleFontsCusto: function (values) {
//         values = values ? _.clone(values) : {};
//         if (this.googleFonts.length) {
//             values['google-fonts'] = "('" + this.googleFonts.join("', '") + "')";
//         } else {
//             values['google-fonts'] = 'null';
//         }
//         return this._makeSCSSCusto('/website/static/src/scss/options/user_values.scss', values).then(function () {
//             window.location.hash = 'theme=true';
//             window.location.reload();
//         });
//     },
//     /**
//      * @private
//      */
//     _processChange: function ($inputs) {
//         var self = this;
//         var defs = [];

//         // Handle body image changes
//         var $bodyImageInputs = $inputs.filter('[data-xmlid*="website.' + this.CUSTOM_BODY_IMAGE_XML_ID + '"]:checked');
//         defs = defs.concat(_.map($bodyImageInputs, function () {
//             return self._chooseBodyCustomImage();
//         }));

//         return Promise.all(defs);
//     },
//     /**
//      * Hides primary/secondary if they are equal to alpha/beta
//      * (this is the case with default values but not in some themes).
//      *
//      * @private
//      */
//     _removeDuplicateColors: function () {
//         var $primary = this.$el.find('.o_theme_customize_color[data-color="primary"]');
//         var $alpha = this.$el.find('.o_theme_customize_color[data-color="alpha"]');
//         var $secondary = this.$el.find('.o_theme_customize_color[data-color="secondary"]');
//         var $beta = this.$el.find('.o_theme_customize_color[data-color="beta"]');

//         var sameAlphaPrimary = $primary.css('background-color') === $alpha.css('background-color');
//         var sameBetaSecondary = $secondary.css('background-color') === $beta.css('background-color');

//         if (!sameAlphaPrimary) {
//             $alpha.prev().text(_t("Extra Color"));
//         }
//         if (!sameBetaSecondary) {
//             $beta.prev().text(_t("Extra Color"));
//         }

//         $primary = $primary.closest('.o_theme_customize_option');
//         $alpha = $alpha.closest('.o_theme_customize_option');
//         $secondary = $secondary.closest('.o_theme_customize_option');
//         $beta = $beta.closest('.o_theme_customize_option');

//         $primary.toggleClass('d-none', sameAlphaPrimary);
//         $secondary.toggleClass('d-none', sameBetaSecondary);

//         if (!sameAlphaPrimary && sameBetaSecondary) {
//             $beta.insertBefore($alpha);
//         } else if (sameAlphaPrimary && !sameBetaSecondary) {
//             $secondary.insertAfter($alpha);
//         }
//     },
//     /**
//      * @private
//      */
//     _updateValues: function () {
//         _.each(this.$('.o_theme_customize_dropdown'), function (dropdown) {
//             var $dropdown = $(dropdown);
//             $dropdown.find('.dropdown-item.active').removeClass('active');
//             var $checked = $dropdown.find('label.checked');
//             $checked.closest('.dropdown-item').addClass('active');

//             var classes = 'btn btn-light dropdown-toggle w-100 o_text_overflow o_theme_customize_dropdown_btn';
//             if ($checked.data('font-id')) {
//                 classes += _.str.sprintf(' o_theme_customize_option_font_%s', $checked.data('font-id'));
//             }
//             var $btn = $('<button/>', {
//                 type: 'button',
//                 class: classes,
//                 'data-toggle': 'dropdown',
//                 html: $dropdown.find('label.checked > span').text() || '&#8203;',
//             });
//             $dropdown.find('.o_theme_customize_dropdown_btn').remove();
//             $dropdown.prepend($btn);
//         });
//     },

//     //--------------------------------------------------------------------------
//     // Handlers
//     //--------------------------------------------------------------------------

//     /**
//      * @private
//      */
//     _onAddGoogleFontClick: function (ev) {
//         var self = this;
//         var variable = $(ev.currentTarget).data('variable');
//         new Dialog(this, {
//             title: _t("Add a Google Font"),
//             $content: $(core.qweb.render('website.dialog.addGoogleFont')),
//             buttons: [
//                 {
//                     text: _t("Save"),
//                     classes: 'btn-primary',
//                     click: function () {
//                         var $input = this.$('.o_input_google_font');
//                         var m = $input.val().match(/\bfamily=([\w+]+)/);
//                         if (!m) {
//                             $input.addClass('is-invalid');
//                             return;
//                         }
//                         var font = m[1].replace(/\+/g, ' ');
//                         self.googleFonts.push(font);
//                         var values = {};
//                         values[variable] = self.nbFonts + 1;
//                         return self._makeGoogleFontsCusto(values);
//                     },
//                 },
//                 {
//                     text: _t("Discard"),
//                     close: true,
//                 },
//             ],
//         }).open();
//     },
//     /**
//      * @private
//      * @param {Event} ev
//      */
//     _onDeleteGoogleFontClick: function (ev) {
//         var self = this;
//         ev.preventDefault();

//         var nbBaseFonts = this.nbFonts - this.googleFonts.length;

//         // Remove Google font
//         var googleFontIndex = $(ev.currentTarget).data('fontIndex');
//         this.googleFonts.splice(googleFontIndex, 1);

//         // Adapt font variable indexes to the removal
//         var values = {};
//         _.each(this.fontVariables, function (variable) {
//             var value = parseInt(self.style.getPropertyValue('--' + variable));
//             var googleFontValue = nbBaseFonts + 1 + googleFontIndex;
//             if (value === googleFontValue) {
//                 // If an element is using the google font being removed, reset
//                 // it to the first base font.
//                 values[variable] = 1;
//             } else if (value > googleFontValue) {
//                 // If an element is using a google font whose index is higher
//                 // than the one of the font being removed, that index must be
//                 // lowered by 1 so that the font is unchanged.
//                 values[variable] = value - 1;
//             }
//         });

//         return this._makeGoogleFontsCusto(values);
//     },
// });

// return ThemeCustomizationMenu;
});
