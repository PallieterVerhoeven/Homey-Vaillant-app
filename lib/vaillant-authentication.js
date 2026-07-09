'use strict';

const VaillantAuthenticationStore = require('./vaillant-authentication-store');
const VaillantAuthenticationClient = require('./vaillant-authentication-client');
const { ReauthenticationRequiredError } = require('./vaillant-authentication-client');

module.exports = class VaillantAuthentication {
  constructor(settings, logger) {
    this.client = new VaillantAuthenticationClient(logger);
    this.store = new VaillantAuthenticationStore(settings, logger, this.renewToken.bind(this));
  }

  isLoggedIn() {
    return this.store.isLoggedIn();
  }

  async getAccessToken() {
    return this.store.getAccessToken();
  }

  async login(country, username, password) {
    this.store.clearAll();
    const tokens = await this.client.login(country, username, password);
    if (tokens) {
      this.store.saveToken(tokens);
      return true;
    }
    return false;
  }

  async renewToken(country) {
    const refreshToken = this.store.getRefreshToken();
    const tokens = await this.client.renewToken(country, refreshToken);
    this.store.saveToken({ ...tokens, country });
  }

  clearSession() {
    this.store.clearSession();
  }

  isReauthenticationRequired(error) {
    return this.client.isReauthenticationRequired(error);
  }
};

module.exports.ReauthenticationRequiredError = ReauthenticationRequiredError;
