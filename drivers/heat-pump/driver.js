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

    const startHotWaterBoostAction = this.homey.flow.getActionCard('start_hot_water_boost');
    startHotWaterBoostAction.registerRunListener(async (args) => {
      await args.device.setHotWaterBoost(true);
    });

    const stopHotWaterBoostAction = this.homey.flow.getActionCard('stop_hot_water_boost');
    stopHotWaterBoostAction.registerRunListener(async (args) => {
      await args.device.setHotWaterBoost(false);
    });

    const setHotWaterTemperature = this.homey.flow.getActionCard('set_hot_water_temperature');
    setHotWaterTemperature.registerRunListener(async (args) => {
      await args.device.setHotWaterTemperature(args.temperature);
    });
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

};
