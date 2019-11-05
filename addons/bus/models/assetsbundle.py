# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo.addons.base.models.assetsbundle import AssetsBundle
from odoo import models

_logger = logging.getLogger(__name__)


class BusAssetsBundle(AssetsBundle):
    TRACKED_BUNDLES = ['web.assets_common', 'web.assets_backend']

    def save_attachment(self, type, content):
        """
        Each time an attachment is saved
        Send a bus notification
        An attachment is saved when its hash has changed

        @override
        """
        saved = super().save_attachment(type, content)

        if self.env and self.name in self.TRACKED_BUNDLES:
            channel = (self.env.registry.db_name, 'bundle_changed')
            message = (self.name, self.version)
            self.env['bus.bus'].sendone(channel, message)
            _logger.debug('Asset Changed:  xml_id: %s -- version: %s' % message)

        return saved

    def to_node(self, css=True, js=True, debug=False, async_load=False, defer_load=False, lazy_load=False):
        """
        Mark bundle's dom nodes with identifiable data that contains XML id and version
        At most once per asset type (css or js) and per bundle (xmlid)
        Even in debug=assets

        @override
        """
        response = super().to_node(css, js, debug, async_load, defer_load, lazy_load)

        if self.name in self.TRACKED_BUNDLES:
            for node in response:
                if node[0] == 'script' or node[0] == 'link':
                    node[1]['data-asset-xmlid'] = self.name
                    node[1]['data-asset-version'] = self.version
                    break
        return response


class BusIrQWeb(models.AbstractModel):

    _inherit = 'ir.qweb'

    def get_asset_bundle(self, xmlid, files, env=None):
        """
        Redirect to be able to select the assetBundle type

        @override
        """
        return BusAssetsBundle(xmlid, files, env)
