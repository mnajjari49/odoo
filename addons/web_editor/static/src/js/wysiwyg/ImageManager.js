odoo.define('web_editor.ImageManager', function (require) {
'use strict';

const core = require('web.core');
const _t = core._t;

/**
 * Manages an image optimization (quality and resizing), and its favorite status.
 */
const ImageManager = core.Class.extend({
    /**
     * Constructor
     */
    init: function (img, rpc) {
        this.img = img;
        this.rpc = rpc;
        this.quality = 80;
        this.width = img.naturalWidth;
    },
    /**
     * Changes the image's favorite status.
     */
    favorite: function () {
        return this.rpc({
           route: '/web_editor/attachment/toggle_favorite',
           params: {
               ids: [parseInt(this.img.dataset.originalId)],
           }
       }).then(() => {
           this.isFavorite = !this.isFavorite;
           return this.isFavorite;
       });
    },
    /**
     * Changes the image's quality.
     */
    changeImageQuality: function (quality) {
        this.quality = quality;
        this.optimizeOnSave = 'true';
        this.updatePreview();
    },
    /**
     * Gets the attachment that corresponds the the image's src tag.
     */
    getAttachmentFromSrc: function () {
        this.originalSrc = this.img.attributes.src.value;
        this.optimizeOnSave = false;
        const url = this.originalSrc.split('?')[0];
        let request = Promise.resolve([]);
        if (url) {
            request = this.rpc({
                model: 'ir.attachment',
                method: 'search_read',
                args: [],
                kwargs: {
                    domain: [['image_src', 'like', url]],
                    fields: ['type', 'is_favorite', 'original_id', 'quality', 'name'],
                },
            }).then((attachments) => {
                if (attachments.length) {
                    this.initialAttachment = attachments[0];
                }
                return attachments;
            });
        }
        return request.then(attachments => this.updateAttachment(attachments));
    },
    /**
     * Gets the attachment that corresponds the the image original-id data attribute.
     */
    getAttachmentFromOriginalId: function () {
        let request = Promise.resolve([]);
        if (this.img.dataset.originalId) {
            request = this.rpc({
                model: 'ir.attachment',
                method: 'read',
                args: [parseInt(this.img.dataset.originalId)],
                kwargs: {
                    fields: ['type', 'is_favorite', 'original_id', 'quality', 'name'],
                },
            });
        }
        this.optimizeOnSave = true;
        return request.then(attachments => this.updateAttachment(attachments));
    },
    /**
     * Updates the internal state to that of the attachment, if it's not an original,
     * queries the database for the original to get its favorite status and id.
     */
    updateAttachment: function (attachments) {
        $(this.img).one('load', () => {
            this.width = this.img.naturalWidth;
        });
        if (attachments.length) {
            this.attachment = attachments[0];
            this.img.dataset.originalId = this.attachment.original_id[0] || this.attachment.id;
            this.originalId = this.img.dataset.originalId;
            this.width = this.computeOptimizedWidth();
            this.quality = 80;
            this.updatePreview();

            let originalPromise = [];
            if (this.attachment.original_id) {
                originalPromise = this.rpc({
                    model: 'ir.attachment',
                    method: 'read',
                    args: [parseInt(this.img.dataset.originalId)],
                    kwargs: {
                        fields: ['is_favorite'],
                    },
                });
            }
            return Promise.resolve(originalPromise).then((records) => {
                const original = records[0] || this.attachment;
                this.isFavorite = original.is_favorite;
                const $img = $('<img>', {src: `/web/image/${original.id}`});
                return new Promise(resolve => $img.one('load', ev => resolve($img[0])));
            }).then(originalImg => {
                this.originalWidth = originalImg.naturalWidth;
            });
        } else {
            delete this.attachment;
            delete this.img.dataset.originalId;
        }
        return Promise.resolve();
    },
    /**
     * Returns a string representing the image's weight in kilobytes.
     */
    getImageWeight: function () {
        return window.fetch(this.img.src, {method: 'HEAD'}).then(resp => `${(resp.headers.get('Content-Length') / 1024).toFixed(2)}kb`);
    },
    /**
     * Changes the image's width.
     */
    changeImageWidth: function (width) {
        this.width = width;
        this.optimizeOnSave = true;
        this.updatePreview();
    },
    /**
     * Updates the image preview.
     */
    updatePreview: function () {
        this.img.src = `/web/image/${this.img.dataset.originalId}/?width=${this.width}&quality=${this.quality}`;
    },
    /**
     * Computes the image's maximum display width.
     */
    computeOptimizedWidth: function () {
        const displayWidth = this.img.clientWidth;
        const $img = $(this.img);
        // If the image is in a column, it might get bigger on smaller screens.
        // We use col-lg for this in most (all?) snippets.
        if ($img.closest('[class*="col-lg"]').length) {
            // A container's maximum inner width is 690px on the md breakpoint
            if ($img.closest('.container').length) {
                return Math.min(1920, Math.max(displayWidth, 690));
            }
            // A container-fluid's max inner width is 962px on the md breakpoint
            return Math.min(1920, Math.max(displayWidth, 962));
        }
        // If it's not in a col-lg, it's *probably* not going to change size depending on breakpoints
        return displayWidth;
    },
    /**
     * Returns an object containing the available widths for the image, where
     * the keys are the widths themselves, and values are an array of labels.
     */
    computeAvailableWidths: function () {
        const widths = [
            [128, _t("icon")],
            [256, _t("small")],
            [512, _t("medium")],
            [1024, _t("large")],
            [1920, _t("background")],
            [this.computeOptimizedWidth(), _t("recommended")],
            [this.originalWidth, _t("original")],
            [this.width, _t("current")]
        ];
        this.availableWidths = widths.sort((a, b) => a[0] - b[0]).reduce((acc, v) => {
            acc[v[0]] = (acc[v[0]] || []).concat([v[1]]);
            return acc;
        }, {});
        return this.availableWidths;
    },
    /**
     * Saves an optimized copy of the original image, sets the <img/> element's
     * src to the public url of the copy and removes its data attributes.
     */
    cleanForSave: function (rpc) {
        if (this.isClean) {
            return Promise.resolve();
        }
        this.isClean = true;
        console.log('cleanForSave', this);
        const proms = [];
        if (this.initialAttachment && this.initialAttachment.original_id) {
            proms.push(this.rpc({
                model: 'ir.attachment',
                method: 'unlink',
                args: [this.attachmentToRemove],
            }));
            delete this.attachmentToRemove;
        }
        if (this.optimizeOnSave) {
            proms.push(this.rpc({
                route: `/web_editor/attachment/${this.img.dataset.originalId}/update`,
                params: {
                    copy: true,
                    quality: this.quality,
                    width: this.width,
                },
            }).then((optimizedImage) => {
                this.img.src = optimizedImage.image_src;
                delete this.optimizeOnSave;
                delete this.img.dataset.originalId;
            }));
        } else {
            this.img.src = this.originalSrc;
        }
        return Promise.all(proms);
    },
});

return ImageManager;
});
