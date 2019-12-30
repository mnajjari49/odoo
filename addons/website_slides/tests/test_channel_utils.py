# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.website_slides.tests.common import SlidesCase
from odoo.tests.common import users


class TestSlidesManagement(SlidesCase):

    @users('user_publisher')
    def test_get_categorized_slides(self):
        new_category = self.env['slide.slide'].create({
            'name': 'Cooking Tips for Cooking Humans',
            'channel_id': self.channel.id,
            'is_category': True,
            'sequence': 5,
        })
        order = self.env['slide.slide']._order_by_strategy['sequence']
        categorized_slides = self.channel._get_categorized_slides([], order)
        self.assertEquals(categorized_slides[0]['category'], False)
        self.assertEquals(categorized_slides[1]['category'], self.category)
        self.assertEquals(categorized_slides[1]['total_slides'], 2)
        self.assertEquals(categorized_slides[2]['total_slides'], 0)
        self.assertEquals(categorized_slides[2]['category'], new_category)
