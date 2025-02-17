'use strict';

const Homey = require('homey');
const VaillantApi = require('../../lib/vaillant-api');

module.exports = class MyDevice extends Homey.Device {

  async onInit() {
    this.log('Heat-pump has been initialized');

    this.api = new VaillantApi();

    this.updateInterval = setInterval(() => {
      this.updateMeasurePower();
      this.updateSystem();
    }, 60000); // 60 seconds

    const currenHeatingModeCondition = this.homey.flow.getConditionCard('current_heating_mode');
    await currenHeatingModeCondition.registerRunListener(async (args) => {
      // TODO: Should use enum for heatingMode
      return args.heatingMode === this.getCapabilityValue('status');
    });

    const safeWaterPressureCondition = this.homey.flow.getConditionCard('safe_water_pressure');
    await safeWaterPressureCondition.registerRunListener(async () => {
      return this.getCapabilityValue('safe_water_pressure');
    });
  }

  async updateMeasurePower() {
    try {
      await this.updateAccessToken();
      const energyUsage = await this.api.getEnergyUsage(this.getData().id);

      await this.setCapabilityValue('measure_power', energyUsage);
    } catch (err) {
      this.error('Error while updating measure_power:', err);
    }
  }

  async updateSystem() {
    try {
      await this.updateAccessToken();
      const system = await this.api.getSystem(this.getData().id);

      if (this.getCapabilityValue('safe_water_pressure') === true
        && system.isWaterPressureSafe() === false
      ) {
        const unsafeWaterPressureTrigger = this.homey.flow.getTriggerCard('unsafe_water_pressure');
        await unsafeWaterPressureTrigger.trigger();
      }

      await this.setCapabilityValue('status', system.status);
      await this.setCapabilityValue('water_pressure', system.waterPressure);
      await this.setCapabilityValue('current_outdoor_temperature', system.outdoorTemperature);
      await this.setCapabilityValue('average_outdoor_temperature', system.outdoorTemperatureAverage24h);
      await this.setCapabilityValue('current_hot_water_temperature', system.hotWaterTemperatureCurrent);
      await this.setCapabilityValue('desired_hot_water_temperature', system.hotWaterTemperatureDesired);
      await this.setCapabilityValue('alarm_tank_empty', system.hotWaterTemperatureCurrent < 38);
      await this.setCapabilityValue('safe_water_pressure', system.isWaterPressureSafe());

      console.log('System updated');
    } catch (err) {
      this.error('Error while updating system state:', err);
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

  async updateAccessToken() {
    this.api.setAccessToken(
      await this.driver.authentication.getAccessToken(this.getData().country)
    );
  }

  async setHotWaterBoost(state) {
    await this.updateAccessToken();
    await this.api.setHotWaterBoost(this.getData().id, state);
  }

  async setHotWaterTemperature(temperature) {
    await this.updateAccessToken();
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

};
