# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Website Project',
    'category': 'Website/Website',
    'summary': 'Display a rating page for a project',
    'version': '1.0',
    'description': """
    Allows to publish or unpublish a website page for all ratings of a particular project.
    """,
    'depends': ['website', 'project'], #'rating': already a dependency of project
    'data': [
        'views/project_rating_templates.xml',
        'views/project_views.xml',
    ],
    'qweb': [
    ],
    'installable': True,
    'auto_install': True,
}
