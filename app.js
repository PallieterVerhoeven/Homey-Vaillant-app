'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('./lib/vaillant-authentication');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.log('MyApp has been initialized');

    this.authentication = new VaillantAuthentication(this.homey.settings);
    await this.updateAccessToken();
  }

  async updateAccessToken() {
    let renewIn = 300000; // 5 minutes

    if (this.homey.settings.get('accessToken')) {
      await this.authentication.renewToken('netherlands');
      renewIn = this.homey.settings.get('accessTokenExpireAt') - Date.now() - 60000;
    }

    setTimeout(() => {
      console.log('updateAccessToken()');
      this.updateAccessToken();
    }, renewIn);
  }

};
