'use strict';

const axios = require('axios').default;
const Zone = require('./models/zone');
const System = require('./models/system');
const { ReauthenticationRequiredError } = require('./vaillant-authentication');
const logError = require('./log-error');

const API_URL_BASE = {
  tli: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1',
  vrc700: 'https://api.vaillant-group.com/service-connected-control/vrc700/v1',
  scf: 'https://api.vaillant-group.com/service-connected-control/scf/v1',
};

const SYSTEM_CONTROL_API_URL_BASE = 'https://api.vaillant-group.com/service-connected-control/system-control/v1';

module.exports = class VaillantApi {

  constructor(settings, logger, authentication) {
    this.settings = settings;
    this.logger = logger;
    this.authentication = authentication;
    this.requestClient = axios.create();
    this.controlIdentifiers = new Map();

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
      },
    );
  }

  logRequest(name, response) {
    this.logger.info(`API: ${name}`, {
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
      Authorization: `Bearer ${accessToken}`,
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

  getApiBase(controlIdentifier) {
    return API_URL_BASE[controlIdentifier] || API_URL_BASE.tli;
  }

  isLegacyControlIdentifier(controlIdentifier) {
    // TLI controllers use the /tli path segment; VRC700 and SCF do not.
    return controlIdentifier !== 'tli';
  }

  getSystemBaseUrl(systemId, controlIdentifier) {
    const base = this.getApiBase(controlIdentifier);
    const path = this.isLegacyControlIdentifier(controlIdentifier)
      ? `/systems/${systemId}`
      : `/systems/${systemId}/tli`;
    return `${base}${path}`;
  }

  getZoneBaseUrl(systemId, zoneId, controlIdentifier) {
    const systemBase = this.getSystemBaseUrl(systemId, controlIdentifier);
    return `${systemBase}/zones/${zoneId}`;
  }

  getDomesticHotWaterBaseUrl(systemId, controlIdentifier) {
    const systemBase = this.getSystemBaseUrl(systemId, controlIdentifier);
    return `${systemBase}/domestic-hot-water/255`;
  }

  async getHeatingSystemsList() {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: `${API_URL_BASE.tli}/homes`,
    })
      .then(async (response) => {
        this.logRequest('getHeatingSystemsList', response);
        return response.data.map((system) => {
          return {
            id: system.systemId,
            name: `${system.homeName} (${system.productInformation})`,
          };
        });
      })
      .catch((error) => this.handleError(error));
  }

  async getSystem(systemId, controlIdentifier) {
    // CONSUMED_ELECTRICAL_ENERGY
    // HEAT_GENERATED
    // EARNED_ENVIRONMENT_ENERGY

    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: this.getSystemBaseUrl(systemId, controlIdentifier),
    })
      .then(async (response) => {
        this.logRequest('getSystem', response);

        let systemData = response.data;

        // VRC700 returns camelCase keys like domesticHotWater; the rest of the
        // app expects the snake_case equivalent dhw. See myPyllant for reference.
        if (controlIdentifier === 'vrc700') {
          const raw = JSON.stringify(systemData)
            .replace(/domesticHotWater/g, 'dhw')
            .replace(/DomesticHotWater/g, 'Dhw');
          systemData = JSON.parse(raw);
        }

        return System.mapResponse(systemData);
      })
      .catch((error) => this.handleError(error));
  }

  async getZones(systemId, controlIdentifier) {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: this.getSystemBaseUrl(systemId, controlIdentifier),
    })
      .then(async (response) => {
        this.logRequest('getZones', response);

        return Zone.mapResponse(response.data);
      })
      .catch((error) => this.handleError(error));
  }

  async getZone(systemId, zoneId, controlIdentifier) {
    return await this.getZones(systemId, controlIdentifier)
      .then((zones) => zones?.find((zone) => zoneId === zone.index));
  }

  async getSystemIdentifier(systemId) {
    if (this.controlIdentifiers.has(systemId)) {
      return this.controlIdentifiers.get(systemId);
    }

    const controlIdentifier = await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: `${API_URL_BASE.tli}/systems/${systemId}/meta-info/control-identifier`,
    })
      .then((response) => {
        this.logRequest('getSystemIdentifier', response);

        return response.data.controlIdentifier;
      })
      .catch((error) => {
        this.handleError(error);
        throw error;
      });

    this.controlIdentifiers.set(systemId, controlIdentifier);
    return controlIdentifier;
  }

  async getEnergyUsage(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: await this.getHeaders(),
      url: `${API_URL_BASE.tli}/hem/${systemId}/mpc`,
    })
      .then(async (response) => {
        this.logRequest('getEnergyUsage', response);

        return response.data.devices.reduce((total, device) => total + device.currentPower, 0);
      })
      .catch((error) => this.handleError(error));
  }

  async setHeatingMode(systemId, zoneId, controlIdentifier, operationMode) {
    const url = controlIdentifier === 'vrc700'
      ? `${SYSTEM_CONTROL_API_URL_BASE}/systems/${systemId}/zones/${zoneId}/heating-operation-mode`
      : `${this.getZoneBaseUrl(systemId, zoneId, controlIdentifier)}/heating-operation-mode`;

    await this.requestClient({
      method: 'patch',
      headers: await this.getHeaders(),
      url,
      data: {
        operationMode,
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

  async setQuickVeto(systemId, zoneId, controlIdentifier, temperature, durationInHours, vetoType = 'heating') {
    const url = this.isLegacyControlIdentifier(controlIdentifier)
      ? `${this.getSystemBaseUrl(systemId, controlIdentifier)}/zone/${zoneId}/${vetoType}/quick-veto`
      : `${this.getZoneBaseUrl(systemId, zoneId, controlIdentifier)}/quick-veto`;

    await this.requestClient({
      method: 'post',
      headers: await this.getHeaders(),
      url,
      data: {
        desiredRoomTemperatureSetpoint: temperature,
        duration: durationInHours,
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

  async cancelQuickVeto(systemId, zoneId, controlIdentifier, vetoType = 'heating') {
    const url = this.isLegacyControlIdentifier(controlIdentifier)
      ? `${this.getSystemBaseUrl(systemId, controlIdentifier)}/zone/${zoneId}/${vetoType}/quick-veto`
      : `${this.getZoneBaseUrl(systemId, zoneId, controlIdentifier)}/quick-veto`;

    await this.requestClient({
      method: 'delete',
      headers: await this.getHeaders(),
      url,
    })
      .then(async (response) => {
        this.logRequest('cancelQuickVeto', response);
      })
      .catch(async (error) => {
        await this.handleError(error);

        throw error;
      });
  }

  async setHotWaterBoost(systemId, state, controlIdentifier) {
    await this.requestClient({
      method: state ? 'post' : 'delete',
      headers: await this.getHeaders(),
      url: `${this.getDomesticHotWaterBaseUrl(systemId, controlIdentifier)}/boost`,
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

  async setHotWaterTemperature(systemId, temperature, controlIdentifier) {
    const url = controlIdentifier === 'vrc700'
      ? `${SYSTEM_CONTROL_API_URL_BASE}/systems/${systemId}/domestic-hot-water/255/tapping-setpoint`
      : `${this.getDomesticHotWaterBaseUrl(systemId, controlIdentifier)}/temperature`;

    await this.requestClient({
      method: 'patch',
      headers: await this.getHeaders(),
      url,
      data: {
        setpoint: temperature,
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
      url: `${API_URL_BASE.tli}/systems/${systemId}/tli/circuit/{circuit.index}/min-flow-temperature-setpoint`,
      data: {
        minFlowTemperatureSetpoint: temperature,
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

  async yearReport(systemId, zoneId, controlIdentifier) {
    await this.requestClient({
      method: 'delete',
      headers: await this.getHeaders(),
      url: `${this.getZoneBaseUrl(systemId, zoneId, controlIdentifier)}/quick-veto`,
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
