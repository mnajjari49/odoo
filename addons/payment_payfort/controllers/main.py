# -*- coding: utf-8 -*-

import hashlib
import json
import logging
import pprint
import re
import werkzeug

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request

_logger = logging.getLogger(__name__)


class PayfortController(http.Controller):
    _return_url = "/payment/payfort/return/"

    @http.route(["/payment/payfort/return"], type="http", auth="public", csrf=False)
    def payfort_return(self, **post):
        _logger.info(
            "Beginning Payfort form_feedback with post data %s", pprint.pformat(post)
        )  # debug
        request.env["payment.transaction"].sudo().form_feedback(post, "payfort")
        return werkzeug.utils.redirect("/payment/process")

    @http.route(
        ["/payment/payfort/notify"],
        type="http",
        auth="public",
        methods=["POST"],
        csrf=False,
    )
    def payfort_notification(self, **post):
        """
        Handle notifications coming from Payfort servers.

        Notification can be direct (immediately upon payment) or indirect (status change
        for an existing payment that was i.e. pending and got through asynchronously).

        The data we receive is in the same format as the redirect page (json) and
        can be processed like a normal feedback.
        """
        _logger.info(
            "Beginning Payfort notification feedback with post data %s",
            pprint.pformat(post),
        )
        # if the notification is for an s2s tx, the worker processing it might not
        # be finished - in this case the transaction won't be visible from this
        # db cursor yet. Check for transaction presence and return a nice error
        # to payfort - they will retry 10 times every 10 sec
        try:
            request.env["payment.transaction"].sudo()._payfort_form_get_tx_from_data(
                post
            )
        except ValidationError:
            raise werkzeug.exceptions.NotFound()
        request.env["payment.transaction"].sudo().form_feedback(post, "payfort")
        return "OK"

    @http.route(
        "/payment/payfort/merchant_page_values",
        auth="public",
        type="json",
        methods=["POST"],
    )
    def payfort_merchant_page_values(self, acquirer_id, partner_id=None):
        """Return the information needed to do a POST to a Payfort Merchant Page."""
        acquirer = request.env["payment.acquirer"].sudo().browse(int(acquirer_id))
        # TODO?: security check on partner? not sure
        partner = request.env["res.partner"].sudo().browse(int(partner_id))
        if not partner.exists():
            raise werkzeug.exceptions.BadRequest(
                "Cannot generate a tokenization form without a partner"
            )
        if not acquirer.exists() or not acquirer.provider == "payfort":
            raise werkzeug.exceptions.BadRequest(
                "The provided acquirer does not use Payfort"
            )
        res = {
            "values": acquirer._payfort_generate_s2s_values(partner_id=partner.id),
            "url": acquirer.payfort_get_form_action_url(),  # seems weird, but it's the same url as for forms
        }
        return res

    @http.route(
        "/payment/payfort/merchant_page_return",
        auth="public",
        methods=["POST"],
        csrf=False,
    )
    def payfort_merchant_page_return(self, **post):
        """Handle returns from the Payfort Merchant Page process (tokenization).

        This url can be called twice in the same flow:
            1/ upon first returning from the tokenization process, in which case we create the token
                and validate it using a validation transaction (this step is *required* by Payfort,
                otherwise the token won't be saved)
            2/ if that previous step's tx triggered a 3DS verification, the return from the 3DS page will
                also land in this route; in that case, we should process the validation tx and mark the token
                as validated, as well as refund the validation tx since it could not be refunded automatically
                by the validation process (because of 3DS)
        In both cases, the rendered page will contain javascript code that will try to communicate to another
        window (or parent frame) to forward the result of the transaction to the initial payment page.

        If either of these operations returns a failed status, the token will not be made available to the customer;
        in the first step, it won't be saved at all; in the second, it will get archived immediately.
        """
        # TODO: split route in two, since return_urls can be different for tokenization & validation
        # order!
        _logger.debug(
            "received merchant page tokenization return values %s", pprint.pformat(post)
        )
        # annoyingly, tokenization use a 'service_command' param and transactions use a 'command' param -_-
        command = post.get("service_command") or post.get("command")
        Token = request.env["payment.token"]
        if command == "TOKENIZATION":
            merch_id, access_code, merch_ref = (
                post.get("merchant_identifier"),
                post.get("access_code"),
                post.get("merchant_reference"),
            )
            reference_pattern = r"^ODOO\-PARTNER\-[a-zA-Z]{10}\-(\d+)$"
            partner_ids = re.findall(reference_pattern, merch_ref)
            if not partner_ids:
                raise werkzeug.exceptions.BadRequest(
                    "Badly structured merchant_reference"
                )
            post["partner_id"] = int(
                partner_ids[0]
            )  # must be included in the dict for s2s_process
            acquirer = (
                request.env["payment.acquirer"]
                .sudo()
                .search(
                    [
                        ("payfort_merchant_identifier", "=", merch_id),
                        ("payfort_access_code", "=", access_code),
                    ],
                    limit=1,
                )
            )
            token = acquirer.s2s_process(post)
            # you might think the token is ready at this point, but you'd be wrong
            # this token can only be used to create a validation transaction using
            # a specific API, otherwise it's useless
            # we need to validate it
            if token:
                tx = token.with_context(payfort_validation=True).validate()
            else:
                # something went wrong, we received a failure response from the tokenization process
                # empty set, will display an error in frontend iframe and finish payment process
                tx = Token
        elif command == "PURCHASE":
            success = (
                request.env["payment.transaction"].sudo().form_feedback(post, "payfort")
            )  # boolean (and not tx as one might think)
            tx = (
                request.env["payment.transaction"]
                .sudo()
                ._payfort_form_get_tx_from_data(post)
            )
            if success:
                tx.s2s_do_refund()
                token = tx.payment_token_id
            else:
                # the validation transaction failed the 3ds process
                # -> no need for refund
                # -> token can't be used, it was either archive or unlink. I chose archive.
                tx.payment_token_id.action_archive()
                # empty set, will display an error in the frontend popup 3ds return
                token = Token
        else:
            raise werkzeug.exceptions.BadRequest(
                "POST data should contain a `command` or `service_command` param matching either TOKENIZATION or PURCHASE"
            )
        # the rendered page can exist in 2 different contexts: an iframe (tokenization) or
        # a popup window (3DS - it can't be in an iframe since the headers in Payfort prevent
        # it). In both cases, the rendered page will try to communicate with its parent using
        # JS custom events to notify the main payment page of the final tokenization result:
        # - success: the final page gets a token id and bubbles it up the stack of windows to the main payment page)
        # - failure: no token id, bubbles up to payment page to display failure message
        # to avoid a refresh & resubmit of POST-data, redirect to a landing page & hash
        # the needed info to avoid abuse since the landing controller is publid
        db_secret = (
            request.env["ir.config_parameter"].sudo().get_param("database.secret")
        )
        params = {
            "token_id": token.id or 0,
            "tx_id": tx.id or 0,
        }
        signature_params = params.copy()
        signature_params["secret"] = db_secret
        signature = hashlib.sha256(
            json.dumps(signature_params, sort_keys=True).encode()
        ).hexdigest()
        params["signature"] = signature
        url_params = werkzeug.urls.url_encode(params)
        return werkzeug.utils.redirect(
            "/payment/payfort/merchant_return?%s" % url_params
        )

    @http.route(
        "/payment/payfort/merchant_return",
        auth="public",
        methods=["GET"],
        csrf=False,
        website=True,
    )
    def payfort_merchant_return(self, token_id, tx_id, signature, **kargs):
        params_check = {
            "token_id": int(token_id),
            "tx_id": int(tx_id),
            "secret": request.env["ir.config_parameter"]
            .sudo()
            .get_param("database.secret"),
        }
        signature_check = hashlib.sha256(
            json.dumps(params_check, sort_keys=True).encode()
        ).hexdigest()
        if signature_check != signature:
            raise werkzeug.exceptions.BadRequest("signature mismatch")
        token = (
            int(token_id)
            and request.env["payment.token"].sudo().browse(int(token_id))
            or request.env["payment.token"]
        )
        tx = (
            int(tx_id)
            and request.env["payment.transaction"].sudo().browse(int(tx_id))
            or request.env["payment.transaction"]
        )
        return request.render(
            "payment_payfort.payfort_merchant_page_return",
            {"token": token, "validation_tx": tx},
        )
