'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Zone has been initialized');

    this.api = new VaillantApi();

    this.registerCapabilityListener('target_temperature', async (value) => {
      await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, value, 3);
      await this.setCapabilityValue('target_temperature', value);
    });

    this.updateInterval = setInterval(() => {
      this.updateZone();
    }, 60000); // 60 seconds
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Zone has been added');
    await this.updateZone();
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

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Zone was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Zone has been deleted');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updateZone() {
    try {
      await this.updateAccessToken();
      const zone = await this.api.getZone(this.getData().systemId, this.getData().zoneId);

      console.log(zone);
      await this.setCapabilityValue('measure_temperature', zone.currentRoomTemperature);
      await this.setCapabilityValue('target_temperature', zone.desiredRoomTemperature);
      await this.setCapabilityValue('measure_humidity', zone.currentRoomHumidity);

      console.log('Zone updated');
    } catch (err) {
      this.error('Error while updating system state:', err);
    }
  }

  async updateAccessToken() {
    this.api.setAccessToken(
      await this.driver.authentication.getAccessToken(this.getData().country)
    );
  }

  async setQuickVeto(temperature, durationInHours) {
    await this.updateAccessToken();
    await this.api.setQuickVeto(this.getData().id, this.getData().zoneId, temperature, durationInHours);
  }

  async cancelQuickVeto(temperature, durationInHours) {
    await this.updateAccessToken();
    await this.api.cancelQuickVeto(this.getData().id, this.getData().zoneId);
  }

};
