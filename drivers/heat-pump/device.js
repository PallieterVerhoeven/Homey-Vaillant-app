'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');
const Logger = require('../../lib/logger');
const VaillantAuthentication = require('../../lib/vaillant-authentication');

module.exports = class MyDevice extends Homey.Device {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Heat-pump has been initialized');
    const authentication = VaillantAuthentication.getInstance(this.homey.settings, this.logger);
    this.api = new VaillantApi(this.homey.settings, this.logger, authentication);

    await this.capabilityMigrations();

    this.updateInterval = setInterval(() => {
      this.updatePowerUsage();
      this.updateSystem();
    }, 60000); // 60 seconds

    await this.triggers();
    await this.conditions();
    await this.actions();
  }

  async triggers() {
    this.registerCapabilityListener('current_status_changed', async () => {
      const statusChangedTrigger = this.homey.flow.getTriggerCard('status_changed');
      await statusChangedTrigger.trigger();
    });

    this.registerCapabilityListener('measure_pressure', async (value) => {
      const waterPressureChangedTrigger = this.homey.flow.getTriggerCard('water_pressure_changed');
      await waterPressureChangedTrigger.trigger(value);
    });

    this.registerCapabilityListener('current_hot_water_temperature_changed', async (value) => {
      const currentHotWaterTemperatureChangedTrigger = this.homey.flow.getTriggerCard('current_hot_water_temperature_changed');
      await currentHotWaterTemperatureChangedTrigger.trigger(value);
    });

    this.registerCapabilityListener('desired_hot_water_temperature_changed', async (value) => {
      const desiredHotWaterTemperatureChangedTrigger = this.homey.flow.getTriggerCard('desired_hot_water_temperature_changed');
      await desiredHotWaterTemperatureChangedTrigger.trigger(value);
    });

    this.registerCapabilityListener('current_outdoor_temperature_changed', async (value) => {
      const currentOutdoorTemperatureChangedTrigger = this.homey.flow.getTriggerCard('current_outdoor_temperature_changed');
      await currentOutdoorTemperatureChangedTrigger.trigger(value);
    });

    this.registerCapabilityListener('average_outdoor_temperature_changed', async (value) => {
      const averageOutdoorTemperatureChangedTrigger = this.homey.flow.getTriggerCard('average_outdoor_temperature_changed');
      await averageOutdoorTemperatureChangedTrigger.trigger(value);
    });
  }

  async conditions() {
    const safeWaterPressureCondition = this.homey.flow.getConditionCard('safe_water_pressure');
    await safeWaterPressureCondition.registerRunListener(async () => {
      return this.getCapabilityValue('safe_water_pressure');
    });

    const desiredHotWaterTemperatureCondition = this.homey.flow.getConditionCard('desired_hot_water_temperature');
    await desiredHotWaterTemperatureCondition.registerRunListener(async (args) => {
      return args.temperature === this.getCapabilityValue('desired_hot_water_temperature');
    });

    const currenStatusCondition = this.homey.flow.getConditionCard('current_status');
    await currenStatusCondition.registerRunListener(async (args) => {
      return args.status.toUpperCase() === this.getCapabilityValue('status')
        .toUpperCase();
    });
  }

  async actions() {
    const startHotWaterBoostAction = this.homey.flow.getActionCard('start_hot_water_boost');
    startHotWaterBoostAction.registerRunListener(async (args) => {
      await this.api.setHotWaterBoost(this.getData().id, true);
    });

    const stopHotWaterBoostAction = this.homey.flow.getActionCard('stop_hot_water_boost');
    stopHotWaterBoostAction.registerRunListener(async (args) => {
      await this.api.setHotWaterBoost(this.getData().id, false);
    });

    const setHotWaterTemperature = this.homey.flow.getActionCard('set_hot_water_temperature');
    setHotWaterTemperature.registerRunListener(async (args) => {
      await this.api.setHotWaterTemperature(this.getData().id, args.temperature);
    });
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
      await this.setCapabilityValue('current_flow_temperature', system.flowTemperature);
      await this.setCapabilityValue('alarm_tank_empty', system.hotWaterTemperatureCurrent && system.hotWaterTemperatureCurrent < 38);
    } catch (error) {
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
    this.logger.info('Heat-pump settings where changed');
  }

  async capabilityMigrations() {
    if (!this.hasCapability('meter_power')) {
      await this.addCapability('meter_power');
    }
    if (!this.hasCapability('current_flow_temperature')) {
      await this.addCapability('current_flow_temperature');
    }
  }

};
