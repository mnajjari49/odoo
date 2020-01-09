# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResCompany(models.Model):
    _inherit = "res.company"

    def _get_social_media_links(self):
        self.ensure_one()
        website_id = self.env['website'].get_current_website()
        return {
            'social_facebook': website_id.social_facebook or self.social_facebook,
            'social_linkedin': website_id.social_linkedin or self.social_linkedin,
            'social_twitter': website_id.social_twitter or self.social_twitter,
            'social_instagram': website_id.social_instagram or self.social_instagram
        }
