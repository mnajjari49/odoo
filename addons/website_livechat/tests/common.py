# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, tests


class TestLivechatCommon(tests.TransactionCase):
    def setUp(self):
        super(TestLivechatCommon, self).setUp()
        self.base_datetime = fields.Datetime.from_string("2019-11-11 21:30:00")

        self.operator = self.env['res.users'].create({
            'name': 'Michel',
            'login': 'michel',
            'email': 'michel@prout.com',
            'password': "ideboulonate",
            'livechat_username': 'El Deboulonnator',
        })

        self.livechat_channel = self.env['im_livechat.channel'].create({
            'name': 'The basic channel',
            'user_ids': [(6, 0, [self.operator.id])]
        })

        self.max_sessions_per_operator = 5
        visitor_vals = {
            'lang_id': self.env.ref('base.lang_en').id,
            'country_id': self.env.ref('base.be').id,
            'website_id': 1,
        }
        self.visitors = self.env['website.visitor'].create([{
            'lang_id': self.env.ref('base.lang_en').id,
            'country_id': self.env.ref('base.de').id,
            'website_id': 1,
            'partner_id': self.env.ref('base.user_demo').partner_id.id,
        }] + [visitor_vals]*self.max_sessions_per_operator)
        self.visitor_demo, self.visitor = self.visitors[0], self.visitors[1]

        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')

        self.open_chat_url = base_url + "/im_livechat/get_session"
        self.open_chat_params = {'params': {
            'channel_id': self.livechat_channel.id,
            'anonymous_name': "Wrong Name"
        }}

        self.send_feedback_url = base_url + "/im_livechat/feedback"
        self.leave_session_url = base_url + "/im_livechat/visitor_leave_session"

        # override the get_available_users to return only Michel as available
        operators = self.operator
        def get_available_users(self):
            return operators
        self.patch(type(self.env['im_livechat.channel']), '_get_available_users', get_available_users)

        # override the _get_visitor_from_request to return self.visitor
        self.target_visitor = self.visitor
        def get_visitor_from_request(self_mock, **kwargs):
            return self.target_visitor
        self.patch(type(self.env['website.visitor']), '_get_visitor_from_request', get_visitor_from_request)
