'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('./lib/vaillant-authentication');
const VaillantApi = require('./lib/vaillant-api');
const Logger = require('./lib/logger');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.logger = new Logger(this.homey).getLogger();
    this.logger.info('Initialize App');

    this.authentication = VaillantAuthentication.getInstance(this.homey.settings, this.logger);
    await this.authentication.renewToken(this.homey.settings.get('country'));

    if (this.homey.settings.get('loggingEnabled')) {
      await this.logSystemInformation();
    }
  }

  async logSystemInformation() {
    this.api = new VaillantApi(this.homey.settings, this.logger, this.authentication);
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
