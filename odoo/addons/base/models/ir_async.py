import itertools
import json
import logging
import re
import traceback
import threading
import odoo
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class ir_async(models.Model):
    _name = 'ir_async'
    _description = 'Asynchrone jobs'

    user_id = fields.Many2one('res.users', string='Scheduler User')
    model = fields.Char()
    method = fields.Char()
    args = fields.Text()
    kwargs = fields.Text()
    ids = fields.Text()
    context = fields.Text()
    traceback = fields.Text()

    @api.model
    def merge_traceback(self, tb):
        """ Merge the given traceback with all previous level of execution """
        old_tb = self.env.context.get('async_traceback', '').splitlines(keepends=True)
        if old_tb:
            def fnc_process_job_not_reached(line):
                return not re.search(f'in {self._process_job.__name__}\\W', line)
            old_tb.append("Traceback of async job (most recent call last):\n")
            old_tb.extend(itertools.dropwhile(fnc_process_job_not_reached, tb))
            tb = old_tb
        return "".join(tb)

    def call(self, bound_method, *args, **kwargs):
        recs = getattr(bound_method, '__self__', None)
        if recs is None:
            raise TypeError("You can only create an async task on a recordset")
        model = recs.__class__
        
        job = self.sudo().create({
            'user_id': recs.env.uid,
            'model': model._name,
            'method': bound_method.__name__,
            'args': json.dumps(args),
            'kwargs': json.dumps(kwargs),
            'ids': json.dumps(recs._ids),
            'context': json.dumps(recs.env.context),
            'traceback': self.merge_traceback(traceback.format_stack()[:-1]),
        })
        job.flush()
        with odoo.sql_db.db_connect('postgres').cursor() as cr:
            cr.execute('NOTIFY odoo_async, %s', (self._cr.dbname,))
        return job

    @classmethod
    def _process_jobs(cls, dbname):
        db = odoo.sql_db.db_connect(dbname)
        threading.current_thread().dbname = dbname

        while True:
            with db.cursor() as manager_cr:
                job = cls._acquire_job(manager_cr)
                if job is None:
                    break
            cls._process_job(db, job)

    @staticmethod
    def _acquire_job(cr):
        _logger.debug('acquiring')
        cr.execute("""
            DELETE FROM ir_async
            WHERE id in (
                SELECT id
                FROM ir_async
                ORDER BY id  -- FIFO
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING *
            """)
        return cr.dictfetchone()

    @staticmethod
    def _process_job(db, job):
        jids = json.loads(job['ids'])
        jargs = json.loads(job['args'])
        jkwargs = json.loads(job['kwargs'])
        jcontext = json.loads(job['kwargs'])
        jcontext['async_traceback'] = job['traceback']

        with db.cursor() as job_cr, api.Environment.manage():
            env = api.Environment(job_cr, job['user_id'], jcontext)
            try:
                records = env[job['model']].browse(jids)
                result = getattr(records, job['method'])(*jargs, **jkwargs)
                json.dumps(result)  # ensure result is serializable
                records.flush()
            except Exception as exc:
                header, *tb = traceback.format_exc().splitlines(keepends=True)
                exc_tb = header + env['ir_async'].merge_traceback(tb)
                _logger.error("Failed to process async job\n%s", exc_tb)
                bus_channel = env.context.get('bus_channel')
                if bus_channel:
                    env['bus.bus'].sendone(bus_channel, {
                        'state': 'failure',
                        'traceback': tb,
                    })
            else:
                bus_channel = env.context.get('bus_channel')
                if bus_channel:
                    env['bus.bus'].sendone(bus_channel, {
                        'state': 'success',
                        'result': result,
                    })
