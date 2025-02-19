'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('../../lib/vaillant-authentication');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDriver extends Homey.Driver {

  async onInit() {
    this.log('Initialize authentication');
    this.authentication = new VaillantAuthentication(this.homey.settings);
  }

  async onPair(session) {
    this.authentication = new VaillantAuthentication(this.homey.settings);

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
      const api = new VaillantApi(this.homey.settings);
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

};
