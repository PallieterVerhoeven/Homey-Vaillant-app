'use strict';

const tough = require('tough-cookie');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const axios = require('axios').default;
const qs = require('qs');
const crypto = require('crypto');
const logError = require('./log-error');

const APP_VERSION = '3.7.1';
const APP_BUILD = '25262';
const USER_AGENT = 'myVAILLANT/25262 CFNetwork/1496.0.7 Darwin/23.5.0';

const IDENTITY_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'x-app-identifier': 'VAILLANT',
  'Accept-Language': 'nl-nl',
  'x-client-locale': 'nl-NL',
  'x-idm-identifier': 'KEYCLOAK',
  'x-app-version': APP_VERSION,
  'x-app-build': APP_BUILD,
  'User-Agent': USER_AGENT,
};

class ReauthenticationRequiredError extends Error {
  constructor() {
    super('Vaillant session expired. Please repair the device to log in again.');
  }
}

function getRealms(country) {
  return `vaillant-${country}-b2c`;
}

function getCodeChallenge() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return [codeVerifier, codeChallenge];
}

function extractCodeFromLocation(location) {
  if (!location) {
    return null;
  }

  const fragmentIndex = location.indexOf('#');
  const queryIndex = location.indexOf('?');

  if (fragmentIndex !== -1) {
    const fragment = location.substring(fragmentIndex + 1);
    const fragmentParams = qs.parse(fragment);
    if (fragmentParams.code) {
      return fragmentParams.code;
    }
  }

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

function getAuthUrl(realms, username, codeChallenge) {
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

function parseLoginUrl(html) {
  if (!html) {
    return null;
  }
  const matches = html.match(/action\s*=\s*"([^"]+)"/);
  if (matches && matches[1]) {
    return matches[1].replace(/&amp;/g, '&');
  }
  return null;
}

function createLoginClient() {
  return axios.create({
    withCredentials: true,
    httpsAgent: new HttpsCookieAgent({
      cookies: { jar: new tough.CookieJar() },
    }),
  });
}

module.exports = class VaillantAuthenticationClient {
  constructor(logger) {
    this.logger = logger;
  }

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

  async login(country, username, password) {
    const client = createLoginClient();
    const [codeVerifier, codeChallenge] = getCodeChallenge();
    const realms = getRealms(country);
    let code = null;

    try {
      // Step 1: Request the authorization endpoint.
      const authResponse = await client({
        method: 'GET',
        url: getAuthUrl(realms, username, codeChallenge),
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'user-agent': USER_AGENT,
          'accept-language': 'nl-nl',
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 200 || status === 302,
      });

      this.logger.debug('Auth response status', { status: authResponse.status });

      const authLocation = authResponse.headers?.location || authResponse.headers?.Location;
      if (authLocation) {
        code = extractCodeFromLocation(authLocation);
        if (code) {
          this.logger.info('Got authorization code from auth redirect');
        }
      }

      // Step 2: If no code yet, parse the login form and submit credentials.
      if (!code) {
        const loginUrl = parseLoginUrl(authResponse.data);
        if (!loginUrl) {
          this.logger.error('Login failed: could not find login form URL');
          return null;
        }

        this.logger.debug('Posting credentials to login URL', { url: loginUrl.split('?')[0] });

        const loginResponse = await client({
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

        const loginLocation = loginResponse.headers?.location || loginResponse.headers?.Location;
        this.logger.debug('Login response status', { status: loginResponse.status, location: loginLocation });

        if (!loginLocation) {
          const errorMatch = loginResponse.data?.match(/polite">\s*([^<]+)</);
          const politeError = errorMatch ? errorMatch[1].trim() : null;
          this.logger.error('Login failed: no redirect location', { error: politeError });
          return null;
        }

        code = extractCodeFromLocation(loginLocation);
        if (!code) {
          this.logger.error('Login failed: no code in redirect location', { location: loginLocation });
          return null;
        }
      }
    } catch (error) {
      logError(error, this.logger);
      return null;
    }

    // Step 3: Exchange authorization code for access token.
    try {
      const response = await client({
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://identity.vaillant-group.com/auth/realms/${realms}/protocol/openid-connect/token`,
        headers: {
          ...IDENTITY_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify({
          client_id: 'myvaillant',
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
          code,
          redirect_uri: 'enduservaillant.page.link://login',
        }),
      });

      if (response.data.access_token) {
        this.logger.info('Login successful');
        return {
          accessToken: response.data.access_token,
          accessTokenExpireAt: Date.now() + response.data.expires_in * 1000,
          refreshToken: response.data.refresh_token,
          country,
        };
      }

      this.logger.error('Login failed: no access_token in token response', { response: JSON.stringify(response.data) });
      return null;
    } catch (error) {
      logError(error, this.logger);
      if (this.isReauthenticationRequired(error)) {
        throw new ReauthenticationRequiredError();
      }
      return null;
    }
  }

  async renewToken(country, refreshToken) {
    const realms = getRealms(country);
    try {
      const response = await axios({
        method: 'post',
        url: `https://identity.vaillant-group.com/auth/realms/${realms}/protocol/openid-connect/token`,
        headers: {
          ...IDENTITY_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        data: qs.stringify({
          refresh_token: refreshToken,
          client_id: 'myvaillant',
          grant_type: 'refresh_token',
        }),
      });

      if (response.data.access_token && response.data.expires_in && response.data.refresh_token) {
        this.logger.info('Renew token successful');
        return {
          accessToken: response.data.access_token,
          accessTokenExpireAt: Date.now() + response.data.expires_in * 1000,
          refreshToken: response.data.refresh_token,
        };
      }

      this.logger.error('Renew token failed: incomplete response', { response: JSON.stringify(response.data) });
      throw new Error('Token renewal failed: incomplete response');
    } catch (error) {
      logError(error, this.logger);
      if (this.isReauthenticationRequired(error)) {
        throw new ReauthenticationRequiredError();
      }
      throw error;
    }
  }
};

module.exports.ReauthenticationRequiredError = ReauthenticationRequiredError;
