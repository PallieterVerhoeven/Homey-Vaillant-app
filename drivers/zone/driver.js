'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('../../lib/vaillant-authentication');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Initialize authentication');
    this.authentication = new VaillantAuthentication(this.homey.settings);

    this.log('Register actions');
    const setTemperatureVetoForDurationAction = this.homey.flow.getActionCard('set-temperature-veto-for-duration');
    setTemperatureVetoForDurationAction.registerRunListener(async (args) => {
      await args.device.setQuickVeto(args.temperature, args.durationInHours);
    });

    const cancelTemperatureVetoAction = this.homey.flow.getActionCard('cancel-temperature-veto');
    cancelTemperatureVetoAction.registerRunListener(async (args) => {
      await args.device.cancelQuickVeto();
    });
  }

  async onPair(session) {
    session.setHandler('showView', async (viewId) => {
      if (viewId === 'login_credentials' && this.homey.settings.get('accessToken')) {
        await session.showView('list_devices');
      }
    });

    session.setHandler('login', async (data) => {
      return await this.authentication.login(
        'netherlands',
        data.username,
        data.password,
      );
    });

    session.setHandler('list_devices', async () => {
      const api = new VaillantApi(this.homey.settings);
      const devices = await api.getHeatingSystemsList();

      const allZones = await Promise.all(
        devices.map(async (device) => {
          const zones = await api.getZones(device.id);
          return zones.map((zone) => ({
            name: zone.name,
            data: {
              id: device.id + '-' + zone.index,
              zoneId: zone.index,
              systemId: device.id,
            },
            settings: {},
          }));
        })
      );

      return allZones.flat();
    });
  }

};
