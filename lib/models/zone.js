const OperationMode = require('./enum');

class Zone {
  constructor(
    index,
    name,
    heatingMode,
    coolingMode,
    desiredRoomTemperature,
    currentRoomTemperature,
    currentRoomHumidity,
    isActive,
    isCoolingEnabled,
  ) {
    this.index = index;
    this.name = name;
    this.heatingMode = heatingMode;
    this.coolingMode = coolingMode;
    this.desiredRoomTemperature = desiredRoomTemperature > 0
      ? desiredRoomTemperature
      : (currentRoomTemperature ?? desiredRoomTemperature);
    this.currentRoomTemperature = currentRoomTemperature;
    this.currentRoomHumidity = currentRoomHumidity;
    this.isActive = isActive;
    this.isCoolingEnabled = isCoolingEnabled;
  }

  static mapResponse(response) {
    return response.state.zones.map((state) => {
      const index = state.index;
      const properties = response.properties.zones.find(z => z.index === index) || {};
      const configuration = response.configuration.zones.find(z => z.index === index) || {};
      const isCoolingEnabled = Object.keys(configuration.cooling || {}).length > 0;

      return new Zone(
        index,
        configuration.general.name,
        configuration.heating.operationModeHeating,
        configuration.cooling?.operationModeCooling,
        state.desiredRoomTemperatureSetpoint,
        state.currentRoomTemperature,
        state.currentRoomHumidity,
        properties.isActive,
        isCoolingEnabled,
      );
    });
  }
}

module.exports = Zone;
