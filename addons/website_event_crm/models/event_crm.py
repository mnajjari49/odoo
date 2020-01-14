# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _

class EventCrm(models.Model):
    _inherit = 'event.crm'

    create_lead = fields.Selection(selection_add=[('one_per_order', 'One per Order')],
        help="Select the type that this rule will apply to create leads.\n"
            "- One per Attendee will create a lead for each attendee.\n"
            "- One per Order will create a lead for a group of attendees.")

    def _additional_content_description(self, registration, description):
        return description

    def _get_description_lead(self, registration_ids):
        description = _("Participants:\n")
        first_registration = False
        for registration in self.registration_ids & registration_ids:
            if not first_registration:
                first_registration = registration_ids[0]
            description += "\t%s %s %s\n" % (registration.name, registration.email, registration.phone)
            description = self._additional_content_description(registration, description)
        return description, first_registration

    def _create_leads(self, registration_ids, vals):
        super(EventCrm, self)._create_leads(registration_ids, vals)
        if self.create_lead == 'one_per_order':
            description, registration = self._get_description_lead(registration_ids)
            if registration:
                vals.update({
                    'description': description,
                    'registration_ids': self.registration_ids & registration_ids,
                })
                vals = self._get_additional_values(vals, registration)
                lead = self.env['crm.lead'].create(vals)
                for registration in self.registration_ids:
                    if registration in registration_ids:
                        registration.lead_id = lead
