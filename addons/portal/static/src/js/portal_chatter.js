odoo.define('portal.chatter', function (require) {
'use strict';

var ajax = require('web.ajax');
var core = require('web.core');
var publicWidget = require('web.public.widget');
var time = require('web.time');

var qweb = core.qweb;
var _t = core._t;

/**
 * Widget PortalComposer
 *
 * Display the composer (according to access right)
 *
 */
var PortalComposer = publicWidget.Widget.extend({
    template: 'portal.Composer',
    xmlDependencies: ['/portal/static/src/xml/portal_chatter.xml'],
    events: {
        'change .o_portal_chatter_file_input': '_onFileInputChange',
        'click .o_portal_chatter_attachment_btn': '_onAttachmentButtonClick',
        'click .o_portal_chatter_attachment_delete': 'async _onAttachmentDeleteClick',
        'click .o_portal_chatter_composer_btn': '_onChatterSubmit'
    },
    /**
     * @constructor
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);
        this.options = _.defaults(options || {}, {
            'allow_composer': true,
            'display_composer': false,
            'csrf_token': odoo.csrf_token,
            'token': false,
            'res_model': false,
            'res_id': false,
        });
        this.attachments = [];
    },
    /**
     * @override
     */
    start: function () {
        this.$attachmentButton = this.$('.o_portal_chatter_attachment_btn');
        this.$fileInput = this.$('.o_portal_chatter_file_input');
        this.$sendButton = this.$('.o_portal_chatter_composer_btn');
        this.$attachments = this.$('.o_portal_chatter_composer_form .o_portal_chatter_attachments');
        this.$attachmentIds = this.$('.o_portal_chatter_attachment_ids');
        this.$attachmentTokens = this.$('.o_portal_chatter_attachment_tokens');

        return this._super.apply(this, arguments);



    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAttachmentButtonClick: function () {
        this.$fileInput.click();

    },

    _onChatterSubmit: function (ev) {
        ev.preventDefault();
        var self = this;
        var message = this.$el.find('textarea[name="message"]').val();
        var render = new PortalChatter(self,self.options);

        return this._rpc({
            route: '/mail/chatter_post',
            params: {
                'res_id': self.options.res_id,
                'res_model': self.options.res_model,
                'message': message,
                'attachment_ids': this.$attachmentIds.val(),
                'attachment_tokens': this.$attachmentTokens.val()
            },
        }).then(function () {
            render.reinitialize();
            render.messageFetch();
        });
    },
    /**
     * @private
     * @param {Event} ev
     * @returns {Promise}
     */
    _onAttachmentDeleteClick: function (ev) {
        var self = this;
        var attachmentId = $(ev.currentTarget).closest('.o_portal_chatter_attachment').data('id');
        var accessToken = _.find(this.attachments, {'id': attachmentId}).access_token;
        ev.preventDefault();
        ev.stopPropagation();

        this.$sendButton.prop('disabled', true);

        return this._rpc({
            route: '/portal/attachment/remove',
            params: {
                'attachment_id': attachmentId,
                'access_token': accessToken,
            },
        }).then(function () {
            self.attachments = _.reject(self.attachments, {'id': attachmentId});
            self._updateAttachments();
            self.$sendButton.prop('disabled', false);
        });

    },
    /**
     * @private
     * @returns {Promise}
     */
    _onFileInputChange: function () {
        var self = this;

        this.$sendButton.prop('disabled', true);

        return Promise.all(_.map(this.$fileInput[0].files, function (file) {
            return new Promise(function (resolve, reject) {
                var data = {
                    'name': file.name,
                    'file': file,
                    'res_id': self.options.res_id,
                    'res_model': self.options.res_model,
                    'access_token': self.options.token,
                };
                ajax.post('/portal/attachment/add', data).then(function (attachment) {
                    self.attachments.push(attachment);
                    self._updateAttachments();
                    resolve();
                }).guardedCatch(function (error) {
                    self.displayNotification({
                        title: _t("Something went wrong."),
                        message: _.str.sprintf(_t("The file <strong>%s</strong> could not be saved."),
                            _.escape(file.name)),
                        type: 'warning',
                        sticky: true,
                    });
                    resolve();
                });
            });
        })).then(function () {
            self.$sendButton.prop('disabled', false);
        });
    },
    /**
     * Returns a Promise that is never resolved to prevent sending the form
     * twice when clicking twice on the button, in combination with the `async`
     * in the event definition.
     *
     * @private
     * @returns {Promise}
     */

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _updateAttachments: function () {
        this.$attachmentIds.val(_.pluck(this.attachments, 'id'));
        this.$attachmentTokens.val(_.pluck(this.attachments, 'access_token'));
        this.$attachments.html(qweb.render('portal.Chatter.Attachments', {
            attachments: this.attachments,
            showDelete: true,
            isDownload: true,
        }));
    },
});



/**
 * Widget PortalChatter
 *
 * - Fetch message fron controller
 * - Display chatter: pager, total message, composer (according to access right)
 * - Provider API to filter displayed messages
 */
var PortalChatter = publicWidget.Widget.extend({
    template: 'portal.Chatter',
    xmlDependencies: ['/portal/static/src/xml/portal_chatter.xml'],
    events: {
        "click .o_portal_chatter_pager_btn": '_onClickPager',
    },

    /**
     * @constructor
     */
    init: function (parent, options) {
        var self = this;
        this.options = {};
        this._super.apply(this, arguments);

        // underscorize the camelcased option keys
        _.each(options, function (val, key) {
            self.options[_.str.underscored(key)] = val;
        });
        // set default options
        this.options = _.defaults(this.options, {
            'allow_composer': true,
            'display_composer': false,
            'csrf_token': odoo.csrf_token,
            'message_count': 0,
            'pager_step': 10,
            'pager_scope': 5,
            'pager_start': 1,
            'is_user_public': true,
            'is_user_publisher': false,
            'hash': false,
            'pid': false,
            'domain': [],
        });

        this.set('messages', []);
        this.set('message_count', this.options['message_count']);
        this.set('pager', {});
        this.set('domain', this.options['domain']);
        this._currentPage = this.options['pager_start'];
    },
    /**
     * @override
     */
    willStart: function () {
        return Promise.all([
            this._super.apply(this, arguments),
            this._chatterInit()
        ]);
    },
    /**
     * @override
     */
    start: function () {
        // bind events
        this.on("change:messages", this, this._renderMessages);
        this.on("change:message_count", this, function () {
            this._renderMessageCount();
            this.set('pager', this._pager(this._currentPage));
        });
        this.on("change:pager", this, this._renderPager);
        this.on("change:domain", this, this._onChangeDomain);
        // set options and parameters
        this.set('message_count', this.options['message_count']);
        this.set('messages', this.preprocessMessages(this.result['messages']));


        var defs = [];
        defs.push(this._super.apply(this, arguments));

        // instanciate and insert composer widget
        if (this.options['display_composer']) {
            this._composer = new PortalComposer(this, this.options);
            defs.push(this._composer.replace(this.$('.o_portal_chatter_composer')));
        }

        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Fetch the messages and the message count from the server for the
     * current page and current domain.
     *
     * @param {Array} domain
     * @returns {Promise}
     */
    messageFetch: function (domain) {
        var self = this;
        return this._rpc({
            route: '/mail/chatter_fetch',
            params: self._messageFetchPrepareParams(),
        }).then(function (result) {
            self.set('messages', self.preprocessMessages(result['messages']));
            self.set('message_count', result['message_count']);
        });
    },
    /**
     * Update the messages format
     *
     * @param {Array<Object>}
     * @returns {Array}
     */
    preprocessMessages: function (messages) {
        _.each(messages, function (m) {
            m['author_avatar_url'] = _.str.sprintf('/web/image/%s/%s/author_avatar/50x50', 'mail.message', m.id);
            m['published_date_str'] = _.str.sprintf(_t('Published on %s'), moment(time.str_to_datetime(m.date)).format('MMMM Do YYYY, h:mm:ss a'));
        });
        return messages;
    },

    reinitialize: function () {
        var self = this;
        this._chatterInit().then(function (result) {
            self._composer = new PortalComposer(self, self.options);
            self.renderElement();
            if (self.options['display_composer']) {
                self._composer.replace(self.$('.o_portal_chatter_composer'));
            }
        });
    },
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {Deferred}
     */
    _chatterInit: function () {
        var self = this;
        return this._rpc({
            route: '/mail/chatter_init',
            params: this._messageFetchPrepareParams()
        }).then(function (result) {
            self.result = result;
            self.options = _.extend(self.options, self.result['options'] || {});
            self.set('message_count', self.options['message_count']);
            self.set('messages', self.preprocessMessages(result['messages']));
            return result;
        });
    },
    /**
     * Change the current page by refreshing current domain
     *
     * @private
     * @param {Number} page
     * @param {Array} domain
     */
    _changeCurrentPage: function (page, domain) {
        this._currentPage = page;
        var d = domain ? domain : _.clone(this.get('domain'));
        this.set('domain', d); // trigger fetch message
    },
    _messageFetchPrepareParams: function () {
        var self = this;
        var data = {
            'res_model': this.options['res_model'],
            'res_id': this.options['res_id'],
            'limit': this.options['pager_step'],
            'offset': (this._currentPage - 1) * this.options['pager_step'],
            'allow_composer': this.options['allow_composer'],
        };
        // add token field to allow to post comment without being logged
        if (self.options['token']) {
            data['token'] = self.options['token'];
        }
        // add domain
        if (this.get('domain')) {
            data['domain'] = this.get('domain');
        }
        return data;
    },
    /**
     * Generate the pager data for the given page number
     *
     * @private
     * @param {Number} page
     * @returns {Object}
     */
    _pager: function (page) {
        page = page || 1;
        var total = this.get('message_count');
        var scope = this.options['pager_scope'];
        var step = this.options['pager_step'];

        // Compute Pager
        var pageCount = Math.ceil(parseFloat(total) / step);

        page = Math.max(1, Math.min(parseInt(page), pageCount));
        scope -= 1;

        var pmin = Math.max(page - parseInt(Math.floor(scope / 2)), 1);
        var pmax = Math.min(pmin + scope, pageCount);

        if (pmax - scope > 0) {
            pmin = pmax - scope;
        } else {
            pmin = 1;
        }

        var pages = [];
        _.each(_.range(pmin, pmax + 1), function (index) {
            pages.push(index);
        });

        return {
            "page_count": pageCount,
            "offset": (page - 1) * step,
            "page": page,
            "page_start": pmin,
            "page_previous": Math.max(pmin, page - 1),
            "page_next": Math.min(pmax, page + 1),
            "page_end": pmax,
            "pages": pages
        };
    },
    _renderMessages: function () {
        this.$('.o_portal_chatter_messages').html(qweb.render("portal.chatter_messages", {widget: this}));
    },
    _renderMessageCount: function () {
        this.$('.o_message_counter').replaceWith(qweb.render("portal.chatter_message_count", {widget: this}));
    },
    _renderPager: function () {
        this.$('.o_portal_chatter_pager').replaceWith(qweb.render("portal.pager", {widget: this}));
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onChangeDomain: function () {
        var self = this;
        this.messageFetch().then(function () {
            var p = self._currentPage;
            self.set('pager', self._pager(p));
        });
    },


    /**
     * @private
     * @param {MouseEvent} event
     */
    _onClickPager: function (ev) {
        ev.preventDefault();
        var page = $(ev.currentTarget).data('page');
        this._changeCurrentPage(page);
    },
});

publicWidget.registry.portalChatter = publicWidget.Widget.extend({
    selector: '.o_portal_chatter',

    /**
     * @override
     */
    start: function () {
        var self = this;
        var defs = [this._super.apply(this, arguments)];
        var chatter = new PortalChatter(this, this.$el.data());
        defs.push(chatter.appendTo(this.$el));
        return Promise.all(defs).then(function () {
            // scroll to the right place after chatter loaded
            if (window.location.hash === '#' + self.$el.attr('id')) {
                $('html, body').scrollTop(self.$el.offset().top);
            }
        });
    },
});

return {
    PortalComposer: PortalComposer,
    PortalChatter: PortalChatter,
};
});
