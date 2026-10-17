'use strict';

const VaillantAuthenticationStore = require('./vaillant-authentication-store');
const VaillantAuthenticationClient = require('./vaillant-authentication-client');
const { ReauthenticationRequiredError } = require('./vaillant-authentication-client');
const { getBrand } = require('./brands');

module.exports = class VaillantAuthentication {
  constructor(settings, logger) {
    this.logger = logger;
    this.client = new VaillantAuthenticationClient(logger);
    this.store = new VaillantAuthenticationStore(settings, logger, this.renewToken.bind(this));
    this.renewTokenPromise = null;
  }

  isLoggedIn() {
    return this.store.isLoggedIn();
  }

  async getAccessToken() {
    return this.store.getAccessToken();
  }

  /**
   * Brand (provider) selected in the app settings, with its display name and supported countries.
   */
  getSelectedBrand() {
    return getBrand(this.store.getSelectedBrand());
  }

  /**
   * A session is bound to the realm (brand + country) it was created in. When the user
   * switches provider in the app settings, drop the session so devices ask for a repair.
   * Returns true when the session was cleared.
   */
  clearSessionIfBrandChanged() {
    if (!this.isLoggedIn()) {
      return false;
    }

    const sessionBrand = this.store.getSessionBrand();
    const selectedBrand = this.store.getSelectedBrand();
    if (sessionBrand === selectedBrand) {
      return false;
    }

    this.logger.info('Provider changed, clearing session', { sessionBrand, selectedBrand });
    this.store.clearSession();
    return true;
  }

  async login(country, username, password) {
    const brand = this.store.getSelectedBrand();
    this.store.clearAll();
    const tokens = await this.client.login(brand, country, username, password);
    if (tokens) {
      this.store.saveToken(tokens);
      return true;
    }
    return false;
  }

  async renewToken(country) {
    if (this.renewTokenPromise) {
      return this.renewTokenPromise;
    }

    const refreshToken = this.store.getRefreshToken();
    if (!refreshToken) {
      // No session (never logged in, or cleared after a provider switch): a new login is required.
      throw new ReauthenticationRequiredError();
    }

    const brand = this.store.getSessionBrand();
    this.renewTokenPromise = this.client.renewToken(brand, country, refreshToken)
      .then((tokens) => {
        // The session may have been cleared (provider switch) or replaced (new login) while
        // the request was in flight: never resurrect a stale session.
        if (this.store.getRefreshToken() !== refreshToken) {
          this.logger.info('Session changed during token renewal, discarding renewed tokens');
          return;
        }
        this.store.saveToken({ ...tokens, country, brand });
      });

    try {
      await this.renewTokenPromise;
    } finally {
      this.renewTokenPromise = null;
    }
  }

  clearSession() {
    this.store.clearSession();
  }

  isReauthenticationRequired(error) {
    return this.client.isReauthenticationRequired(error);
  }
};

module.exports.ReauthenticationRequiredError = ReauthenticationRequiredError;
