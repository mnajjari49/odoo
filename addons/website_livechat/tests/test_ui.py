# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import tests
from odoo.addons.website_livechat.tests.common import TestLivechatCommon


@tests.tagged('post_install', '-at_install')
class TestLivechatUI(tests.HttpCase, TestLivechatCommon):
    def setUp(self):
        super(TestLivechatUI, self).setUp()
        self.visitor_tour = self.env['website.visitor'].create({
            'name': 'Visitor Tour',
            'website_id': 1,
        })
        self.target_visitor = self.visitor_tour

    def test_complete_rating_flow_ui(self):
        self.start_tour("/", 'website_livechat_complete_flow_tour')
        self._check_end_of_rating_tours()

    def test_happy_rating_flow_ui(self):
        self.start_tour("/", 'website_livechat_happy_rating_tour')
        self._check_end_of_rating_tours()

    def test_ok_rating_flow_ui(self):
        self.start_tour("/", 'website_livechat_boarf_rating_tour')
        self._check_end_of_rating_tours()

    def test_bad_rating_flow_ui(self):
        self.start_tour("/", 'website_livechat_sad_rating_tour')
        self._check_end_of_rating_tours()

    def test_no_rating_flow_ui(self):
        self.start_tour("/", 'website_livechat_no_rating_tour')
        channel = self.env['mail.channel'].search([('livechat_visitor_id', '=', self.visitor_tour.id)])
        self.assertEqual(len(channel), 1, "There can only be one channel created for 'Visitor Tour'.")
        self.assertEqual(channel.livechat_active, False, 'Livechat must be inactive after closing the chat window.')

    def test_no_rating_no_close_flow_ui(self):
        self.start_tour("/", 'website_livechat_no_rating_no_close_tour')
        channel = self.env['mail.channel'].search([('livechat_visitor_id', '=', self.visitor_tour.id)])
        self.assertEqual(len(channel), 1, "There can only be one channel created for 'Visitor Tour'.")
        self.assertEqual(channel.livechat_active, True, 'Livechat must be active while the chat window is not closed.')

    def _check_end_of_rating_tours(self):
        channel = self.env['mail.channel'].search([('livechat_visitor_id', '=',  self.visitor_tour.id)])
        self.assertEqual(len(channel), 1, "There can only be one channel created for 'Visitor Tour'.")
        self.assertEqual(channel.livechat_active, False, 'Livechat must be inactive after rating.')
