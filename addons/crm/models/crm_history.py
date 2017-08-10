# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from datetime import datetime
from odoo.osv import expression


class History(models.Model):
    _name = "crm.opportunity.history"
    _description = "crm stage History"

    user_id = fields.Integer(string='User')
    team_id = fields.Integer('Sales Channel')
    stage_id = fields.Many2one('crm.stage', string='Stage')
    stage_name = fields.Char(string='Stage Name', related='stage_id.name', store=True)
    res_id = fields.Many2one('crm.lead', string='related document')

    @api.multi
    def action_pipeline_analysis(self, stages, filter_domain):
        start_date = filter_domain['start_date']
        end_date = filter_domain['end_date']
        domain = []
        if filter_domain.get('user_id'):
            domain = expression.AND([domain, [('user_id', '=', filter_domain['user_id'])]])
        if filter_domain.get('users'):
            domain = expression.AND([domain, [('user_id', 'in', filter_domain['users'])]])
        if filter_domain.get('user_channel'):
            team_id = self.env['res.users'].search([('id', '=', filter_domain['user_channel'])]).sale_team_id
            domain = expression.AND([domain, [('team_id', '=', team_id.id)]])
        if filter_domain.get('teams'):
            domain = expression.AND([domain, [('team_id', 'in', filter_domain['teams'])]])

        new_deals = self.env['crm.lead'].search_count(expression.AND([domain, [('type', '=', 'opportunity'), ('create_date', '>=', start_date), ('create_date', '<=', end_date)]]))
        deals_left = self.env['crm.lead'].search_count(expression.AND([domain, ['|', ('date_deadline', '<', datetime.today().strftime('%Y-%m-%d')), '&', ('date_deadline', '=', None), ('date_closed', '=', None), ('type', '=', 'opportunity')]]))
        won_deals = self.env['crm.lead'].search_count(expression.AND([domain, [('probability', '=', 100), ('date_closed', '<=', end_date), ('date_closed', '>=', start_date), ('type', '=', 'opportunity')]]))
        lost_deals = self.env['crm.lead'].search_count(expression.AND([domain, [('active', '=', False), ('date_closed', '<=', end_date), ('date_closed', '>=', start_date), ('type', '=', 'opportunity')]]))

        records = self.env['crm.lead'].search_read(expression.AND([domain, [('create_date', '>=', start_date), ('create_date', '<=', end_date), ('type', '=', 'opportunity')]]), ['day_close', 'stage_id', 'create_date', 'planned_revenue'])
        total_days = 0
        expected_revenues = {}

        for record in records:
            if record['day_close']:
                total_days += record['day_close']
            else:
                day_close = datetime.today() - datetime.strptime(record['create_date'], '%Y-%m-%d %H:%M:%S')
                total_days += day_close.days
            if expected_revenues.get(record['stage_id'][1]):
                expected_revenues[record['stage_id'][1]] += record['planned_revenue']
            else:
                expected_revenues[record['stage_id'][1]] = record['planned_revenue']

        if total_days != 0:
            average_days = round(total_days / len(records), 3)
        else:
            average_days = 0

        stage_moves = []
        for stage in stages:
            result = self.env['crm.opportunity.history'].search_count(expression.AND([domain, [('stage_name', '=', stage['name']), ('create_date', '>=', start_date), ('create_date', '<=', end_date)]]))
            stage_moves.append({'name': stage['name'],
                                'id': stage['id'],
                                'data': result})

        return {'stage_moves': stage_moves,
                'new_deals': new_deals,
                'left_deals': deals_left,
                'won_deals': won_deals,
                'lost_deals': lost_deals,
                'average_days': average_days,
                'expected_revenues': expected_revenues.items()}

    def get_value(self):
        list_of_stages = self.env['crm.stage'].search([], order='sequence')
        stages = [{'name': stage.name, 'id': stage.id, 'sequence': stage.sequence} for stage in list_of_stages]
        list_of_users = self.env['res.users'].search([('sale_team_id', '!=', None)])
        users = [{'name': user.name, 'id': user.id} for user in list_of_users]
        list_of_sale_team = self.env['crm.team'].search([])
        sales_team = [{'name': team.name, 'id': team.id} for team in list_of_sale_team]
        return {'stages': stages,
                'users': users,
                'sales_team': sales_team}
