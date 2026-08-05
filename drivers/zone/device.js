'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');
const { ReauthenticationRequiredError } = require('../../lib/vaillant-authentication');

module.exports = class MyDevice extends Homey.Device {
  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Zone has been initialized');
    this.api = new VaillantApi(this.homey.settings, this.logger, this.homey.app.authentication);

    await this.setAvailable();

    const zone = await this.api.getZone(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier);
    await this.setCapabilities(zone);
    await this.updateCapabilityValues(zone);

    this.updateInterval = setInterval(async () => {
      await this.updateZone();
    }, 60000); // 60 seconds

    this.registerCapabilityListener('target_temperature', async (targetTemperature) => {
      try {
        await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, targetTemperature, 3);
        await this.setCapabilityValue('target_temperature', targetTemperature);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
    });

    this.registerMultipleCapabilityListener(['heating_mode', 'heating_mode_vrc700'], async (operationMode) => {
      try {
        await this.api.setHeatingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, Object.values(operationMode)[0]);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
      setTimeout(() => {
        this.updateZone()
          .catch((updateError) => {
            this.logger.error('Error updating zone after heating mode change', { error: updateError.message || updateError });
          });
      }, 5000);
    });

    this.registerMultipleCapabilityListener(['cooling_mode', 'cooling_mode_vrc700'], async (operationMode) => {
      try {
        await this.api.setCoolingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, Object.values(operationMode)[0]);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
      setTimeout(() => {
        this.updateZone()
          .catch((updateError) => {
            this.logger.error('Error updating zone after cooling mode change', { error: updateError.message || updateError });
          });
      }, 5000);
    });
  }

  async setQuickVeto(temperature, durationInHours) {
    try {
      await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, temperature, durationInHours);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  async cancelQuickVeto() {
    try {
      await this.api.cancelQuickVeto(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  async setHeatingMode(modeId) {
    try {
      await this.api.setHeatingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, modeId);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  async setCoolingMode(modeId) {
    try {
      await this.api.setCoolingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, modeId);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  getHeatingModeOptions(query) {
    const options = this.isVRC700()
      ? [
        { id: 'AUTO', name: 'Auto' },
        { id: 'DAY', name: 'Day' },
        { id: 'SET_BACK', name: 'Set Back' },
        { id: 'OFF', name: 'Off' },
      ]
      : [
        { id: 'MANUAL', name: 'Manual' },
        { id: 'TIME_CONTROLLED', name: 'Time Controlled' },
        { id: 'OFF', name: 'Off' },
      ];

    return options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase()));
  }

  getCoolingModeOptions(query) {
    return this.getHeatingModeOptions(query);
  }

  async onAdded() {
    this.logger.info('Zone has been added');
    await this.updateZone();
  }

  async onDeleted() {
    this.logger.info('Zone has been deleted');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updateZone() {
    try {
      const zone = await this.api.getZone(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier);
      await this.updateCapabilityValues(zone);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        return;
      }
      this.logger.error('Error updating capabilities', { error: error.message || error });
      await this.setAvailable();
    }
  }

  async updateCapabilityValues(zone) {
    this.logger.info('Zone updated', { zone: JSON.stringify(zone) });

    if (this.hasCapability('measure_temperature')) {
      await this.setCapabilityValue('measure_temperature', zone.currentRoomTemperature);
    }
    await this.setCapabilityValue('target_temperature', zone.desiredRoomTemperature);
    if (this.hasCapability('measure_humidity')) {
      await this.setCapabilityValue('measure_humidity', zone.currentRoomHumidity);
    }
    await this.setCapabilityValue(this.getHeatingModeCapability(), zone.heatingMode);

    if (this.hasCapability(this.getCoolingModeCapability())) {
      await this.setCapabilityValue(this.getCoolingModeCapability(), zone.coolingMode);
    }
    await this.setAvailable();
  }

  async setCapabilities(zone) {
    await this.removeCapability('measure_humidity');
    await this.removeCapability('target_temperature');
    await this.removeCapability('measure_temperature');
    await this.removeCapability('heating_mode');
    await this.removeCapability('heating_mode_vrc700');
    await this.removeCapability('cooling_mode');
    await this.removeCapability('cooling_mode_vrc700');

    await this.addCapability('target_temperature');
    await this.addCapability(this.getHeatingModeCapability());

    if (zone.currentRoomTemperature != null) {
      await this.addCapability('measure_temperature');
    }

    if (zone.currentRoomHumidity != null) {
      await this.addCapability('measure_humidity');
    }

    if (zone.isCoolingEnabled) {
      await this.addCapability(this.getCoolingModeCapability());
    }
  }

  isVRC700() {
    return this.getData().controlIdentifier === 'vrc700';
  }

  getHeatingModeCapability() {
    return this.isVRC700() ? 'heating_mode_vrc700' : 'heating_mode';
  }

  getCoolingModeCapability() {
    return this.isVRC700() ? 'cooling_mode_vrc700' : 'cooling_mode';
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
    changedKeys,
  }) {
    this.logger.info('Zone settings where changed');
  }
};
