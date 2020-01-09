# -*- coding:utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class FleetVehicle(models.Model):
    _inherit = 'fleet.vehicle'

    mobility_card = fields.Char(compute='_compute_mobility_card', store=True)

    @api.depends('driver_id')
    def _compute_mobility_card(self):
        for vehicle in self:
            vehicle.mobility_card = vehicle.driver_id.user_ids[:1].employee_id.mobility_card

    def create_driver_history(self, driver_id):
        super().create_driver_history(driver_id)
        driver = self.env['res.partner'].browse(driver_id)
        for vehicle in self:
            driver.user_ids.employee_id.write({'license_plate': vehicle.license_plate})
            if vehicle.driver_id:
                vehicle.driver_id.user_ids.employee_id.write({'license_plate': False})
