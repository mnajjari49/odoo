# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime

from odoo import tests, _
from odoo.addons.website_livechat.tests.common import TestLivechatCommon


@tests.tagged('post_install', '-at_install')
class TestLivechatBasicFlowHttpCase(tests.HttpCase, TestLivechatCommon):
    def test_visitor_banner_history(self):
        # create visitor history
        self.env['website.track'].create([{
            'page_id': self.env.ref('website.homepage_page').id,
            'visitor_id': self.visitor.id,
            'visit_datetime': self.base_datetime,
        }, {
            'page_id': self.env.ref('website.contactus_page').id,
            'visitor_id': self.visitor.id,
            'visit_datetime': self.base_datetime - datetime.timedelta(minutes=10),
        }, {
            'page_id': self.env.ref('website.aboutus_page').id,
            'visitor_id': self.visitor.id,
            'visit_datetime': self.base_datetime - datetime.timedelta(minutes=20),
        }, {
            'page_id': self.env.ref('website.contactus_page').id,
            'visitor_id': self.visitor.id,
            'visit_datetime': self.base_datetime - datetime.timedelta(minutes=30),
        }])

        handmade_history = "%s (21:10) → %s (21:20) → %s (21:30)" % (
            self.env.ref('website.aboutus_page').name,
            self.env.ref('website.contactus_page').name,
            self.env.ref('website.homepage_page').name
        )
        history = self.env['mail.channel']._get_visitor_history(self.visitor)

        self.assertEqual(history, handmade_history)

    def test_livechat_username(self):
        # Open a new live chat
        res = self.opener.post(url=self.open_chat_url, json=self.open_chat_params)
        self.assertEqual(res.status_code, 200)
        channel_1 = self.env['mail.channel'].search([('livechat_visitor_id', '=', self.visitor.id), ('livechat_active', '=', True)], limit=1)

        # Check Channel naming
        self.assertEqual(channel_1.name, "%s, %s" % (self.visitor.display_name, self.operator.livechat_username), "Channel name is incorrect.")
        channel_1.unlink()

        # Remove livechat_username
        self.operator.livechat_username = False

        # Open a new live chat
        res = self.opener.post(url=self.open_chat_url, json=self.open_chat_params)
        self.assertEqual(res.status_code, 200)
        channel_2 = self.env['mail.channel'].search([('livechat_visitor_id', '=', self.visitor.id), ('livechat_active', '=', True)], limit=1)

        # Check Channel naming
        self.assertEqual(channel_2.name, "%s, %s" % (self.visitor.display_name, self.operator.name), "Channel name is incorrect.")

    def test_basic_flow_with_rating(self):
        channel = self._common_flow()

        # Send rating
        self.opener.post(url=self.send_feedback_url, json={'params': {
            'uuid': channel.uuid,
            'rate': 5,
            'reason': "This deboulonnage was fine but not top",
        }})
        res_model_id = self.env['ir.model'].sudo().search([('model', '=', channel._name)], limit=1).id
        rating = self.env['rating.rating'].search([('res_id', '=', channel.id), ('res_model_id', '=', res_model_id)])
        self.assertEqual(rating.rating, 5, "The rating is not correct.")

        self._send_message(channel, self.visitor.display_name, "Rating: :| \nThis deboulonnage was fine but not top", author_id=False)
        self.assertEqual(len(channel.message_ids), 3, "Number of messages incorrect.")

        channel.close_livechat_request_session()

        self.assertEqual(len(channel.message_ids), 4, "Number of messages incorrect.")
        self.assertEqual(channel.message_ids[0].author_id, self.env.ref('base.partner_root'), "Odoobot must be the sender of the 'has left the conversation' message.")
        self.assertEqual(channel.message_ids[0].body, "<p>%s has left the conversation.</p>" % self.visitor.display_name, "The 'has left message' is incorrect.")
        self.assertEqual(channel.livechat_active, False, "The livechat session must be inactive as the visitor sent his feedback.")

    def test_basic_flow_without_rating(self):
        channel = self._common_flow()

        # has left the conversation
        channel.close_livechat_request_session()
        self.assertEqual(len(channel.message_ids), 3, "Number of messages incorrect.")
        self.assertEqual(channel.message_ids[0].author_id, self.env.ref('base.partner_root'), "Odoobot must be the author the message.")
        self.assertEqual(channel.message_ids[0].body, "<p>%s has left the conversation.</p>" % (self.visitor.display_name))
        self.assertEqual(channel.livechat_active, False, "The livechat session must be inactive since visitor has left the conversation.")

    def _common_flow(self):
        # Open a new live chat
        res = self.opener.post(url=self.open_chat_url, json=self.open_chat_params)
        self.assertEqual(res.status_code, 200)

        channel = self.env['mail.channel'].search([('livechat_visitor_id', '=', self.visitor.id), ('livechat_active', '=', True)], limit=1)

        # Check Channel and Visitor naming
        self.assertEqual(self.visitor.display_name, "%s #%s" % (_("Website Visitor"), self.visitor.id), "Visitor name is incorrect.")
        self.assertEqual(channel.name, "%s, %s" % (self.visitor.display_name, self.operator.livechat_username), "Channel name is incorrect.")

        # Post Message from visitor
        self._send_message(channel, self.visitor.display_name, "Message from Visitor")

        self.assertEqual(len(channel.message_ids), 1, "Number of messages incorrect.")
        self.assertEqual(channel.message_ids[0].author_id.id, False, "The author of the messageis not a partner.")
        self.assertEqual(channel.message_ids[0].email_from, self.visitor.display_name, "The sender's email should be the visitor's email.")
        self.assertEqual(channel.message_ids[0].body, "<p>Message from Visitor</p>", "The message from visitor is incorrect.")
        self.assertEqual(channel.livechat_active, True, "The livechat session must be active as the visitor did not left the conversation yet.")

        # Post message from operator
        self._send_message(channel, self.operator.email, "Message from Operator", author_id=self.operator.partner_id.id)

        self.assertEqual(len(channel.message_ids), 2, "Number of messages incorrect.")
        self.assertEqual(channel.message_ids[0].author_id, self.operator.partner_id, "The author of the message should be the operator.")
        self.assertEqual(channel.message_ids[0].email_from, self.operator.email, "The sender's email should be the operator's email.")
        self.assertEqual(channel.message_ids[0].body, "<p>Message from Operator</p>", "The message from visitor is incorrect.")
        self.assertEqual(channel.livechat_active, True, "The livechat session must be active as the visitor did not left the conversation yet.")

        return channel

    def _send_message(self, channel, email_from, body, author_id=False):
        # As bus is unavailable in test mode, we cannot call /mail/chat_post route to post a message.
        # Instead, we post directly the message on the given channel.
        channel.with_context(mail_create_nosubscribe=True)\
            .message_post(author_id=author_id, email_from=email_from, body=body,
                          message_type='comment', subtype='mail.mt_comment')
