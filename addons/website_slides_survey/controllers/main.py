# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http, _
from odoo.http import request
from odoo.exceptions import AccessError

from odoo.addons.website_slides.controllers.main import WebsiteSlides


class WebsiteSlidesSurvey(WebsiteSlides):
    @http.route(['/slides_survey/certification/fetch_certification_info'], type='json', auth='user', methods=['POST'], website=True)
    def slides_fetch_certification_info(self, fields):
        can_create = request.env['survey.survey'].check_access_rights('create', raise_exception=False)
        return {
            'read_results': request.env['survey.survey'].search_read([('certification', '=', True)], fields),
            'can_create': can_create,
        }

    # -----------------------------
    #          Overrides
    # -----------------------------

    @http.route(['/slides/add_slide'], type='json', auth='user', methods=['POST'], website=True)
    def create_slide(self, *args, **post):
        result = super(WebsiteSlidesSurvey, self).create_slide(*args, **post)

        if 'error' not in result:
            is_certification = post['slide_type'] == "certification"
            if is_certification and request.env['survey.survey'].check_access_rights('write', raise_exception=False):
                survey_id = request.env['survey.survey'].search([('slide_ids', 'in', [result['slide_id']])]).id
                action_id = request.env.ref('survey.action_survey_form').id
                result['redirect_url'] = '/web#id=%s&action=%s&model=survey.survey&view_type=form' % (survey_id, action_id)

            result['toast'] = is_certification

        return result

    def _prepare_add_slide_values(self, channel, **post):
        values = super(WebsiteSlidesSurvey, self)._prepare_add_slide_values(channel, **post)
        if post.get('survey'):
            try:
                if not post['survey']['id']:  # create new survey
                    values['survey_id'] = request.env['survey.survey'].create({
                        'title': post['survey']['title'],
                        'background_image': post['image_1920'],
                        'questions_layout': 'page_per_question',
                        'is_attempts_limited': True,
                        'attempts_limit': 1,
                        'is_time_limited': False,
                        'scoring_type': 'scoring_without_answers',
                        'certification': True,
                        'scoring_success_min': 70.0,
                        'certification_mail_template_id': request.env.ref('survey.mail_template_certification').id,
                    }).id

            except AccessError:
                return {'error': _('You are not allowed to create a survey.')}
        return values

    def _get_valid_slide_post_values(self):
        return super(WebsiteSlidesSurvey, self)._get_valid_slide_post_values() + ['survey_id']
