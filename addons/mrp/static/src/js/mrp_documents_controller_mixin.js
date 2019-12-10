odoo.define('mrp.controllerMixin', function (require) {
'use strict';

const { _t, qweb } = require('web.core');
const fileUploadMixin = require('web.fileUploadMixin');
const DocumentViewer = require('mrp.MrpDocumentViewer');

const MrpDocumentsControllerMixin = Object.assign({}, fileUploadMixin, {
    events: {
        'click .o_mrp_documents_kanban_upload': '_onClickMrpDocumentsUpload',
    },
    custom_events: Object.assign({}, fileUploadMixin.custom_events, {
        kanban_image_clicked: '_onKanbanPreview',
        upload_file: '_onUploadFile',
    }),
    /**
        @override
     */
    init(parent, model, renderer, params) {
        fileUploadMixin.init.call(this);
    },
    /**
     * @override
     */
    _getFileUploadRoute() {
        return '/mrp/upload_attachment';
    },
    /**
     * Called right after the reload of the view.
     */
    async reload() {
        await this._renderFileUploads();
    },
    /**
     * @private
     */
    _onClickMrpDocumentsUpload() {
        const $uploadInput = $('<input>', {
            type: 'file',
            name: 'files[]',
            multiple: 'multiple'
        });
        $uploadInput.on('change', async ev => {
            await this._uploadFiles(ev.target.files);
            $uploadInput.remove();
        });
        $uploadInput.click();
    },
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @param {jQueryElement} $node
     */
    renderButtons($node) {
        this.$buttons = $(qweb.render('MrpDocumentsKanbanView.buttons'));
        this.$buttons.appendTo($node);
    },
    /**
     * @override
     * @param {integer} param0.recordId
     */
    _makeFileUploadFormDataKeys({ recordId }) {
        const context = this.model.get(this.handle, { raw: true }).getContext();
        return {
            res_id: context.default_res_id,
            res_model: context.default_res_model,
        };
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {OdooEvent} ev
     * @param {integer} ev.data.recordID
     * @param {Array<Object>} ev.data.recordList
     */
    _onKanbanPreview(ev) {
        ev.stopPropagation();
        const documents = ev.data.recordList;
        const documentID = ev.data.recordID;
        const documentViewer = new DocumentViewer(this, documents, documentID);
        documentViewer.appendTo(this.$('.o_mrp_documents_kanban_view'));
    },
    /**
     * specially created to call _processFiles method from tests
     * @private
     * @param {OdooEvent} ev
     */
    async _onUploadFile(ev) {
        await this._uploadFiles(ev.data.files);
    },
    /**
     * @override
     * @param {Object} param0
     * @param {XMLHttpRequest} param0.xhr
     */
    _onUploadLoad({ xhr }) {
        const result = xhr.status === 200
            ? JSON.parse(xhr.response)
            : {
                error: _.str.sprintf(_t("status code: %s </br> message: %s"), xhr.status, xhr.response)
            };
        if (result.error) {
            this.do_notify(_t("Error"), result.error, true);
        }
        fileUploadMixin._onUploadLoad.apply(this, arguments);
    },
});

return MrpDocumentsControllerMixin;

});
