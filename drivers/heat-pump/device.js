'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');
const { ReauthenticationRequiredError } = require('../../lib/vaillant-authentication');

module.exports = class MyDevice extends Homey.Device {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Heat-pump has been initialized');
    this.api = new VaillantApi(this.homey.settings, this.logger, this.homey.app.authentication);

    await this.setAvailable();
    await this.setCapabilities();

    this.updateInterval = setInterval(async () => {
      await this.updatePowerUsage();
      await this.updateSystem();
    }, 60000); // 60 seconds

    await this.updatePowerUsage();
    await this.updateSystem();
  }

  async startHotWaterBoost() {
    try {
      await this.api.setHotWaterBoost(this.getData().id, true, this.getData().controlIdentifier);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  async stopHotWaterBoost() {
    try {
      await this.api.setHotWaterBoost(this.getData().id, false, this.getData().controlIdentifier);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  async setHotWaterTemperature(temperature) {
    try {
      await this.api.setHotWaterTemperature(this.getData().id, temperature, this.getData().controlIdentifier);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
      }
      throw error;
    }
  }

  isDesiredHotWaterTemperature(temperature) {
    return temperature === this.getCapabilityValue('desired_hot_water_temperature');
  }

  isCurrentStatus(status) {
    return status.toUpperCase() === this.getCapabilityValue('status').toUpperCase();
  }

  async updatePowerUsage() {
    try {
      const energyUsage = await this.api.getEnergyUsage(this.getData().id);

      await this.setCapabilityValue('measure_power', energyUsage);

      let meterPower = await this.getStoreValue('meter_power') || 0;
      meterPower += this.convertWattToKwh(energyUsage);
      await this.setStoreValue('meter_power', meterPower);
      await this.setCapabilityValue('meter_power', meterPower);
    } catch (error) {
      this.logger.error('Error updating measure_power:', { error: error.message || error });
    }
  }

  convertWattToKwh(value) {
    return value / 60000;
  }

  async onAdded() {
    this.logger.info('Heat-pump has been added');
    await this.updateSystem();
  }

  async onDeleted() {
    this.logger.info('Heat-pump has been deleted');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updateCapabilityAndTriggerIfChanged(capability, newValue, triggerId, tokens) {
    const oldValue = this.getCapabilityValue(capability);
    await this.setCapabilityValue(capability, newValue);

    if (oldValue !== null && oldValue !== undefined && oldValue !== newValue) {
      const trigger = this.homey.flow.getTriggerCard(triggerId);
      await trigger.trigger(this, tokens);
    }
  }

  async updateSystem() {
    try {
      const system = await this.api.getSystem(this.getData().id, this.getData().controlIdentifier);

      this.logger.info('System updated', { system: JSON.stringify(system) });
      await this.updateCapabilityAndTriggerIfChanged(
        'status',
        system.status,
        'status_changed',
        null,
      );
      await this.updateCapabilityAndTriggerIfChanged(
        'water_pressure',
        system.waterPressure,
        'water_pressure_changed',
        { pressure: system.waterPressure },
      );
      await this.updateCapabilityAndTriggerIfChanged(
        'current_outdoor_temperature',
        system.outdoorTemperature,
        'current_outdoor_temperature_changed',
        { temperature: system.outdoorTemperature },
      );
      await this.updateCapabilityAndTriggerIfChanged(
        'average_outdoor_temperature',
        system.outdoorTemperatureAverage24h,
        'average_outdoor_temperature_changed',
        { temperature: system.outdoorTemperatureAverage24h },
      );
      await this.updateCapabilityAndTriggerIfChanged(
        'current_hot_water_temperature',
        system.hotWaterTemperatureCurrent,
        'current_hot_water_temperature_changed',
        { temperature: system.hotWaterTemperatureCurrent },
      );
      await this.updateCapabilityAndTriggerIfChanged(
        'desired_hot_water_temperature',
        system.hotWaterTemperatureDesired,
        'desired_hot_water_temperature_changed',
        { temperature: system.hotWaterTemperatureDesired },
      );
      await this.setCapabilityValue('current_flow_temperature', system.flowTemperature);
      await this.setAvailable();
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        await this.setUnavailable('Vaillant session expired. Please repair the device to log in again.');
        return;
      }
      this.logger.error('Error updating capabilities', { error: error.message || error });
      await this.setAvailable();
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
    changedKeys,
  }) {
    this.logger.info('Heat-pump settings where changed');
  }

  async setCapabilities() {
    await this.removeCapability('status');
    await this.removeCapability('water_pressure');
    await this.removeCapability('measure_power');
    await this.removeCapability('meter_power');
    await this.removeCapability('current_outdoor_temperature');
    await this.removeCapability('average_outdoor_temperature');
    await this.removeCapability('current_hot_water_temperature');
    await this.removeCapability('desired_hot_water_temperature');
    await this.removeCapability('current_flow_temperature');
    await this.removeCapability('alarm_tank_empty'); // deprecated

    await this.addCapability('status');
    await this.addCapability('water_pressure');
    await this.addCapability('measure_power');
    await this.addCapability('meter_power');
    await this.addCapability('current_outdoor_temperature');
    await this.addCapability('average_outdoor_temperature');
    await this.addCapability('current_hot_water_temperature');
    await this.addCapability('desired_hot_water_temperature');
    await this.addCapability('current_flow_temperature');
  }

};
