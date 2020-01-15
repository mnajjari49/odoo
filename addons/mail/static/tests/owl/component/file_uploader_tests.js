odoo.define('mail.component.FileUploaderTests', function (require) {
"use strict";

const FileUploader = require('mail.component.FileUploader');
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.messagingTestUtils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('FileUploader', {
    beforeEach() {
        utilsBeforeEach(this);
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
             let { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
            FileUploader.env = this.env;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.attachmentBox) {
            this.attachmentBox.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        delete FileUploader.env;
        this.env = undefined;
    }
});

QUnit.test('file uploader uniqid', async function (assert) {
    assert.expect(1);

    await this.start({debug:true});
    const fileUploader1 = new FileUploader(null, { attachmentLocalIds: [] });
    const fileUploader2 = new FileUploader(null, { attachmentLocalIds: [] });

    assert.notEqual(
        fileUploader1._fileUploadId,
        fileUploader2._fileUploadId,
        "File uploader instances should not have same file upload id"
    )
});

});
});
});
