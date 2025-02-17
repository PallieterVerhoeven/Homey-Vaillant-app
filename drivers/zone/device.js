'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDevice extends Homey.Device {
  async onInit() {
    this.log('Zone has been initialized');

    this.api = new VaillantApi(this.homey.settings);

    this.registerCapabilityListener('target_temperature', async (targetTemperature) => {
      await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, targetTemperature, 3)
        .then(() => {
          this.setCapabilityValue('target_temperature', targetTemperature);
        });
    });

    this.registerCapabilityListener('heating_mode', async (heatingMode) => {
      // TODO: Not sure how to set the heating mode
      // await this.api.set...(this.getData().systemId, this.getData().zoneId, heatingMode)
      //   .then(() => {
      //     this.setCapabilityValue('heating_mode', heatingMode);
      //   });
    });

    const setTemperatureVetoForDurationAction = this.homey.flow.getActionCard('set_temperature_veto_for_duration');
    setTemperatureVetoForDurationAction.registerRunListener(async (args) => {
      await this.setQuickVeto(args.temperature, args.durationInHours);
    });

    const cancelTemperatureVetoAction = this.homey.flow.getActionCard('cancel_temperature_veto');
    cancelTemperatureVetoAction.registerRunListener(async () => {
      await this.cancelQuickVeto();
    });

    this.updateInterval = setInterval(() => {
      this.updateZone();
    }, 60000); // 60 seconds
  }

  async onDeleted() {
    this.log('Zone has been deleted');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updateZone() {
    try {
      const zone = await this.api.getZone(this.getData().systemId, this.getData().zoneId);

      console.log(zone);
      await this.setCapabilityValue('measure_temperature', zone.currentRoomTemperature);
      await this.setCapabilityValue('target_temperature', zone.desiredRoomTemperature);
      await this.setCapabilityValue('measure_humidity', zone.currentRoomHumidity);
      await this.setCapabilityValue('heating_mode', zone.heatingMode);

      console.log('Zone updated');
    } catch (err) {
      this.error('Error while updating system state:', err);
    }
  }

  async setQuickVeto(temperature, durationInHours) {
    await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, temperature, durationInHours);
  }

  async cancelQuickVeto() {
    await this.api.cancelQuickVeto(this.getData().systemId, this.getData().zoneId);
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys
  }) {
    this.log('Zone settings where changed');
  }

};
