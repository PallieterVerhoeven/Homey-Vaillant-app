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

    if (await this.isVRC700()) {
      await this.setCapabilityVRC700();
    }

    this.registerCapabilityListener('target_temperature', async (targetTemperature) => {
      try {
        await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, targetTemperature, 3);
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
        // Delay because the API needs some time to update the zone
        this.updateZone();
      }, 5000);
    });

    await this.triggers();
    await this.conditions();
    await this.action();

    this.updateInterval = setInterval(() => {
      this.updateZone();
    }, 60000); // 60 seconds
  }

  async triggers() {

  }

  async conditions() {

  }

  async action() {
    const setTemperatureVetoForDurationAction = this.homey.flow.getActionCard('set_temperature_veto_for_duration');
    setTemperatureVetoForDurationAction.registerRunListener(async (args) => {
      try {
        await this.api.setQuickVeto(this.getData().systemId, this.getData().zoneId, args.temperature, args.durationInHours);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
    });

    const cancelTemperatureVetoAction = this.homey.flow.getActionCard('cancel_temperature_veto');
    cancelTemperatureVetoAction.registerRunListener(async () => {
      try {
        await this.api.cancelQuickVeto(this.getData().systemId, this.getData().zoneId);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
    });

    const setHeatingModeAction = this.homey.flow.getActionCard('set_heating_mode');
    setHeatingModeAction.registerRunListener(async (args) => {
      try {
        await this.api.setHeatingMode(this.getData().systemId, this.getData().zoneId, this.getData().controlIdentifier, args.heatingMode.id);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        }
        throw error;
      }
    });
    setHeatingModeAction.registerArgumentAutocompleteListener(
      'heatingMode',
      async (query, args) => {
        const options = [];

        if (this.getData().controlIdentifier === 'vrc700') {
          options.push({
              id: 'AUTO',
              name: 'Auto',
            },
            {
              id: 'DAY',
              name: 'Day',
            },
            {
              id: 'SET_BACK',
              name: 'Set Back',
            });
        } else {
          options.push({
              id: 'MANUAL',
              name: 'Manual',
            },
            {
              id: 'TIME_CONTROLLED',
              name: 'Time Controlled',
            },
            {
              id: 'OFF',
              name: 'Off',
            });
        }

        return options.filter((option) => {
          return option.name.toLowerCase().includes(query.toLowerCase());
        });
      }
    );
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
      const zone = await this.api.getZone(this.getData().systemId, this.getData().zoneId);

      this.logger.info('Zone updated', { zone: JSON.stringify(zone) });
      await this.setCapabilityValue('measure_temperature', zone.currentRoomTemperature);
      await this.setCapabilityValue('target_temperature', zone.desiredRoomTemperature);
      await this.setCapabilityValue('measure_humidity', zone.currentRoomHumidity);

      if (this.hasCapability('heating_mode_vrc700')) {
        await this.setCapabilityValue('heating_mode_vrc700', zone.heatingMode);
      } else {
        await this.setCapabilityValue('heating_mode', zone.heatingMode);
      }
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        return;
      }
      this.logger.error('Error updating capabilities', { error: error.message || error });
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
    this.logger.info('Zone settings where changed');
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
