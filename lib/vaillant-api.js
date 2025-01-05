'use strict';

const axios = require('axios').default;
const Zone = require('./models/zone');
const System = require('./models/system');

module.exports = class VaillantApi {

  constructor(accessToken) {
    this.accessToken = accessToken;
    this.requestClient = axios.create();
  }

  setAccessToken(accessToken) {
    this.accessToken = accessToken;
  }

  getHeaders() {
    return {
      Authorization: 'Bearer ' + this.accessToken,
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
        return System.mapResponse(response.data);
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

  async getZone(systemId, zoneIndex) {
    return await this.requestClient({
      method: 'get',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli',
    })
      .then(async (response) => {
        return Zone
          .mapResponse(response.data)
          .find((zone) => zoneIndex === zone.index);
      })
      .catch((error) => {
        console.error(error);
      });
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

  async setQuickVeto(systemId, temperature, durationInHours) {
    await this.requestClient({
      method: 'post',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/0/quick-veto',
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

  async cancelQuickVeto(systemId) {
    await this.requestClient({
      method: 'delete',
      headers: this.getHeaders(),
      url: 'https://api.vaillant-group.com/service-connected-control/end-user-app-api/v1/systems/' + systemId + '/tli/zones/0/quick-veto',
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
