'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');

module.exports = class MyDevice extends Homey.Device {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Heat-pump has been initialized');
    this.api = new VaillantApi(this.homey.settings, this.logger);

    await this.capabilityMigrations();

    this.updateInterval = setInterval(() => {
      this.updateMeasurePower();
      this.updateSystem();
    }, 60000); // 60 seconds

    this.registerCapabilityListener('measure_pressure', async () => {
      const waterPressureChangedTrigger = this.homey.flow.getTriggerCard('water_pressure_changed');
      await waterPressureChangedTrigger.trigger();
    });

    const safeWaterPressureCondition = this.homey.flow.getConditionCard('safe_water_pressure');
    await safeWaterPressureCondition.registerRunListener(async () => {
      return this.getCapabilityValue('safe_water_pressure');
    });

    const desiredHotWaterTemperatureCondition = this.homey.flow.getConditionCard('desired_hot_water_temperature');
    await desiredHotWaterTemperatureCondition.registerRunListener(async (args) => {
      return args.temperature === this.getCapabilityValue('desired_hot_water_temperature');
    });

    const currenHeatingModeCondition = this.homey.flow.getConditionCard('current_heating_mode');
    await currenHeatingModeCondition.registerRunListener(async (args) => {
      // TODO: Should use enum for heatingMode
      return args.heatingMode === this.getCapabilityValue('status');
    });

  }

  async updateMeasurePower() {
    try {
      const energyUsage = await this.api.getEnergyUsage(this.getData().id);

      await this.setCapabilityValue('measure_power', energyUsage);
    } catch (err) {
      this.error('Error while updating measure_power:', err);
    }
  }

  async onAdded() {
    this.log('Heat-pump has been added');
    await this.updateSystem();
  }

  async onDeleted() {
    this.log('Heat-pump has been deleted');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updateSystem() {
    try {
      const system = await this.api.getSystem(this.getData().id);

      this.logger.info('System updated', { system: JSON.stringify(system) });
      await this.setCapabilityValue('status', system.status);
      await this.setCapabilityValue('water_pressure', system.waterPressure);
      await this.setCapabilityValue('current_outdoor_temperature', system.outdoorTemperature);
      await this.setCapabilityValue('average_outdoor_temperature', system.outdoorTemperatureAverage24h);
      await this.setCapabilityValue('current_hot_water_temperature', system.hotWaterTemperatureCurrent);
      await this.setCapabilityValue('desired_hot_water_temperature', system.hotWaterTemperatureDesired);
      await this.setCapabilityValue('alarm_tank_empty', system.hotWaterTemperatureCurrent && system.hotWaterTemperatureCurrent < 38);
    } catch (err) {
      this.error('Error while updating system state:', err);
    }
  }

  async setHotWaterBoost(state) {
    await this.api.setHotWaterBoost(this.getData().id, state);
  }

  async setHotWaterTemperature(temperature) {
    await this.api.setHotWaterTemperature(this.getData().id, temperature)
      .then(() => {
        this.setCapabilityValue('desired_hot_water_temperature', temperature);
      });
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
    this.log('Heat-pump settings where changed');
  }

  async capabilityMigrations() {

  }

};
