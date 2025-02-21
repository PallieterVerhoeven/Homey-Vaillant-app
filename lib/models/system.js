class System {
  constructor(
    outdoorTemperature,
    outdoorTemperatureAverage24h,
    waterPressure,
    heatingMode,
    // dwh
    hotWaterTemperatureCurrent,
    hotWaterTemperatureDesired,
  ) {
    this.outdoorTemperature = outdoorTemperature;
    this.outdoorTemperatureAverage24h = outdoorTemperatureAverage24h;
    this.waterPressure = waterPressure;
    this.status = heatingMode;
    this.hotWaterTemperatureCurrent = hotWaterTemperatureCurrent;
    this.hotWaterTemperatureDesired = hotWaterTemperatureDesired;
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
      response.state.dhw?.[0]?.currentDhwTemperature ?? null,
      response.configuration.dhw?.[0]?.tappingSetpoint ?? null
    );
  }
}

module.exports = System;

