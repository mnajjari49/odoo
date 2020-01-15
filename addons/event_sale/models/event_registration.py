# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.tools import float_is_zero


class EventRegistration(models.Model):
    _inherit = 'event.registration'

    event_ticket_id = fields.Many2one('event.event.ticket', string='Event Ticket', tracking=True)
    # in addition to origin generic fields, add real relational fields to correctly
    # handle attendees linked to sales orders and their lines
    # TDE FIXME: maybe add an onchange on sale_order_id + origin
    sale_order_id = fields.Many2one('sale.order', string='Source Sales Order', ondelete='cascade')
    sale_order_line_id = fields.Many2one('sale.order.line', string='Sales Order Line', ondelete='cascade')
    campaign_id = fields.Many2one('utm.campaign', 'Campaign', related="sale_order_id.campaign_id", store=True)
    source_id = fields.Many2one('utm.source', 'Source', related="sale_order_id.source_id", store=True)
    medium_id = fields.Many2one('utm.medium', 'Medium', related="sale_order_id.medium_id", store=True)

    @api.onchange('event_id')
    def _onchange_event_id(self):
        # We reset the ticket when keeping it would lead to an inconstitent state.
        if self.event_ticket_id and (not self.event_id or self.event_id != self.event_ticket_id.event_id):
            self.event_ticket_id = None

    @api.constrains('event_ticket_id', 'state')
    def _check_ticket_seats_limit(self):
        for record in self:
            if record.event_ticket_id.seats_max and record.event_ticket_id.seats_available < 0:
                raise ValidationError(_('No more available seats for this ticket'))

    def _check_auto_confirmation(self):
        res = super(EventRegistration, self)._check_auto_confirmation()
        if res:
            orders = self.env['sale.order'].search([('state', '=', 'draft'), ('id', 'in', self.mapped('sale_order_id').ids)], limit=1)
            if orders:
                res = False
        return res

    def action_view_sale_order(self):
        return {
            "type": "ir.actions.act_window",
            "res_model": "sale.order",
            "view_mode": "form",
            "res_id": self.sale_order_id.id,
        }

    @api.model
    def create(self, vals):
        res = super(EventRegistration, self).create(vals)
        if res.origin or res.sale_order_id:
            res.message_post_with_view('mail.message_origin_link',
                values={'self': res, 'origin': res.sale_order_id},
                subtype_id=self.env.ref('mail.mt_note').id)
        return res

    def write(self, values):
        if 'event_ticket_id' in values:
            new_ticket_id = self.env['event.event.ticket'].browse(values['event_ticket_id'])
            if self.event_ticket_id != new_ticket_id:
                self._sale_order_ticket_type_change_notify(self, new_ticket_id)

        result = super(EventRegistration, self).write(values)
        return result

    def _sale_order_ticket_type_change_notify(self, event_registration, new_ticket_id):
        render_context = {
            'registration': event_registration,
            'old_ticket': event_registration.event_ticket_id.name,
            'new_ticket': new_ticket_id.name
        }
        event_registration.sale_order_id.activity_schedule_with_view('mail.mail_activity_data_warning',
             user_id=event_registration.event_id.user_id.id or self.env.ref("base.user_root").id,
             views_or_xmlid='event_sale.exception_event_ticket_id_changed',
             render_context=render_context)

    @api.model
    def _prepare_attendee_values(self, registration):
        """ Override to add sale related stuff """
        line_id = registration.get('sale_order_line_id')
        if line_id:
            registration.setdefault('partner_id', line_id.order_id.partner_id)
        att_data = super(EventRegistration, self)._prepare_attendee_values(registration)
        if line_id and line_id.event_ticket_id.sale_available:
            att_data.update({
                'event_id': line_id.event_id.id,
                'event_ticket_id': line_id.event_ticket_id.id,
                'origin': line_id.order_id.name,
                'sale_order_id': line_id.order_id.id,
                'sale_order_line_id': line_id.id,
            })
        return att_data

    def registration_summary(self):
        res = super(EventRegistration, self).registration_summary()
        information = res.setdefault('information', {})
        information.append((_('Ticket'), self.event_ticket_id.name or _('None')))
        order = self.sale_order_id.sudo()
        order_line = self.sale_order_line_id.sudo()
        if not order or float_is_zero(order_line.price_total, precision_digits=order.currency_id.rounding):
            payment_status = _('Free')
        elif not order.invoice_ids or any(invoice.state != 'paid' for invoice in order.invoice_ids):
            payment_status = _('To pay')
            res['alert'] = _('The registration must be paid')
        else:
            payment_status = _('Paid')
        information.append((_('Payment'), payment_status))
        return res
