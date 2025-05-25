'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('./lib/vaillant-authentication');
const VaillantApi = require('./lib/vaillant-api');
const Logger = require('./lib/logger');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Initialize App');

    this.authentication = new VaillantAuthentication(this.homey.settings, this.logger);

    await this.updateAccessToken(true);

    if (this.homey.settings.get('loggingEnabled')) {
      await this.logSystemInformation();
    }
  }

  async updateAccessToken(forceNewToken = false) {
    this.logger.info('Update access token');
    let renewIn = 300000; // 5 minutes

    if (this.authentication.isLoggedIn() || forceNewToken) {
      await this.authentication.renewToken(this.homey.settings.get('country'));
      renewIn = this.homey.settings.get('accessTokenExpireAt') - Date.now() - 60000;
    }

    // Add endless loop protection
    if (renewIn < 30000) {
      renewIn = 30000;
    }

    setTimeout(() => {
      this.updateAccessToken();
    }, renewIn);
  }

  async logSystemInformation() {
    this.api = new VaillantApi(this.homey.settings, this.logger);
    this.api.getHeatingSystemsList()
      .then((devices) => {
        if (!devices) {
          return;
        }

        for (const device of devices) {
          this.api.getSystem(device.id);
        }
      });
  }

};
