'use strict';

const axios = require('axios').default;
const Zone = require('./models/zone');
const System = require('./models/system');

module.exports = class VaillantApi {

  constructor(settings, logger) {
    this.settings = settings;
    this.logger = logger;
    this.requestClient = axios.create();
  }

  logError(error) {
    if (error.response) {
      this.logger.error('API: response exception', {
        error: JSON.stringify(error.response.data),
      });
    } else if (error.request) {
      this.logger.error('API: request exception', {
        error: JSON.stringify(error.request.data),
      });
    } else {
      this.logger.error('API: connection exception', {
        error: error.message,
      });
    }
  }

  getHeaders() {
    return {
      Authorization: 'Bearer ' + this.settings.get('accessToken'),
      'x-app-identifier': 'VAILLANT',
      'Accept-Language': 'en-GB',
      Accept: 'application/json, text/plain, */*',
      'x-client-locale': 'en-GB',
      'x-idm-identifier': 'KEYCLOAK',
      'ocp-apim-subscription-key': '1e0a2f3511fb4c5bbb1c7f9fedd20b1c',
      'User-Agent': 'myVAILLANT/21469 CFNetwork/1410.1 Darwin/22.6.0',
    };
  }

  async getHeatingSystemsList() {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/homes',
    })
      .then(async (response) => {
        this.logger.debug('API: get home', { response: JSON.stringify(response.data) });
        return response.data.map((system) => {
          return {
            id: system.systemId,
            name: system.homeName + ' (' + system.productInformation + ')',
          };
        });
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  async getSystem(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        this.logger.debug('API: get system', { response: JSON.stringify(response.data) });

        return System.mapResponse(response.data);
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  async getZones(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        this.logger.debug('API: get zone', { response: JSON.stringify(response.data) });

        return Zone.mapResponse(response.data);
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  async getZone(systemId, zoneId) {
    return await this.getZones(systemId)
      .then((zones) => zones?.find((zone) => zoneId === zone.index));
  }

  async getSystemIdentifier(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/meta-info/control-identifier'
    })
      .then((response) => {
        this.logger.debug('API: get control identifier', { response: JSON.stringify(response.data) });

        return response.data.controlIdentifier;
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  async getEnergyUsage(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/hem/' + systemId + '/mpc',
    })
      .then(async (response) => {
        this.logger.debug('API: get energy usage', { response: JSON.stringify(response.data) });

        return response.data.devices.reduce((total, device) => total + device.currentPower, 0);
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  getBaseUrl(systemId, zoneId, controlIdentifier) {
    if (controlIdentifier === 'vrc700') {
      return 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/zones/' + zoneId;
    }

    return 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId;
  }

  async setHeatingMode(systemId, zoneId, controlIdentifier, operationMode) {
    await this.requestClient({
      method: 'patch',
      headers: this.getHeaders(),
      url: this.getBaseUrl(systemId, zoneId, controlIdentifier) + '/heating-operation-mode',
      data: {
        operationMode: operationMode
      },
    })
      .then(async (response) => {
        this.logger.debug('API: patch heating mode', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

  async setQuickVeto(systemId, zoneId, temperature, durationInHours) {
    await this.requestClient({
      method: 'post',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
      data: {
        desiredRoomTemperatureSetpoint: temperature,
        duration: durationInHours
      },
    })
      .then(async (response) => {
        this.logger.debug('API: post veto', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

  async cancelQuickVeto(systemId, zoneId) {
    await this.requestClient({
      method: 'delete',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
    })
      .then(async (response) => {
        this.logger.debug('API: delete veto', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

  async setHotWaterBoost(systemId, state) {
    await this.requestClient({
      method: state ? 'post' : 'delete',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/domestic-hot-water/255/boost',
      data: {},
    })
      .then(async (response) => {
        this.logger.debug('API: ' + state + ' hot water boost', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

  async setHotWaterTemperature(systemId, temperature) {
    await this.requestClient({
      method: 'patch',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/domestic-hot-water/255/temperature',
      data: {
        setpoint: temperature
      },
    })
      .then(async (response) => {
        this.logger.debug('API: patch hot water temperature', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

  async setHeatingCircuitTemperature(systemId, temperature) {
    await this.requestClient({
      method: 'patch',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/circuit/{circuit.index}/min-flow-temperature-setpoint',
      data: {
        minFlowTemperatureSetpoint: temperature
      },
    })
      .then(async (response) => {
        this.logger.debug('API: patch heating circuit temperature', { response: JSON.stringify(response.data) });
      })
      .catch((error) => {
        this.logError(error);

        throw error;
      });
  }

};
