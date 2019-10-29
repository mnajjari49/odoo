from cups import Connection as cups_connection
from re import sub
from threading import Lock

from odoo.addons.hw_drivers.controllers.driver import Interface

conn = cups_connection()
PPDs = conn.getPPDs()
printers = conn.getPrinters()
cups_lock = Lock()  # We can only make one call to Cups at a time

class PrinterInterface(Interface):
    _loop_delay = 120
    connection_type = 'printer'

    def get_devices(self):
        printer_devices = {}
        with cups_lock:
            devices = conn.getDevices()
        for url in [printer_lo for printer_lo in devices if devices[printer_lo]['device-make-and-model'] != 'Unknown']:
            if 'uuid=' in url:
                identifier = sub('[^a-zA-Z0-9 ]+', '', url.split('uuid=')[1])
            elif 'serial=' in url:
                identifier = sub('[^a-zA-Z0-9 ]+', '', url.split('serial=')[1])
            else:
                identifier = sub('[^a-zA-Z0-9 ]+', '', url)
            devices[url]['identifier'] = identifier
            devices[url]['url'] = url
            printer_devices[identifier] = devices[url]
        return printer_devices
