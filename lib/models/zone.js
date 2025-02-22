const OperationMode = require('./enum');

class Zone {
  constructor(
    index,
    name,
    heatingMode,
    desiredRoomTemperature,
    currentRoomTemperature,
    currentRoomHumidity,
    isActive,
    isCoolingAllowed,
  ) {
    this.index = index;
    this.name = name;
    this.heatingMode = heatingMode;
    this.desiredRoomTemperature = desiredRoomTemperature;
    this.currentRoomTemperature = currentRoomTemperature;
    this.currentRoomHumidity = currentRoomHumidity;
    this.isActive = isActive;
    this.isCoolingAllowed = isCoolingAllowed;
  }

  static mapResponse(response) {
    return response.state.zones.map((state) => {
      const index = state.index;
      const properties = response.properties.zones.find(z => z.index === index) || {};
      const configuration = response.configuration.zones.find(z => z.index === index) || {};

      return new Zone(
        index,
        configuration.general.name,
        configuration.heating.operationModeHeating,
        state.desiredRoomTemperatureSetpoint,
        state.currentRoomTemperature,
        state.currentRoomHumidity,
        properties.isActive,
        properties.isCoolingAllowed,
      );
    });
  }
}

module.exports = Zone;
