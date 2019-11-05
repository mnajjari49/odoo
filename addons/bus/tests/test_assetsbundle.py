# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from unittest.mock import patch

import odoo.tests
from odoo.osv import expression


@odoo.tests.tagged('post_install', '-at_install')
class BusWebTests(odoo.tests.HttpCase):

    def test_bundle_sends_bus(self):
        """
        Tests two things:
        - Messages are post to the bus when assets change (their hash has been recomputed and differ from the attachment's)
        - The interface deals with those bus messages by displaying one notification
        """
        # This is how many times longpolling is called before the manual re-enabling is reverted
        # A too low limit may make the test crash because the patch may have been reverted too early
        LONGPOLL_CALL_LIMIT = 5

        db_name = self.env.registry.db_name
        bundle_xml_ids = ('web.assets_common', 'web.assets_backend')

        domain = []
        for bundle in bundle_xml_ids:
            domain = expression.OR([
                domain,
                [('name', 'ilike', bundle + '%')]
            ])
        # start from a clean slate
        self.env['ir.attachment'].search(domain).unlink()
        self.env.registry._clear_cache()

        #
        # Patch Methods
        #

        availability_patch = None
        def stop_poll_availability_patch():
            try:
                availability_patch.stop()
            except RuntimeError:
                # If the patch is already stopped
                pass

        availability_calls = []
        def patched_poll_check_availability():
            """
            The bus is not available in test mode, so we manually re-enable it
            """
            if len(availability_calls) >= LONGPOLL_CALL_LIMIT - 1:
                stop_poll_availability_patch()
            else:
                availability_calls.append(True)

        sendones = []
        def patched_sendone(self, channel, message):
            """
            Control API and number of messages posted to the bus
            """
            sendones.append((channel, message))

        def patched_poll(*args, **kwargs):
            """
            Force send a controlled response when longpolling asks
            """
            return [{
                'id': 666,
                'channel': (db_name, 'bundle_changed'),
                'message': ('web.assets_backend', 'hash'),
            }]

        #
        # Enable Patches
        #

        availability_patch = patch('odoo.addons.bus.controllers.main.BusController._check_availability', wraps=patched_poll_check_availability)
        availability_patch.start()
        # Make sure we stop the patch
        self.addCleanup(stop_poll_availability_patch)

        self.patch(type(self.env['bus.bus']), 'sendone', patched_sendone)
        self.patch(type(self.env['bus.bus']), 'poll', patched_poll)

        #
        # Start test
        #

        self.start_tour('/web', "bundle_changed_notification", login='admin', timeout=180)

        #
        # Control test output
        #

        # One sendone for each asset bundle and for each CSS / JS
        self.assertEqual(len(sendones), 4)
        for sent in sendones:
            channel = sent[0]
            message = sent[1]
            self.assertEqual(channel, (db_name, 'bundle_changed'))
            self.assertEqual(len(message), 2)
            self.assertTrue(message[0] in bundle_xml_ids)
            self.assertTrue(isinstance(message[1], str))
