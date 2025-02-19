'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDevice extends Homey.Device {
  async onInit() {
    this.log('Zone has been initialized');
    this.api = new VaillantApi(this.homey.settings);

    if (await this.isVRC700()) {
      await this.setCapabilityVRC700();
    }

    this.registerCapabilityListener('target_temperature', async (targetTemperature) => {
      await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, targetTemperature, 3)
        .then(() => {
          this.setCapabilityValue('target_temperature', targetTemperature);
        });
    });

    this.registerMultipleCapabilityListener(['heating_mode', 'heating_mode_vrc700'], async (operationMode) => {
      await this.api.setHeatingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, Object.values(operationMode)[0]);
      setTimeout(() => {
        // Delay because the API needs some time to update the zone
        this.updateZone();
      }, 5000);
    });

    const setTemperatureVetoForDurationAction = this.homey.flow.getActionCard('set_temperature_veto_for_duration');
    setTemperatureVetoForDurationAction.registerRunListener(async (args) => {
      await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, args.temperature, args.durationInHours);
    });

    const cancelTemperatureVetoAction = this.homey.flow.getActionCard('cancel_temperature_veto');
    cancelTemperatureVetoAction.registerRunListener(async () => {
      await this.api.cancelQuickVeto(this.getData().systemId, this.getData().zoneId);
    });

    this.updateInterval = setInterval(() => {
      this.updateZone();
    }, 60000); // 60 seconds
  }

  async onAdded() {
    this.log('Zone has been added');
    await this.updateZone();
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

      if (this.hasCapability('heating_mode_vrc700')) {
        await this.setCapabilityValue('heating_mode_vrc700', zone.heatingMode);
      } else {
        await this.setCapabilityValue('heating_mode', zone.heatingMode);
      }

      console.log('Zone updated');
    } catch (err) {
      this.error('Error while updating system state:', err);
    }
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

  async isVRC700() {
    return this.getData().controlIdentifier === 'vrc700';
  }

  async setCapabilityVRC700() {
    if (this.hasCapability('heating_mode')) {
      await this.removeCapability('heating_mode');
      await this.addCapability('heating_mode_vrc700');
    }
  }

};
