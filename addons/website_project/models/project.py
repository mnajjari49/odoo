from odoo import api, fields, models

class Project(models.Model):
    _name = 'project.project'
    _inherit = ['project.project',  'website.published.mixin']

    def open_website_url(self):
        """ return the action to see all the rating of the project, and activate default filters """
        return {
            'type': 'ir.actions.act_url',
            'name': "Redirect to the Website Project Rating Page",
            'target': 'self',
            'url': "/project/rating/%s" % (self.id,)
        }