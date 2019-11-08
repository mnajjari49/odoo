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
        this.callbacks = [];
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
        this.optimizeOnSave = true;
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
                    fields: ['type', 'is_favorite', 'original_id', 'quality', 'name', 'image_src'],
                },
            }).then((attachments) => {
                if (attachments.length) {
                    this.initialAttachment = attachments[0];
                }
                return attachments;
            });
        }
        this.width = this.img.naturalWidth;
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
                    fields: ['type', 'is_favorite', 'original_id', 'quality', 'name', 'image_src'],
                },
            });
        }
        this.optimizeOnSave = true;
        this.width = this.computeOptimizedWidth();
        return request.then(attachments => this.updateAttachment(attachments));
    },
    /**
     * Updates the internal state to that of the attachment, if it's not an original,
     * queries the database for the original to get its favorite status and id.
     */
    updateAttachment: function (attachments) {
        if (attachments.length) {
            this.attachment = attachments[0];
            this.img.dataset.originalId = this.attachment.original_id[0] || this.attachment.id;
            this.originalId = this.img.dataset.originalId;
            this.quality = this.attachment.quality || 80;
            this.updatePreview();

            let originalPromise = [];
            if (this.attachment.original_id) {
                originalPromise = this.rpc({
                    model: 'ir.attachment',
                    method: 'read',
                    args: [this.attachment.original_id[0]],
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
                const options = {
                    favorite: true,
                    quality: this.attachment.type === 'binary' ? this.quality : false,
                };
                this.callbacks.forEach(cb => cb(options));
                return options;
            });
        } else {
            delete this.attachment;
            delete this.img.dataset.originalId;
        }
        this.callbacks.forEach(cb => cb({
            favorite: false,
            quality: false,
        }));
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
        if (this.attachment && this.attachment.type === 'binary') {
            this.img.src = `/web/image/${this.img.dataset.originalId}/?width=${this.width}&quality=${this.quality}`;
        }
    },
    /**
     * Computes the image's maximum display width.
     */
    computeOptimizedWidth: function () {
        const displayWidth = this.img.clientWidth || this.img.naturalWidth;
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
            [128, []],
            [256, []],
            [512, []],
            [1024, []],
            [1920, []],
            [this.computeOptimizedWidth(), [_t("recommended")]],
            [this.originalWidth, [_t("original")]],
        ];
        this.availableWidths = widths.filter(w => w[0] <= this.originalWidth)
            .sort((a, b) => a[0] - b[0])
            .reduce((acc, v) => {
            acc[v[0]] = (acc[v[0]] || []).concat(v[1]);
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
        const proms = [];
        if (this.optimizeOnSave) {
            if (this.initialAttachment && this.initialAttachment.original_id) {
                console.log('unlinking attachment:', this.initialAttachment);
                proms.push(this.rpc({
                    model: 'ir.attachment',
                    method: 'unlink',
                    args: [this.initialAttachment.id],
                }));
                delete this.attachmentToRemove;
            }
            if (this.attachment && this.attachment.type === 'binary') {
                proms.push(this.rpc({
                    route: `/web_editor/attachment/${this.img.dataset.originalId}/update`,
                    params: {
                        copy: true,
                        quality: this.quality,
                        width: this.width,
                    },
                }).then((optimizedImage) => {
                    this.img.src = optimizedImage.image_src;
                    console.log('got optimized image:', optimizedImage);
                    delete this.img.dataset.originalId;
                }));
            } else {
                this.img.src = this.attachment.image_src;
            }
            delete this.optimizeOnSave;
        } else {
            this.img.src = this.originalSrc;
        }
        return Promise.all(proms);
    },
    onUpdateAttachment: function (callback) {
        this.callbacks.push(callback);
    },
});

return ImageManager;
});
