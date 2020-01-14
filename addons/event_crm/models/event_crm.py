# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools.safe_eval import safe_eval

class EventCrm(models.Model):
    _name = "event.crm"
    _description = "Event CRM"

    name = fields.Char('Rule Name', required=True)
    active = fields.Boolean('Active', default=True)
    create_lead = fields.Selection([
        ('one_per_attendee','One per Attendee')], default='one_per_attendee', required=True)
    event_type_ids = fields.Many2many('event.type',
        string='Event Categories',
        help='Only the categories selected will be impacted by this rule.')
    event_id = fields.Many2one('event.event',
        string='Event',
        help='The event selected will be impacted by this rule.')
    company_id = fields.Many2one('res.company',
        string='Company',
        help="Only event linked to this company will be impacted by this rule. "
            "If it is not set, there will be no restriction applied to the company.")

    registration_ids = fields.Many2many('event.registration', compute='_compute_attendee_ids')
    domain = fields.Text(default='[]', required=True)

    lead_type = fields.Selection([
        ('lead', 'Lead'), ('opportunity', 'Opportunity')], required=True,
        default=lambda self: 'lead' if self.env['res.users'].has_group('crm.group_use_lead') else 'opportunity',
        help="Select the type of lead that will be created when this rule applied.")
    sales_team_id = fields.Many2one('crm.team', string='Sales Team')
    user_id = fields.Many2one('res.users', string='Salesperson')
    tag_ids = fields.Many2many('crm.lead.tag', string='Tags')


    @api.depends('event_type_ids','event_id','domain')
    def _compute_attendee_ids(self):
        """Compute the attendees impacted by the rule to compare later for the creation of leads"""
        for record in self:
            if not record.event_type_ids and not record.event_id:
                registration_ids = self.env['event.registration'].search((safe_eval(record.domain)))
            else:
                list_type = []
                for t in record.event_type_ids:
                    list_type.append(t.id) if type(t.id) is type(int()) else list_type.append(t.id.origin)
                registration_ids = self.env['event.registration'].search(['|',('event_id','=',record.event_id.id),('event_id.event_type_id','in',list_type)]).search((safe_eval(record.domain)))

            record.registration_ids = registration_ids

    @api.onchange('user_id')
    def _onchange_user_id(self):
        if self.user_id and self.user_id.sale_team_id:
            self.sales_team_id = self.user_id.sale_team_id
        else:
            self.sales_team_id = False
    
    @api.model
    def _check_rules(self, event_id, registration_ids):
        """Check if the rule applied for the registration_ids created
        and send the parameters to create leads."""
        if len(self.sudo().registration_ids) == 0 or not self.active:
            return
        if event_id.company_id == self.company_id or not self.company_id:
            if (
                (not self.event_type_ids and not self.event_id) or 
                (event_id.event_type_id in self.event_type_ids and not self) or 
                (not self.event_type_ids and self.event_id == event_id) or 
                (event_id.event_type_id in self.event_type_ids or self.event_id == event_id)
                ):
                values = self._prepare_create_leads_values()
                self.sudo()._create_leads(registration_ids, values)

    def _prepare_create_leads_values(self):
        self.ensure_one()
        values = {
            'user_id': self.user_id.id,
            'type': self.lead_type,
            'team_id': self.sales_team_id.id,
            'tag_ids': self.tag_ids,
        }
        return values

    def _get_additional_values(self, values, registration):
        values.update({
            'name': registration.event_id.name + " - " + registration.name,
            'contact_name': registration.name,
            'email_from': registration.email,
            'phone': registration.phone,
            'mobile': registration.mobile,
            'event_id': registration.event_id.id,
            'referred': 'event',
        })
        return values

    def _create_leads(self, registration_ids, vals):
        self.ensure_one()
        if self.create_lead == 'one_per_attendee':
            for registration in self.registration_ids & registration_ids:
                vals.update({
                    'partner_id' : registration.partner_id.id if registration.partner_id != self.env.ref('base.public_partner') else False,
                    'registration_ids': registration,
                })
                vals = self._get_additional_values(vals, registration)
                registration.lead_id = self.env['crm.lead'].create(vals)
