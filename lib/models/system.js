'use strict';


class System {
  constructor(
    outdoorTemperature,
    outdoorTemperatureAverage24h,
    waterPressure,
    status,
    // dwh
    hotWaterTemperatureCurrent,
    hotWaterTemperatureDesired,
    flowTemperature,
  ) {
    this.outdoorTemperature = outdoorTemperature;
    this.outdoorTemperatureAverage24h = outdoorTemperatureAverage24h;
    this.waterPressure = waterPressure;
    this.status = status;
    this.hotWaterTemperatureCurrent = hotWaterTemperatureCurrent;
    this.hotWaterTemperatureDesired = hotWaterTemperatureDesired;
    this.flowTemperature = flowTemperature;
  }

  isWaterPressureSafe() {
    return this.waterPressure >= 1.0 && this.waterPressure <= 2.0;
  }

  static mapResponse(response) {
    return new System(
      response.state.system.outdoorTemperature,
      response.state.system.outdoorTemperatureAverage24h,
      response.state.system.systemWaterPressure,
      response.state.system.energyManagerState,
      this.getCurrentHotWaterTemperature(response),
      this.getDesiredHotWaterTemperature(response),
      this.getFlowTemperature(response),
    );
  }

  static getCurrentHotWaterTemperature(response) {
    return response.state.dhw?.[0]?.currentDhwTemperature
      ?? response.state.domesticHotWater?.[0]?.currentDhwTemperature
      ?? null;
  }

  static getDesiredHotWaterTemperature(response) {
    return response.configuration.dhw?.[0]?.tappingSetpoint
      ?? response.configuration.domesticHotWater?.[0]?.tappingSetpoint
      ?? null;
  }

  static getFlowTemperature(response) {
   return response.state.circuits?.[0]?.currentCircuitFlowTemperature
       ?? null;
  }
}

module.exports = System;

