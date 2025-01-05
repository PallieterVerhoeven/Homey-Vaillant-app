'use strict';

const tough = require('tough-cookie');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const axios = require('axios').default;
const qs = require('qs');
const crypto = require('crypto');

module.exports = class VaillantAuthentication {

  constructor(settings) {
    this.settings = settings;
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
    const brand = this.brands.find(
      item => item.name === country
    );

    return brand ? brand.value + '-b2c' : null;
  }

  setAccessToken(accessToken, accessTokenExpireAt, refreshToken) {
    console.log('Save new token');
    console.log(accessToken);
    this.settings.set('accessToken', accessToken);
    this.settings.set('accessTokenExpireAt', accessTokenExpireAt);
    this.settings.set('refreshToken', refreshToken);
  }

  async getAccessToken(country) {
    if (this.settings.get('accessTokenExpireAt') - 10000 < Date.now()) {
      console.log('Token expired');
      await this.renewToken(country);
    }

    return this.settings.get('accessToken');
  }

  async login(
    country,
    username,
    password
  ) {
    const [code_verifier, codeChallenge] = this.getCodeChallenge();
    const realms = this.getRealms('netherlands');

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
        console.debug('Login page loaded');
        return res.data.split('action="')[1].split('"')[0];
      })
      .catch((error) => {
        console.error(error);
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
        console.error('Login failed no code');
        console.error(res.data.split('polite">')[1].split('<')[0].trim());
      })
      .catch((error) => {
        if (error && error.message.includes('Unsupported protocol')) {
          // console.debug(JSON.stringify(error.message));
          // console.debug(JSON.stringify(error.request._options.href));
          // console.debug(JSON.stringify(error.request._options.hash));
          return qs.parse(error.request._options.href.split('#')[1]);
        }
        console.error(error);
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
          console.info('Login successful');

          this.setAccessToken(
            response.data.access_token,
            Date.now() + response.data.expires_in * 1000,
            response.data.refresh_token
          );

          return true;
        }
      })
      .catch((error) => {
        console.error(error);
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
        'accept-language': 'de-de',
      },
      data: qs.stringify({
        refresh_token: this.settings.get('refreshToken'),
        client_id: 'myvaillant',
        grant_type: 'refresh_token',
      }),
    })
      .then((response) => {
        // console.log(JSON.stringify(response.data));

        this.setAccessToken(
          response.data.access_token,
          Date.now() + response.data.expires_in * 1000,
          response.data.refresh_token
        );
      })
      .catch(async (error) => {
        console.error(error);
      });
  }

  brands = [
    {
      'name': 'albania',
      'realms': 'vaillant-albania'
    },
    {
      'name': 'austria',
      'value': 'vaillant-austria'
    },
    {
      'name': 'belgium',
      'value': 'vaillant-belgium'
    },
    {
      'name': 'bulgaria',
      'value': 'vaillant-bulgaria'
    },
    {
      'name': 'croatia',
      'value': 'vaillant-croatia'
    },
    {
      'name': 'cyprus',
      'value': 'vaillant-cyprus'
    },
    {
      'name': 'czechrepublic',
      'value': 'vaillant-czechrepublic'
    },
    {
      'name': 'denmark',
      'value': 'vaillant-denmark'
    },
    {
      'name': 'estonia',
      'value': 'vaillant-estonia'
    },
    {
      'name': 'finland',
      'value': 'vaillant-finland'
    },
    {
      'name': 'france',
      'value': 'vaillant-france'
    },
    {
      'name': 'georgia',
      'value': 'vaillant-georgia'
    },
    {
      'name': 'germany',
      'value': 'vaillant-germany'
    },
    {
      'name': 'greece',
      'value': 'vaillant-greece'
    },
    {
      'name': 'hungary',
      'value': 'vaillant-hungary'
    },
    {
      'name': 'ireland',
      'value': 'vaillant-ireland'
    },
    {
      'name': 'italy',
      'value': 'vaillant-italy'
    },
    {
      'name': 'kosovo',
      'value': 'vaillant-kosovo'
    },
    {
      'name': 'latvia',
      'value': 'vaillant-latvia'
    },
    {
      'name': 'lithuania',
      'value': 'vaillant-lithuania'
    },
    {
      'name': 'luxembourg',
      'value': 'vaillant-luxembourg'
    },
    {
      'name': 'netherlands',
      'value': 'vaillant-netherlands'
    },
    {
      'name': 'norway',
      'value': 'vaillant-norway'
    },
    {
      'name': 'poland',
      'value': 'vaillant-poland'
    },
    {
      'name': 'portugal',
      'value': 'vaillant-portugal'
    },
    {
      'name': 'romania',
      'value': 'vaillant-romania'
    },
    {
      'name': 'serbia',
      'value': 'vaillant-serbia'
    },
    {
      'name': 'slovakia',
      'value': 'vaillant-slovakia'
    },
    {
      'name': 'slovenia',
      'value': 'vaillant-slovenia'
    },
    {
      'name': 'spain',
      'value': 'vaillant-spain'
    },
    {
      'name': 'sweden',
      'value': 'vaillant-sweden'
    },
    {
      'name': 'switzerland',
      'value': 'vaillant-switzerland'
    },
    {
      'name': 'turkiye',
      'value': 'vaillant-turkiye'
    },
    {
      'name': 'ukraine',
      'value': 'vaillant-ukraine'
    },
    {
      'name': 'unitedkingdom',
      'value': 'vaillant-unitedkingdom'
    },
    {
      'name': 'uzbekistan',
      'value': 'vaillant-uzbekistan'
    },
    {
      'name': 'austria',
      'value': 'sdbg-austria'
    },
    {
      'name': 'czechrepublic',
      'value': 'sdbg-czechrepublic'
    },
    {
      'name': 'finland',
      'value': 'sdbg-finland'
    },
    {
      'name': 'france',
      'value': 'sdbg-france'
    },
    {
      'name': 'greece',
      'value': 'sdbg-greece'
    },
    {
      'name': 'hungary',
      'value': 'sdbg-hungary'
    },
    {
      'name': 'italy',
      'value': 'sdbg-italy'
    },
    {
      'name': 'lithuania',
      'value': 'sdbg-lithuania'
    },
    {
      'name': 'luxembourg',
      'value': 'sdbg-luxembourg'
    },
    {
      'name': 'poland',
      'value': 'sdbg-poland'
    },
    {
      'name': 'portugal',
      'value': 'sdbg-portugal'
    },
    {
      'name': 'romania',
      'value': 'sdbg-romania'
    },
    {
      'name': 'slovakia',
      'value': 'sdbg-slovakia'
    },
    {
      'name': 'spain',
      'value': 'sdbg-spain'
    }
  ];

};
