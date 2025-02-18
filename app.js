'use strict';

const Homey = require('homey');
const VaillantAuthentication = require('./lib/vaillant-authentication');

module.exports = class MyApp extends Homey.App {

  async onInit() {
    this.log('MyApp has been initialized');

    await this.setDefaultCountry();

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

  async setDefaultCountry() {
    if (!this.homey.settings.get('country')) {
      const country = await this.mapCountryCodeToCountryName(this.homey.system.getInfo().country);
      this.homey.settings.set('country', country);
    }
  }

  async mapCountryCodeToCountryName(countryCode) {
    const countryMap = {
      'AL': 'albania',
      'AT': 'austria',
      'BE': 'belgium',
      'BG': 'bulgaria',
      'HR': 'croatia',
      'CY': 'cyprus',
      'CZ': 'czechrepublic',
      'DK': 'denmark',
      'EE': 'estonia',
      'FI': 'finland',
      'FR': 'france',
      'GE': 'georgia',
      'DE': 'germany',
      'GR': 'greece',
      'HU': 'hungary',
      'IE': 'ireland',
      'IT': 'italy',
      'XK': 'kosovo',
      'LV': 'latvia',
      'LT': 'lithuania',
      'LU': 'luxembourg',
      'NL': 'netherlands',
      'NO': 'norway',
      'PL': 'poland',
      'PT': 'portugal',
      'RO': 'romania',
      'RS': 'serbia',
      'SK': 'slovakia',
      'SI': 'slovenia',
      'ES': 'spain',
      'SE': 'sweden',
      'CH': 'switzerland',
      'TR': 'turkiye',
      'UA': 'ukraine',
      'GB': 'unitedkingdom',
      'UZ': 'uzbekistan'
    };

    return countryMap[countryCode.toUpperCase()] || null;
  }

};
