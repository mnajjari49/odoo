from re import sub
import subprocess

from odoo.addons.hw_drivers.controllers.driver import Interface


class DisplayInterface(Interface):
    _loop_delay = 0
    connection_type = 'display'

    def get_devices(self):
        display_devices = {}
        hdmi = subprocess.check_output(['tvservice', '-n']).decode('utf-8').replace('\n', '')

        if hdmi.find('=') != -1 and hdmi.split('=')[1] != "Unk-Composite dis":
            hdmi_serial = sub('[^a-zA-Z0-9 ]+', '', hdmi.split('=')[1]).replace(' ', '_')
            display_devices[hdmi_serial] = {
                'identifier': hdmi_serial,
                'name': hdmi.split('=')[1],
            }
        else:
            # No display connected, create "fake" device to be accessed from another computer
            display_devices['distant_display'] = {
                'identifier': "distant_display",
                'name': "Distant Display",
            }

        return display_devices
