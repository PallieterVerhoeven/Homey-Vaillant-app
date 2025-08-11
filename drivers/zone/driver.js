'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('../../lib/vaillant-authentication');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');

module.exports = class MyDriver extends Homey.Driver {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Zone driver has been initialized');
    this.authentication = VaillantAuthentication.getInstance(this.homey.settings, this.logger);
  }

  async onPair(session) {
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
      const authentication = VaillantAuthentication.getInstance(this.homey.settings, this.logger);
      const api = new VaillantApi(this.homey.settings, this.logger, authentication);
      const devices = await api.getHeatingSystemsList();

      const allZones = await Promise.all(
        devices.map(async (device) => {
          const zones = await api.getZones(device.id);
          const controlIdentifier = await api.getSystemIdentifier(device.id);
          return zones.map((zone) => ({
            name: zone.name,
            data: {
              id: device.id + '-' + zone.index,
              zoneId: zone.index,
              systemId: device.id,
              controlIdentifier: controlIdentifier,
            },
            settings: {},
          }));
        })
      );

      return allZones.flat();
    });
  }

  async onRepair(session, device) {
    // Argument session is a PairSocket, similar to Driver.onPair
    // Argument device is a Homey.Device that's being repaired
    this.authentication = VaillantAuthentication.getInstance(this.homey.settings, this.logger);

    session.setHandler('login', async (data) => {
      await this.authentication.login(
        data.country,
        data.username,
        data.password,
      );

      if (this.authentication.isLoggedIn()) {
        await session.done();
      }

      return false;
    });
  }

};
