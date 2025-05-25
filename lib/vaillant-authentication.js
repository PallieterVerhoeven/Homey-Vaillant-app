'use strict';

const tough = require('tough-cookie');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const axios = require('axios').default;
const qs = require('qs');
const crypto = require('crypto');

module.exports = class VaillantAuthentication {

  constructor(settings, logger) {
    this.settings = settings;
    this.logger = logger;
    this.cookieJar = new tough.CookieJar();
    this.myvHeader = {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'myVAILLANT/11835 CFNetwork/1240.0.4 Darwin/20.6.0',
      'x-okta-user-agent-extended': 'okta-auth-js/5.4.1 okta-react-native/2.7.0 react-native/>=0.70.1 ios/14.8 nodejs/undefined',
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
        'ocp-apim-subscription-key': '1e0a2f3511fb4c5bbb1c7f9fedd20b1c',
        'User-Agent': 'myVAILLANT/20034 CFNetwork/1240.0.4 Darwin/20.6.0',
      },
    });
  }

  logError(error) {
    if (error.response) {
      this.logger.error('API: response exception', {
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
    let hash = '';
    let result = '';
    const chars = '0123456789abcdef';
    result = '';
    for (let i = 64; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    hash = crypto.createHash('sha256')
      .update(result)
      .digest('base64');
    hash = hash.replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return [result, hash];
  }

  getRealms(country) {
    return 'vaillant-' + country + '-b2c';
  }

  setAccessToken(accessToken, accessTokenExpireAt, refreshToken, country) {
    this.settings.set('accessToken', accessToken);
    this.settings.set('accessTokenExpireAt', accessTokenExpireAt);
    this.settings.set('refreshToken', refreshToken);
    this.settings.set('country', country);
  }

  clearAccessToken() {
    this.logger.info('Clear access token');
    this.settings.set('accessToken', null);
    this.settings.set('accessTokenExpireAt', null);
  }

  async login(
    country,
    username,
    password
  ) {
    this.setAccessToken(
      null,
      null,
      null,
      null,
    );
    const [code_verifier, codeChallenge] = this.getCodeChallenge();
    const realms = this.getRealms(country);

    let loginUrl = await this.requestClient({
      method: 'GET',
      url:
        'https://identity.vaillant-group.com/auth/realms/' +
        realms +
        '/protocol/openid-connect/auth?client_id=myvaillant&redirect_uri=enduservaillant.page.link%3A%2F%2Flogin&login_hint=' +
        username +
        '&response_mode=fragment&response_type=code&scope=offline_access%20openid&code_challenge=' +
        codeChallenge +
        '&code_challenge_method=S256',
      headers: this.myvHeader,
    })
      .then((res) => {
        return res.data.split('action="')[1].split('"')[0];
      })
      .catch((error) => {
        this.logError(error);
      });

    if (!loginUrl) {
      return;
    }

    loginUrl = loginUrl.replace(/&amp;/g, '&');

    const response = await this.requestClient({
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
        username: username,
        password: password,
        credentialId: ''
      }),
    })
      .then((res) => {
        // console.debug(JSON.stringify(res.data));
        this.logger.error('Login failed no code', { error: res.data.split('polite">')[1].split('<')[0].trim() });
      })
      .catch((error) => {
        if (error && error.message.includes('Unsupported protocol')) {
          // console.debug(JSON.stringify(error.message));
          // console.debug(JSON.stringify(error.request._options.href));
          // console.debug(JSON.stringify(error.request._options.hash));
          return qs.parse(error.request._options.href.split('#')[1]);
        }
        this.logError(error);
      });

    if (!response || !response.code) {
      return;
    }

    return await this.requestClient({
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://identity.vaillant-group.com/auth/realms/' + realms + '/protocol/openid-connect/token',
      headers: {
        Host: 'identity.vaillant-group.com',
        Accept: 'application/json, text/plain, */*',
        'x-app-identifier': 'VAILLANT',
        'Accept-Language': 'nl-nl',
        'x-client-locale': 'nl-NL',
        'x-idm-identifier': 'KEYCLOAK',
        'User-Agent': 'myVAILLANT/21469 CFNetwork/1410.1 Darwin/22.6.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        client_id: 'myvaillant',
        grant_type: 'authorization_code',
        code_verifier: code_verifier,
        code: response.code,
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
            country
          );

          return true;
        }
      })
      .catch((error) => {
        this.logError(error);
      });
  }

  async renewToken(country) {
    const realms = this.getRealms(country);
    await this.requestClient({
      method: 'post',
      url: 'https://identity.vaillant-group.com/auth/realms/' + realms + '/protocol/openid-connect/token',
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'user-agent': 'okta-react-native/2.7.0 okta-oidc-ios/3.11.2 react-native/>=0.70.1 ios/14.8',
        'accept-language': 'en-gb',
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
            country
          );
        } else {
          this.logger.error('Renew token failed', { response: JSON.stringify(response.data) });
          this.clearAccessToken();
        }
      })
      .catch(async (error) => {
        this.logError(error);
        this.clearAccessToken();
        // this.logger.error('Renew token failed', error.cause);
        // console.log(error.config.method);
        // console.log(error.config.url);
        // console.log(error.config.data);
        // this.logger.error(error);
      });
  }
};
