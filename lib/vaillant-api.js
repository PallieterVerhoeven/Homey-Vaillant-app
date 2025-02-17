'use strict';

const axios = require('axios').default;
const Zone = require('./models/zone');
const System = require('./models/system');

module.exports = class VaillantApi {

  constructor(settings) {
    this.settings = settings;
    this.requestClient = axios.create();
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
        return response.data.map((system) => {
          return {
            id: system.systemId,
            name: system.homeName + ' (' + system.productInformation + ')',
          };
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async getSystem(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        const system = System.mapResponse(response.data);
        console.log(system);

        return system;
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async getZones(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        return Zone.mapResponse(response.data);
      })
      .catch((error) => {
        console.error(error);
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
      url:
        'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' +
        systemId +
        '/meta-info/control-identifier'
    })
      .then((response) => {
        return response.data.controlIdentifier;
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async getEnergyUsage(systemId) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/hem/' + systemId + '/mpc',
    })
      .then(async (response) => {
        return response.data.devices.reduce((total, device) => total + device.currentPower, 0);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async setQuickVeto(systemId, zoneId, temperature, durationInHours) {
    console.log( this.getHeaders());
    await this.requestClient({
      method: 'post',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
      data: {
        'desiredRoomTemperatureSetpoint': temperature,
        'duration': durationInHours
      },
    })
      .then(async (response) => {
        console.log(response.data);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  async cancelQuickVeto(systemId, zoneId) {
    await this.requestClient({
      method: 'delete',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/' + zoneId + '/quick-veto',
    })
      .then(async (response) => {
        console.log(response.data);
      })
      .catch((error) => {
        console.error(error);
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
        console.log(response.data);
      })
      .catch((error) => {
        console.error(error);
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
        console.log(response.data);
      })
      .catch((error) => {
        console.error(error);
      });
  }

};
