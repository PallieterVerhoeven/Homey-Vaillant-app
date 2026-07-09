'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('./lib/vaillant-authentication');
const { ReauthenticationRequiredError } = require('./lib/vaillant-authentication');
const VaillantApi = require('./lib/vaillant-api');
const Logger = require('./lib/logger');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Initialize App');

    this.authentication = new VaillantAuthentication(this.homey.settings, this.logger);
    if (this.authentication.isLoggedIn()) {
      try {
        await this.authentication.renewToken(this.homey.settings.get('country'));
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          this.logger.error('Stored Vaillant session expired. Devices will be marked unavailable until repaired.');
        } else {
          throw error;
        }
      }
    } else {
      this.logger.info('No stored Vaillant session found. Skipping token renewal.');
    }

    if (this.homey.settings.get('loggingEnabled')) {
      await this.logSystemInformation();
    }
  }

  async logSystemInformation() {
    this.api = new VaillantApi(this.homey.settings, this.logger, this.authentication);
    try {
      const devices = await this.api.getHeatingSystemsList();
      if (!devices) {
        return;
      }

      for (const device of devices) {
        await this.api.getSystem(device.id);
      }
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        this.logger.error('Stored Vaillant session expired during system information refresh.');
      } else {
        throw error;
      }
    }
  }

};
