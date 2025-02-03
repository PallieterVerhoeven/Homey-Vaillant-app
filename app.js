'use strict';

const Homey = require('homey');

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');


    // this.updateInterval = setInterval(() => {
    //   this.updateZone();
    // }, 60000); // 60 seconds
    //
    // if (this.homey.settings.get('accessToken') && this.settings.get('accessTokenExpireAt') - 10000 < Date.now()) {
    //   console.log('Token expired');
    //   await this.updateAccessToken();
    // }
  }

  // async updateAccessToken() {
  //   if (this.homey.settings.get('accessToken') && this.settings.get('accessTokenExpireAt') - 10000 < Date.now()) {
  //     console.log('Token expired');
  //     await this.renewToken('netherlands');
  //   }
  // }

};
