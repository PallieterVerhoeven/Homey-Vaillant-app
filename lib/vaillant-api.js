'use strict';

const axios = require('axios').default;
const Zone = require('./models/zone');
const System = require('./models/system');
const { ReauthenticationRequiredError } = require('./vaillant-authentication');
const logError = require('./log-error');

module.exports = class VaillantApi {

  constructor(settings, logger, authentication) {
    this.settings = settings;
    this.logger = logger;
    this.authentication = authentication;
    this.requestClient = axios.create();

    // Interceptor: automatically retry once after renewing a 401 access token
    this.requestClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await this.authentication.renewToken(this.settings.get('country'));
            this.logger.info('API: Access token renewed after 401');
            const accessToken = await this.authentication.getAccessToken();
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.requestClient(originalRequest);
          } catch (renewError) {
            if (this.authentication.isReauthenticationRequired(renewError)) {
              throw renewError;
            }
            throw error;
          }
        }
        throw error;
      }
    );
  }

  logRequest(name, response) {
    this.logger.info('API: ' + name, {
      method: response.config.method,
      url: response.config.url,
      response: JSON.stringify(response.data),
    });
  }

  async handleError(error) {
    logError(error, this.logger);

    if (this.authentication.isReauthenticationRequired(error)) {
      throw new ReauthenticationRequiredError();
    }
  }

  async getHeaders() {
    const accessToken = await this.authentication.getAccessToken();

    return {
      Authorization: 'Bearer ' + accessToken,
      'x-app-identifier': 'VAILLANT',
      'Accept-Language': 'en-GB',
      Accept: 'application/json, text/plain, */*',
      'x-client-locale': 'en-GB',
      'x-idm-identifier': 'KEYCLOAK',
      'x-app-version': '3.7.1',
      'x-app-build': '25262',
      'ocp-apim-subscription-key': '1e0a2f3511fb4c5bbb1c7f9fedd20b1c',
      'User-Agent': 'myVAILLANT/25262 CFNetwork/1496.0.7 Darwin/23.5.0',
    };
  }

  async getHeatingSystemsList() {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/homes',
    })
      .then(async (response) => {
        this.logRequest('getHeatingSystemsList', response);
        return response.data.map((system) => {
          return {
            id: system.systemId,
            name: system.homeName + ' (' + system.productInformation + ')',
          };
        });
      })
      .catch((error) => this.handleError(error));
  }

  async getSystem(systemId) {
      // CONSUMED_ELECTRICAL_ENERGY
      // HEAT_GENERATED
      // EARNED_ENVIRONMENT_ENERGY

    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        this.logRequest('getSystem', response);

        return System.mapResponse(response.data);
      })
      .catch((error) => this.handleError(error));
  }

  async getZones(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        this.logRequest('getZones', response);

        return Zone.mapResponse(response.data);
      })
      .catch((error) => this.handleError(error));
  }

  async getZone(systemId, zoneId) {
    return await this.getZones(systemId)
      .then((zones) => zones?.find((zone) => zoneId === zone.index));
  }

  async getSystemIdentifier(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/meta-info/control-identifier'
    })
      .then((response) => {
        this.logRequest('getSystemIdentifier', response);

        return response.data.controlIdentifier;
      })
      .catch((error) => this.handleError(error));
  }

  async getEnergyUsage(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/hem/' + systemId + '/mpc',
    })
      .then(async (response) => {
        this.logRequest('getEnergyUsage', response);

        return response.data.devices.reduce((total, device) => total + device.currentPower, 0);
      })
      .catch((error) => this.handleError(error));
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
      headers: await this.getHeaders(),
      url: this.getBaseUrl(systemId, zoneId, controlIdentifier) + '/heating-operation-mode',
      data: {
        operationMode: operationMode
      },
    })
      .then(async (response) => {
        this.logRequest('setHeatingMode', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async setQuickVeto(systemId, zoneId, temperature, durationInHours) {
    await this.requestClient({
      method: 'post',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
      data: {
        desiredRoomTemperatureSetpoint: temperature,
        duration: durationInHours
      },
    })
      .then(async (response) => {
        this.logRequest('setQuickVeto', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async cancelQuickVeto(systemId, zoneId) {
    await this.requestClient({
      method: 'delete',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
    })
      .then(async (response) => {
        this.logRequest('cancelQuickVeto', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async setHotWaterBoost(systemId, state) {
    await this.requestClient({
      method: state ? 'post' : 'delete',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/domestic-hot-water/255/boost',
      data: {},
    })
      .then(async (response) => {
        this.logRequest('setHotWaterBoost', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async setHotWaterTemperature(systemId, temperature) {
    await this.requestClient({
      method: 'patch',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/domestic-hot-water/255/temperature',
      data: {
        setpoint: temperature
      },
    })
      .then(async (response) => {
        this.logRequest('setHotWaterTemperature', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async setHeatingCircuitTemperature(systemId, temperature) {
    await this.requestClient({
      method: 'patch',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/circuit/{circuit.index}/min-flow-temperature-setpoint',
      data: {
        minFlowTemperatureSetpoint: temperature
      },
    })
      .then(async (response) => {
        this.logRequest('setHeatingCircuitTemperature', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async yearReport(systemId, zoneId) {
    await this.requestClient({
      method: 'delete',
      headers: await this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
    })
      .then(async (response) => {
        this.logRequest('cancelQuickVeto', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

};
