# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import report
from . import wizard

def post_init(cr, registry):
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})
    domain = []
    if 'is_fsm' in env['project.project']._fields:
        domain = [('is_fsm', '=', False)]
    env['project.project'].search(domain).write({'allow_timesheets': True, 'allow_timesheet_timer': True})
