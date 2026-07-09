'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');

module.exports = class MyDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Heat-pump driver has been initialized');
  }

  async onPair(session) {
    this.authentication = this.homey.app.authentication;

    session.setHandler('showView', async (viewId) => {
      if (viewId === 'login' && this.authentication.isLoggedIn()) {
        await session.showView('list_devices');
      }
    });

    session.setHandler('login', async (data) => {
      await this.authentication.login(
        data.country,
        data.username,
        data.password,
      );

      if (this.authentication.isLoggedIn()) {
        await session.showView('list_devices');
        return true;
      }

      return false;
    });

    session.setHandler('list_devices', async () => {
      const api = new VaillantApi(this.homey.settings, this.logger, this.authentication);
      const devices = await api.getHeatingSystemsList();

      return await Promise.all(
        devices.map(async (device) => {
          return {
            name: device.name,
            data: {
              id: device.id,
              controlIdentifier: await api.getSystemIdentifier(device.id),
            },
            settings: {},
          };
        })
      );
    });
  }

  async onRepair(session, device) {
    // Argument session is a PairSocket, similar to Driver.onPair
    // Argument device is a Homey.Device that's being repaired
    this.authentication = this.homey.app.authentication;

    session.setHandler('login', async (data) => {
      await this.authentication.login(
        data.country,
        data.username,
        data.password,
      );

      if (this.authentication.isLoggedIn()) {
        await session.done();
        await device.setAvailable();
        return true;
      }

      return false;
    });
  }

};
