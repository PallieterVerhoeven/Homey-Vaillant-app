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

      // Not sure what the frost protection temperature is, but probably something like 5°C
      let desiredRoomTemperature = 5;

      // controlIdentifier: tli
      if (configuration.heating.operationModeHeating === OperationMode.MANUAL) {
        desiredRoomTemperature = configuration.heating.manualModeSetpointHeating;
      } else if (configuration.heating.operationModeHeating === OperationMode.TIME_CONTROLLED) {
        desiredRoomTemperature = getDesiredTemperatureFromProgram(
          configuration.heating.timeProgramHeating,
          configuration.heating.setBackTemperature
        );
      }
      // controlIdentifier: vrc700
      if (configuration.heating.operationModeHeating === OperationMode.SET_BACK) {
        desiredRoomTemperature = configuration.heating.setBackTemperature;
      } else if (configuration.heating.operationModeHeating === OperationMode.DAY) {
        desiredRoomTemperature = configuration.heating.dayTemperatureHeating;
      } else if (configuration.heating.operationModeHeating === OperationMode.AUTO) {
        desiredRoomTemperature = getDesiredTemperatureFromProgramVrc700(
          configuration.heating.timeProgramHeating,
          configuration.heating.setBackTemperature,
          configuration.heating.dayTemperatureHeating
        );
      }

      return new Zone(
        index,
        configuration.general.name,
        configuration.heating.operationModeHeating,
        desiredRoomTemperature,
        state.currentRoomTemperature,
        state.currentRoomHumidity,
        properties.isActive,
        properties.isCoolingAllowed,
      );
    });
  }
}

const getDesiredTemperatureFromProgram = (timeProgramHeating, setBackTemperature) => {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Time in minutes since midnight
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = days[now.getDay()];
  const dayProgram = timeProgramHeating[currentDay.toLowerCase()];

  for (const slot of dayProgram) {
    if (currentTime >= slot.startTime && currentTime < slot.endTime) {
      return slot.setpoint;
    }
  }

  return setBackTemperature;
};

const getDesiredTemperatureFromProgramVrc700 = (timeProgramHeating, setBackTemperature, dayTemperatureHeating) => {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Time in minutes since midnight
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = days[now.getDay()];
  const dayProgram = timeProgramHeating[currentDay.toLowerCase()];

  for (const slot of dayProgram) {
    if (currentTime >= slot.startTime && currentTime < slot.endTime) {
      return dayTemperatureHeating;
    }
  }

  return setBackTemperature;
};

module.exports = Zone;
