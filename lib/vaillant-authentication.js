/* eslint-disable max-classes-per-file */

'use strict';

const tough = require('tough-cookie');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const axios = require('axios').default;
const qs = require('qs');
const crypto = require('crypto');

const APP_VERSION = '3.7.1';
const APP_BUILD = '25262';
const USER_AGENT = 'myVAILLANT/25262 CFNetwork/1496.0.7 Darwin/23.5.0';

class ReauthenticationRequiredError extends Error {

  constructor() {
    super('Vaillant session expired. Please repair the device to log in again.');
  }

}

module.exports = class VaillantAuthentication {

  static #instance = null;

  constructor(settings, logger) {
    if (VaillantAuthentication.#instance) {
      throw new Error('Use VaillantAuthentication.getInstance()');
    }

    this.settings = settings;
    this.logger = logger;
    this.cookieJar = new tough.CookieJar();
    this.myvHeader = {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': USER_AGENT,
      'accept-language': 'nl-nl',
    };

    this.requestClient = axios.create({
      withCredentials: true,
      httpsAgent: new HttpsCookieAgent({
        cookies: {
          jar: this.cookieJar,
        },
      }),
      headers: {
        'x-app-identifier': 'VAILLANT',
        'Accept-Language': 'nl-nl',
        Accept: 'application/json, text/plain, */*',
        'x-client-locale': 'nl-NL',
        'x-idm-identifier': 'KEYCLOAK',
        'x-app-version': APP_VERSION,
        'x-app-build': APP_BUILD,
        'ocp-apim-subscription-key': '1e0a2f3511fb4c5bbb1c7f9fedd20b1c',
        'User-Agent': USER_AGENT,
      },
    });

    VaillantAuthentication.#instance = this;
  }

  static getInstance(settings, logger) {
    if (!VaillantAuthentication.#instance) {
      VaillantAuthentication.#instance = new VaillantAuthentication(settings, logger);
    }
    return VaillantAuthentication.#instance;
  }

  logError(error) {
    if (error.response) {
      this.logger.error('API: response exception', {
        statusCode: error.response.status,
        error: JSON.stringify(error.response.data),
      });
    } else if (error.request) {
      this.logger.error('API: request exception', {
        error: JSON.stringify(error.request.data),
      });
    } else {
      this.logger.error('API: connection exception', {
        error: error.message,
      });
    }
  }

  isLoggedIn() {
    return this.settings.get('country') !== null
      && this.settings.get('accessToken') !== null;
  }

  getCodeChallenge() {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 64; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    const hash = crypto.createHash('sha256')
      .update(result)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return [result, hash];
  }

  getRealms(country) {
    return `vaillant-${country}-b2c`;
  }

  setAccessToken(accessToken, accessTokenExpireAt, refreshToken, country) {
    this.settings.set('accessToken', accessToken);
    this.settings.set('accessTokenExpireAt', accessTokenExpireAt);
    this.settings.set('refreshToken', refreshToken);
    this.settings.set('country', country);
  }

  async getAccessToken() {
    if (this.isLoggedIn() === false) {
      return null;
    }

    // With 1 minute margin
    if (Date.now() + 60000 >= this.settings.get('accessTokenExpireAt')) {
      this.logger.warn('Access token expired, renewing token');

      await this.renewToken(this.settings.get('country'));
    }

    return this.settings.get('accessToken');
  }

  clearAccessToken() {
    this.logger.info('Clear access token');
    this.settings.set('accessToken', null);
    this.settings.set('accessTokenExpireAt', null);
  }

  /**
   * Clears the entire session.
   * Used when Keycloak reports an invalid_grant, which means the stored
   * session cannot be recovered automatically.
   */
  clearSession() {
    this.logger.info('Clear session');
    this.settings.set('accessToken', null);
    this.settings.set('accessTokenExpireAt', null);
    this.settings.set('refreshToken', null);
  }

  /**
   * Check if the given error indicates that the stored session is unusable
   * and the user has to log in again.
   */
  isReauthenticationRequired(error) {
    if (!error) {
      return false;
    }
    if (error instanceof ReauthenticationRequiredError) {
      return true;
    }
    if (error.response && error.response.data) {
      return error.response.data.error === 'invalid_grant';
    }
    return false;
  }

  /**
   * Extract the authorization code from the redirect Location header.
   * Keycloak may return it in the query string or URL fragment.
   */
  extractCodeFromLocation(location) {
    if (!location) {
      return null;
    }

    const fragmentIndex = location.indexOf('#');
    const queryIndex = location.indexOf('?');

    // OAuth response_mode=fragment places the code after the fragment.
    if (fragmentIndex !== -1) {
      const fragment = location.substring(fragmentIndex + 1);
      const fragmentParams = qs.parse(fragment);
      if (fragmentParams.code) {
        return fragmentParams.code;
      }
    }

    // Default response_mode=query places the code in the query string.
    if (queryIndex !== -1) {
      const queryEnd = fragmentIndex !== -1 ? fragmentIndex : location.length;
      const query = location.substring(queryIndex + 1, queryEnd);
      const queryParams = qs.parse(query);
      if (queryParams.code) {
        return queryParams.code;
      }
    }

    return null;
  }

  /**
   * Build the OpenID authorization URL.
   */
  getAuthUrl(realms, username, codeChallenge) {
    const base = `https://identity.vaillant-group.com/auth/realms/${realms}/protocol/openid-connect/auth`;
    const query = qs.stringify({
      client_id: 'myvaillant',
      redirect_uri: 'enduservaillant.page.link://login',
      login_hint: username,
      response_type: 'code',
      scope: 'offline_access openid',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${base}?${query}`;
  }

  /**
   * Parse the login form action URL from the Keycloak HTML response.
   */
  parseLoginUrl(html, realms) {
    if (!html) {
      return null;
    }

    const matches = html.match(/action\s*=\s*"([^"]+)"/);
    if (matches && matches[1]) {
      return matches[1].replace(/&amp;/g, '&');
    }

    return null;
  }

  async login(
    country,
    username,
    password,
  ) {
    this.setAccessToken(
      null,
      null,
      null,
      null,
    );
    const [codeVerifier, codeChallenge] = this.getCodeChallenge();
    const realms = this.getRealms(country);

    let code = null;

    try {
      // Step 1: Request the authorization endpoint.
      // Keycloak may already redirect here if a session exists, or return HTML with the login form.
      const authResponse = await this.requestClient({
        method: 'GET',
        url: this.getAuthUrl(realms, username, codeChallenge),
        headers: this.myvHeader,
        maxRedirects: 0,
        validateStatus: (status) => status === 200 || status === 302,
      });

      this.logger.debug('Auth response status', { status: authResponse.status });

      const authLocation = authResponse.headers && (authResponse.headers.location || authResponse.headers.Location);
      if (authLocation) {
        code = this.extractCodeFromLocation(authLocation);
        if (code) {
          this.logger.info('Got authorization code from auth redirect');
        }
      }

      // Step 2: If no code yet, parse the login form and submit credentials.
      if (!code) {
        const loginUrl = this.parseLoginUrl(authResponse.data, realms);
        if (!loginUrl) {
          this.logger.error('Login failed: could not find login form URL');
          return false;
        }

        this.logger.debug('Posting credentials to login URL', { url: loginUrl.split('?')[0] });

        const loginResponse = await this.requestClient({
          method: 'POST',
          url: loginUrl,
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'content-type': 'application/x-www-form-urlencoded',
            origin: 'null',
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
            'accept-language': 'nl-nl',
          },
          data: qs.stringify({
            username,
            password,
            credentialId: '',
          }),
          maxRedirects: 0,
          validateStatus: (status) => status === 200 || status === 302,
        });

        const loginLocation = loginResponse.headers && (loginResponse.headers.location || loginResponse.headers.Location);
        this.logger.debug('Login response status', { status: loginResponse.status, location: loginLocation });

        if (!loginLocation) {
          // Keycloak returned an error page instead of redirecting.
          const errorMatch = loginResponse.data && loginResponse.data.match(/polite">\s*([^<]+)</);
          const politeError = errorMatch ? errorMatch[1].trim() : null;
          this.logger.error('Login failed: no redirect location', { error: politeError });
          return false;
        }

        code = this.extractCodeFromLocation(loginLocation);
        if (!code) {
          this.logger.error('Login failed: no code in redirect location', { location: loginLocation });
          return false;
        }
      }
    } catch (error) {
      this.logError(error);
      return false;
    }

    // Step 3: Exchange authorization code for access token.
    return this.requestClient({
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://identity.vaillant-group.com/auth/realms/${realms}/protocol/openid-connect/token`,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-app-identifier': 'VAILLANT',
        'Accept-Language': 'nl-nl',
        'x-client-locale': 'nl-NL',
        'x-idm-identifier': 'KEYCLOAK',
        'x-app-version': APP_VERSION,
        'x-app-build': APP_BUILD,
        'User-Agent': USER_AGENT,
      },
      data: qs.stringify({
        client_id: 'myvaillant',
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
        code,
        redirect_uri: 'enduservaillant.page.link://login',
      }),
    })
      .then((response) => {
        if (response.data.access_token) {
          this.logger.info('Login successful');

          this.setAccessToken(
            response.data.access_token,
            Date.now() + response.data.expires_in * 1000,
            response.data.refresh_token,
            country,
          );

          return true;
        }
        this.logger.error('Login failed: no access_token in token response', { response: JSON.stringify(response.data) });
        return false;
      })
      .catch((error) => {
        this.logError(error);
        if (this.isReauthenticationRequired(error)) {
          this.clearSession();
          throw new ReauthenticationRequiredError();
        }
        return false;
      });
  }

  async renewToken(country) {
    const realms = this.getRealms(country);
    await this.requestClient({
      method: 'post',
      url: `https://identity.vaillant-group.com/auth/realms/${realms}/protocol/openid-connect/token`,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-app-identifier': 'VAILLANT',
        'Accept-Language': 'nl-nl',
        'x-client-locale': 'nl-NL',
        'x-idm-identifier': 'KEYCLOAK',
        'x-app-version': APP_VERSION,
        'x-app-build': APP_BUILD,
        'User-Agent': USER_AGENT,
      },
      data: qs.stringify({
        refresh_token: this.settings.get('refreshToken'),
        client_id: 'myvaillant',
        grant_type: 'refresh_token',
      }),
    })
      .then((response) => {
        if (response.data.access_token && response.data.expires_in && response.data.refresh_token) {
          this.setAccessToken(
            response.data.access_token,
            Date.now() + (response.data.expires_in * 1000),
            response.data.refresh_token,
            country,
          );
          this.logger.info('Renew token successful');
        } else {
          this.logger.error('Renew token failed', { response: JSON.stringify(response.data) });
          this.clearAccessToken();
        }
      })
      .catch(async (error) => {
        this.logError(error);
        if (this.isReauthenticationRequired(error)) {
          this.clearSession();
          throw new ReauthenticationRequiredError();
        }
        this.clearAccessToken();
      });
  }

};

module.exports.ReauthenticationRequiredError = ReauthenticationRequiredError;
