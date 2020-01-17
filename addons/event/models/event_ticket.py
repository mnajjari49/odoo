# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class EventTemplateTicket(models.Model):
    _name = 'event.type.ticket'
    _description = 'Event Template Ticket'

    # description
    name = fields.Char(
        string='Name', default=_('Registration'),
        required=True, translate=True)
    event_type_id = fields.Many2one(
        'event.type', string='Event Category', ondelete='cascade', required=True)
    # sale
    start_sale_date = fields.Date(string="Sales Start")
    end_sale_date = fields.Date(string="Sales End")
    is_expired = fields.Boolean(string='Is Expired', compute='_compute_is_expired')
    sale_available = fields.Boolean(string='Is Available', compute='_compute_sale_available')
    # seats
    seats_availability = fields.Selection([
        ('limited', 'Limited'), ('unlimited', 'Unlimited')], string='Available Seat',
        readonly=True, store=True, compute='_compute_seats_availability')
    seats_max = fields.Integer(
        string='Maximum Available Seats',
        help="Define the number of available tickets. If you have too much registrations you will "
             "not be able to sell tickets anymore. Set 0 to ignore this rule set as unlimited.")

    @api.depends('end_sale_date')
    def _compute_is_expired(self):
        for ticket in self:
            if ticket.end_sale_date:
                current_date = fields.Date.context_today(ticket.with_context(tz=ticket._get_ticket_tz()))
                ticket.is_expired = ticket.end_sale_date < current_date
            else:
                ticket.is_expired = False

    @api.depends('start_sale_date', 'end_sale_date')
    def _compute_sale_available(self):
        for ticket in self:
            current_date = fields.Date.context_today(ticket.with_context(tz=ticket._get_ticket_tz()))
            if (ticket.start_sale_date and ticket.start_sale_date > current_date) or \
                    ticket.end_sale_date and ticket.end_sale_date < current_date:
                ticket.sale_available = False
            else:
                ticket.sale_available = True

    @api.depends('seats_max')
    def _compute_seats_availability(self):
        """ Determine reserved, available, reserved but unconfirmed and used seats. """
        # initialize fields to 0 + compute seats availability
        for ticket in self:
            ticket.seats_availability = 'limited' if ticket.seats_max else 'unlimited'

    @api.constrains('start_sale_date', 'end_sale_date')
    def _constrains_dates_coherency(self):
        for ticket in self:
            if ticket.start_sale_date and ticket.end_sale_date and ticket.start_sale_date > ticket.end_sale_date:
                raise UserError(_('The stop date cannot be earlier than the start date.'))

    def _get_ticket_tz(self):
        return self.event_type_id.use_timezone and self.event_type_id.default_timezone or self.env.user.tz