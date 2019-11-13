# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools.translate import _


class Lead2OpportunityPartner(models.TransientModel):
    _name = 'crm.lead2opportunity.partner'
    _description = 'Convert Lead to Opportunity (not in mass)'

    @api.model
    def default_get(self, fields):
        """ Allow support of active_id / active_model instead of jut default_lead_id
        to ease window action definitions, and be backward compatible. """
        result = super(Lead2OpportunityPartner, self).default_get(fields)

        if not result.get('lead_id') and self.env.context.get('active_id'):
            result['lead_id'] = self.env.context.get('active_id')
        return result

    name = fields.Selection([
        ('convert', 'Convert to opportunity'),
        ('merge', 'Merge with existing opportunities')
    ], 'Conversion Action', compute='_compute_name', readonly=False, store=True)
    action = fields.Selection([
        ('create', 'Create a new customer'),
        ('exist', 'Link to an existing customer'),
        ('nothing', 'Do not link to a customer')
    ], string='Related Customer', compute='_compute_action', readonly=False, store=True)
    lead_id = fields.Many2one('crm.lead', 'Associated Lead', required=True)
    opportunity_ids = fields.Many2many(
        'crm.lead', string='Opportunities',
        compute='_compute_opportunity_ids', readonly=False, store=True)
    partner_id = fields.Many2one(
        'res.partner', 'Customer',
        compute='_compute_partner_id', readonly=False, store=True)
    user_id = fields.Many2one(
        'res.users', 'Salesperson',
        compute='_compute_user_id', readonly=False, store=True)
    team_id = fields.Many2one(
        'crm.team', 'Sales Team',
        compute='_compute_team_id', readonly=False, store=True)

    @api.depends('opportunity_ids')
    def _compute_name(self):
        for convert in self:
            convert.name = 'merge' if convert.opportunity_ids and len(convert.opportunity_ids) >= 2 else 'convert'

    @api.depends('lead_id')
    def _compute_action(self):
        for convert in self:
            if not convert.lead_id:
                convert.action = 'nothing'
            else:
                partner_id = convert.lead_id._find_matching_partner()
                if partner_id:
                    convert.action = 'exist'
                elif convert.lead_id.contact_name:
                    convert.action = 'create'
                else:
                    convert.action = 'nothing'

    @api.depends('lead_id', 'partner_id')
    def _compute_opportunity_ids(self):
        for convert in self:
            if not convert.lead_id:
                convert.opportunity_ids = False
                continue
            prout = self.env['crm.lead']._get_duplicated_leads_by_emails(
                convert.partner_id,
                convert.lead_id.partner_id.email if convert.lead_id.partner_id else convert.lead_id.email_from,
                include_lost=True).ids
            print(prout)
            convert.opportunity_ids = prout

    @api.depends('action', 'lead_id')
    def _compute_partner_id(self):
        for convert in self:
            if convert.action == 'exist' and convert.lead_id:
                convert.partner_id = convert.lead_id._find_matching_partner()
            else:
                convert.partner_id = False

    @api.depends('lead_id')
    def _compute_user_id(self):
        for convert in self:
            convert.user_id = convert.lead_id.user_id if convert.lead_id.user_id else False

    @api.depends('user_id')
    def _compute_team_id(self):
        """ When changing the user, also set a team_id or restrict team id
            to the ones user_id is member of.
        """
        for convert in self:
            user = convert.user_id or self.env.user
            if convert.team_id and user in convert.team_id.member_ids | convert.team_id.user_id:
                continue
            team_domain = []
            team = self.env['crm.team']._get_default_team_id(user_id=user.id, domain=team_domain)
            convert.team_id = team.id

    # NOTE JEM : is it the good place to test this ?
    @api.model
    def view_init(self, fields):
        """ Check some preconditions before the wizard executes. """
        for lead in self.env['crm.lead'].browse(self._context.get('active_ids', [])):
            if lead.probability == 100:
                raise UserError(_("Closed/Dead leads cannot be converted into opportunities."))
        return False

    def _convert_opportunity(self, leads, user_ids, team_id=False):
        self.ensure_one()

        for lead in leads:
            if lead.active and self.action != 'nothing':
                self._apply_convert_action(
                    lead, self.action, self.partner_id.id or lead.partner_id.id)

            lead.convert_opportunity(lead.partner_id.id, [], False)

        leads_to_allocate = leads
        if self._context.get('no_force_assignation'):
            leads_to_allocate = leads_to_allocate.filtered(lambda lead: not lead.user_id)

        if user_ids:
            leads_to_allocate.allocate_salesman(user_ids, team_id=team_id)

    def action_apply(self):
        """ Convert lead to opportunity or merge lead and opportunity and open
            the freshly created opportunity view.
        """
        self.ensure_one()

        if self.name == 'merge':
            result_opportunity = self.with_context(active_test=False).opportunity_ids.merge_opportunity()
            if not result_opportunity.active:
                result_opportunity.write({'active': True, 'activity_type_id': False, 'lost_reason': False})

            if result_opportunity.type == "lead":
                self._convert_opportunity(result_opportunity, [self.user_id.id], team_id=self.team_id.id)
            elif not self._context.get('no_force_assignation') or not result_opportunity.user_id:
                result_opportunity.write({
                    'user_id': self.user_id.id,
                    'team_id': self.team_id.id,
                })
        else:
            result_opportunities = self.env['crm.lead'].browse(self._context.get('active_ids', []))
            self._convert_opportunity(result_opportunities, [self.user_id.id], team_id=self.team_id.id)
            result_opportunity = result_opportunities[0]

        return result_opportunity.redirect_lead_opportunity_view()

    def _apply_convert_action(self, lead, action, partner_id):
        # used to propagate user_id (salesman) on created partners during conversion
        return lead.with_context(
            default_user_id=self.user_id.id
        ).handle_partner_assignation(
            force_partner_id=partner_id,
            create_missing=(action == 'create')
        )
