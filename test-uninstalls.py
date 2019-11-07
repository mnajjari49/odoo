import argparse
import odoo
import logging
import sys


from odoo.tools.misc import topological_sort
from odoo.tools.config import configmanager


CALLBACKS = ('button_immediate_install', 'button_immediate_uninstall')
BLACKLIST = {
    'auth_ldap', 'document_ftp', 'base_gengo', 'website_gengo', 'website_instantclick', 'pad',
    'pad_project', 'note_pad', 'pos_cache', 'pos_blackbox_be', 'payment_test',
}
IGNORE = ('hw_', 'theme_', 'l10n_', 'test_', 'payment_')


def _call_on_mod(mod_id, callback, db):
    assert callback in CALLBACKS, f"_call_on_mod only accepts {CALLBACKS} as arguments"
    with odoo.api.Environment.manage():
        with odoo.registry(db).cursor() as cr:
            env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})
            mod = env['ir.module.module'].browse(mod_id)
            name = mod.name
            getattr(mod, callback)()
    return name


def _install(mod_id, db):
    name = _call_on_mod(mod_id, 'button_immediate_install', db)
    print(f"{name} installed")


def _uninstall(mod_id, db):
    name = _call_on_mod(mod_id, 'button_immediate_uninstall', db)
    print(f"{name} uninstalled")


def cycle(mod_id, db):
    _install(mod_id, db)
    _uninstall(mod_id, db)
    _install(mod_id, db)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Script for testing the install / uninstall / reinstall cycle of Odoo modules")
    parser.add_argument("--database", "-d", type=str, nargs=1, required=True,
        help="The database to test (note: must have only 'base' installed)")
    parser.add_argument("--skip", "-s", type=str, nargs=1,
        help="Comma-separated list of modules to skip (they will only be installed)")
    parser.add_argument("--resume", "-r", type=str, nargs=1,
        help="Skip the cycle on all modules up to the specified one")
    parser.add_argument("--paths", "-p", type=str, nargs=1,
        help="Comma-separated list of paths to directories containing extra Odoo modules")
    return parser.parse_args()


def main():
    args = parse_args()

    # handle paths option
    if args.paths:
        conf = configmanager()
        paths = args.paths[0]
        conf._parse_config([f"--addons-path={paths}"])
        odoo.tools.config = conf

    with odoo.api.Environment.manage():
        with odoo.registry(args.database[0]).cursor() as cr:
            env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})

            def filter_mod(mod_dep):
                return not (
                    mod_dep.name in BLACKLIST
                    or mod_dep.name.startswith(IGNORE)
                    or mod_dep.state in ('installed', 'uninstallable')
                )

            # TODO: check if it's easier to just search for ir.module.module.dependency
            mods = env['ir.module.module'].search([]).filtered(filter_mod)
            sorted_mods = topological_sort({
                mod.id: mod.dependencies_id.mapped('depend_id').ids
                for mod in mods
            })
            mod_names = {mod.id: mod.name for mod in mods}

    done = False
    for mod in sorted_mods:
        skip = False

        # handle resume option
        if args.resume and not done:
            if mod_names[mod] != args.resume[0]:
                skip = True
            else:
                done = True

        # handle skip option
        if args.skip and mod_names[mod] in args.skip[0].split(','):
            skip = True

        if skip:
            _install(mod, args.database[0])
        else:
            cycle(mod, args.database[0])

if __name__ == '__main__':
    main()
