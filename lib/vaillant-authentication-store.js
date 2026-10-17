'use strict';

const { DEFAULT_BRAND, normalizeBrand } = require('./brands');

module.exports = class VaillantAuthenticationStore {
  constructor(settings, logger, renewTokenFn) {
    this.settings = settings;
    this.logger = logger;
    this.renewTokenFn = renewTokenFn;
  }

  isLoggedIn() {
    return this.settings.get('country') !== null
      && this.settings.get('accessToken') !== null;
  }

  async getAccessToken() {
    if (!this.isLoggedIn()) {
      return null;
    }

    // With 1 minute margin
    if (Date.now() + 60000 >= this.settings.get('accessTokenExpireAt')) {
      this.logger.warn('Access token expired, renewing token');
      await this.renewTokenFn(this.settings.get('country'));
    }

    return this.settings.get('accessToken');
  }

  getRefreshToken() {
    return this.settings.get('refreshToken');
  }

  /**
   * Brand selected by the user in the app settings, used for new logins.
   */
  getSelectedBrand() {
    return normalizeBrand(this.settings.get('brand'));
  }

  /**
   * Brand the current session was created with. Sessions created before
   * brand support existed are Vaillant sessions.
   */
  getSessionBrand() {
    return normalizeBrand(this.settings.get('sessionBrand') || DEFAULT_BRAND);
  }

  saveToken({
    accessToken, accessTokenExpireAt, refreshToken, country, brand,
  }) {
    this.settings.set('accessToken', accessToken);
    this.settings.set('accessTokenExpireAt', accessTokenExpireAt);
    this.settings.set('refreshToken', refreshToken);
    this.settings.set('country', country);
    if (brand) {
      this.settings.set('sessionBrand', normalizeBrand(brand));
    }
  }

  clearSession() {
    this.logger.info('Clear session');
    this.settings.set('accessToken', null);
    this.settings.set('accessTokenExpireAt', null);
    this.settings.set('refreshToken', null);
  }

  clearAll() {
    this.clearSession();
    this.settings.set('country', null);
    this.settings.set('sessionBrand', null);
  }
};
