odoo.define('web_editor.ImageManager', function (require) {
'use strict';

var core = require('web.core');

const ImageManager = core.Class.extend({
    init: function (img) {
        this.img = img;
        this.quality = 80;
        this.width = img.naturalWidth;
    },
    cleanForSave: function (rpc) {
        if (this.img.dataset.optimizeOnSave === 'true' && this.quality !== this.originalQuality) {
            return rpc({
                route: `/web_editor/attachment/${this.img.dataset.originalId}/update`,
                params: {
                    copy: true,
                    quality: this.quality,
                    width: this.width,
                },
            }).then((optimizedImage) => {
                this.img.src = optimizedImage.image_src;
                delete this.img.dataset.optimizeOnSave;
                delete this.img.dataset.originalId;
            });
        }
        return Promise.resolve();
    },
    favorite: function (rpc) {
        return rpc({
           route: '/web_editor/attachment/toggle_favorite',
           params: {
               ids: [parseInt(this.img.dataset.originalId)],
           }
       }).then(() => {
           this.isFavorite = !this.isFavorite;
           return this.isFavorite;
       });
    },
    changeImageQuality: function (quality) {
        this.quality = quality;
        this.img.dataset.optimizeOnSave = 'true';
        this.img.src = `/web/image/${this.img.dataset.originalId}/?width=${this.width}&quality=${quality}`;
    },
    getAttachmentFromSrc: function (rpc) {
        const url = this.img.attributes.src.value.split('?')[0];
        let request = Promise.resolve([]);
        if (url) {
            request = rpc({
                model: 'ir.attachment',
                method: 'search_read',
                args: [],
                kwargs: {
                    domain: [['image_src', 'like', url]],
                    fields: ['type', 'is_favorite', 'original_id', 'quality', 'name'],
                },
            });
        }
        return request.then(attachments => this.updateAttachment(attachments, rpc));
    },
    getAttachmentFromOriginalId: function (rpc) {
        return rpc({
            model: 'ir.attachment',
            method: 'read',
            args: [parseInt(this.img.dataset.originalId)],
            kwargs: {
                fields: ['type', 'is_favorite', 'original_id', 'quality', 'name'],
            },
        }).then(attachments => this.updateAttachment(attachments, rpc));
    },
    updateAttachment: function (attachments, rpc) {
        $(this.img).one('load', () => {
            this.width = this.img.naturalWidth;
        });
        if (attachments.length) {
            this.attachment = attachments[0];
            this.img.dataset.originalId = this.attachment.original_id[0] || this.attachment.id;
            this.originalId = this.img.dataset.originalId;

            let originalPromise = [];
            if (this.attachment.original_id) {
                originalPromise = rpc({
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
    getImageWeight: function () {
        return window.fetch(this.img.src, {method: 'HEAD'}).then(resp => `${(resp.headers.get('Content-Length') / 1024).toFixed(2)}kb`);
    },
    changeImageWidth: function (width) {
        this.width = width;
        this.changeImageQuality(this.quality);
    },
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
    computeAvailableWidths: function () {
        const widths = [
            [128, "icon"],
            [256, "small"],
            [512, "medium"],
            [1024, "large"],
            [1920, "background"],
            [this.computeOptimizedWidth(), "recommended"],
            [this.originalWidth, "original"],
            [this.width, "current"]
        ];
        this.availableWidths = widths.sort((a, b) => a[0] - b[0]).reduce((acc, v) => {
            acc[v[0]] = (acc[v[0]] || []).concat([v[1]]);
            return acc;
        }, {});
        return this.availableWidths;
    },
});

return ImageManager;
});
