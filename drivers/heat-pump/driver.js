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
    const startHotWaterBoostAction = this.homey.flow.getActionCard('start-hot-water-boost');
    startHotWaterBoostAction.registerRunListener(async (args) => {
      await args.device.setHotWaterBoost(true);
    });

    const stopHotWaterBoostAction = this.homey.flow.getActionCard('stop-hot-water-boost');
    stopHotWaterBoostAction.registerRunListener(async (args) => {
      await args.device.setHotWaterBoost(false);
    });

    const setHotWaterTemperature = this.homey.flow.getActionCard('set-hot-water-temperature');
    setHotWaterTemperature.registerRunListener(async (args) => {
      await args.device.setHotWaterTemperature(args.temperature);
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
      const api = new VaillantApi();
      api.setAccessToken(await this.authentication.getAccessToken('netherlands'));
      const devices = await api.getHeatingSystemsList();

      return await Promise.all(
        devices.map(async (device) => {
          return {
            name: device.name,
            data: {
              id: device.id,
              country: 'netherlands',
              identifier: await api.getSystemIdentifier(device.id),
            },
            settings: {},
          };
        })
      );
    });
  }

};
