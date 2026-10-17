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
    this.logger.info('Selected provider', { brand: this.authentication.getSelectedBrand().id });

    // The provider may have been changed while the app was not running.
    this.authentication.clearSessionIfBrandChanged();

    this.homey.settings.on('set', (key) => {
      if (key === 'brand') {
        this.onBrandChanged()
          .catch((error) => this.logger.error('Error handling provider change', { error: error.message || error }));
      }
    });

    if (this.authentication.isLoggedIn()) {
      try {
        await this.authentication.renewToken(this.homey.settings.get('country'));
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          this.logger.error('Stored session expired. Devices will be marked unavailable until repaired.');
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

  async onBrandChanged() {
    if (!this.authentication.clearSessionIfBrandChanged()) {
      return;
    }

    const { name } = this.authentication.getSelectedBrand();
    const message = `Provider changed to ${name}. Please repair the device to log in again.`;
    await this.forEachDevice((device) => device.setUnavailable(message));
  }

  /**
   * The session is shared by all devices: after a successful (re)login, mark every device
   * available again instead of waiting for each device's next poll.
   */
  async setAllDevicesAvailable() {
    await this.forEachDevice((device) => device.setAvailable());
  }

  async forEachDevice(fn) {
    const devices = Object.values(this.homey.drivers.getDrivers())
      .flatMap((driver) => driver.getDevices());
    await Promise.all(devices.map((device) => Promise.resolve()
      .then(() => fn(device))
      .catch((error) => this.logger.error('Error updating device availability', { error: error?.message || error }))));
  }

  async logSystemInformation() {
    this.api = new VaillantApi(this.homey.settings, this.logger, this.authentication);
    try {
      const devices = await this.api.getHeatingSystemsList();
      if (!devices) {
        return;
      }

      for (const device of devices) {
        const controlIdentifier = await this.api.getSystemIdentifier(device.id);
        await this.api.getSystem(device.id, controlIdentifier);
      }
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        this.logger.error('Stored session expired during system information refresh.');
      } else {
        throw error;
      }
    }
  }

};
