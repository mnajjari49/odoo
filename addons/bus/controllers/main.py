# -*- coding: utf-8 -*-

import io
import threading
import time
import werkzeug

from odoo import exceptions, _
from odoo.http import Controller, request, Response, route
from odoo.addons.bus.models.bus import dispatch


class StreamResponse(Response, werkzeug.wrappers.ResponseStreamMixin):
    pass


class BusController(Controller):
    """ Examples:
    openerp.jsonRpc('/longpolling/poll','call',{"channels":["c1"],last:0}).then(function(r){console.log(r)});
    openerp.jsonRpc('/longpolling/send','call',{"channel":"c1","message":"m1"});
    openerp.jsonRpc('/longpolling/send','call',{"channel":"c2","message":"m2"});
    """

    @route('/longpolling/send', type="json", auth="public")
    def send(self, channel, message):
        if not isinstance(channel, str):
            raise Exception("bus.Bus only string channels are allowed.")
        return request.env['bus.bus'].sendone(channel, message)

    # override to add channels
    def _poll(self, dbname, channels, last, options):
        # update the user presence
        if request.session.uid and 'bus_inactivity' in options:
            request.env['bus.presence'].update(options.get('bus_inactivity'))
        request.cr.close()
        request._cr = None
        return dispatch.poll(dbname, channels, last, options)

    @route('/longpolling/poll', type="json", auth="public", cors="*")
    def poll(self, channels, last, options=None):
        if options is None:
            options = {}
        if not dispatch:
            raise Exception("bus.Bus unavailable")
        if [c for c in channels if not isinstance(c, str)]:
            raise Exception("bus.Bus only string channels are allowed.")
        if request.registry.in_test_mode():
            raise exceptions.UserError(_("bus.Bus not available in test mode"))
        return self._poll(request.db, channels, last, options)

    @route('/longpolling/im_status', type="json", auth="user")
    def im_status(self, partner_ids):
        return request.env['res.partner'].search_read([['id', 'in', partner_ids]], ['id', 'im_status'])

    @route('/sse/stream', type="http", auth="public")
    def sse_stream(self):

        # stream = io.StringIO()

        # def run():
        #     i = 0
        #     while i < 10:
        #         message = "%d" % i
        #         print(message)
        #         stream.write("data: {}\n\n".format(message))
        #         i += 1
        #         time.sleep(1000)
        #     stream.close()

        # t = threading.Thread(name="sse.thread", target=run)
        # t.daemon = True
        # t.start()

        # def run(self):
        #     while True:
        #         try:
        #             self.loop()
        #         except Exception as e:
        #             _logger.exception("Bus.loop error, sleep and retry")
        #             time.sleep(TIMEOUT)

        # def start(self):
        #     if odoo.evented:
        #         # gevent mode
        #         import gevent
        #         self.Event = gevent.event.Event
        #         gevent.spawn(self.run)
        #     else:
        #         # threaded mode
        #         self.Event = threading.Event
        #         t = threading.Thread(name="%s.Bus" % __name__, target=self.run)
        #         t.daemon = True
        #         t.start()
        #     self.started = True
        #     return self(request.db, channels, last, options)

        def event_stream():
            i = 0
            while True:
                message = "%d" % i
                print(message)
                yield "data: {}\n\n".format(message)
                i+=1
                time.sleep(1)

        return Response(event_stream(), mimetype="text/event-stream")
