class Zone {
  constructor(
    index,
    name,
    desiredRoomTemperatureHeating,
    desiredRoomTemperature,
    currentRoomTemperature,
    currentRoomHumidity,
    isActive,
    isCoolingAllowed,
  ) {
    this.index = index;
    this.name = name;
    this.desiredRoomTemperatureHeating = desiredRoomTemperatureHeating;
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
        state.desiredRoomTemperatureSetpointHeating,
        state.desiredRoomTemperatureSetpoint,
        state.currentRoomTemperature,
        state.currentRoomHumidity,
        state.currentSpecialFunction,
        state.heatingState,
        properties.isActive,
        properties.isCoolingAllowed,
      );
    });
  }
}

module.exports = Zone;
