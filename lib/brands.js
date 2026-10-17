'use strict';

// Brands sharing the Vaillant Group identity platform (identity.vaillant-group.com).
// Only the Keycloak realm differs between brands: client id, redirect uri, API
// subscription key and API endpoints are shared. See myPyllant (const.py / utils.py).
const DEFAULT_BRAND = 'vaillant';

const VAILLANT_COUNTRIES = {
  albania: 'Albania',
  austria: 'Austria',
  belgium: 'Belgium',
  bosnia: 'Bosnia & Herzegovina',
  bulgaria: 'Bulgaria',
  croatia: 'Croatia',
  cyprus: 'Cyprus',
  czechrepublic: 'Czechia',
  denmark: 'Denmark',
  estonia: 'Estonia',
  finland: 'Finland',
  france: 'France',
  georgia: 'Georgia',
  germany: 'Germany',
  greece: 'Greece',
  hungary: 'Hungary',
  ireland: 'Ireland',
  italy: 'Italy',
  kosovo: 'Kosovo',
  latvia: 'Latvia',
  lithuania: 'Lithuania',
  luxembourg: 'Luxembourg',
  moldavia: 'Moldova',
  netherlands: 'Netherlands',
  'new-zealand': 'New Zealand',
  'north-macedonia': 'North Macedonia',
  norway: 'Norway',
  poland: 'Poland',
  portugal: 'Portugal',
  romania: 'Romania',
  serbia: 'Serbia',
  slovakia: 'Slovakia',
  slovenia: 'Slovenia',
  spain: 'Spain',
  sweden: 'Sweden',
  switzerland: 'Switzerland',
  turkiye: 'Turkey',
  ukraine: 'Ukraine',
  unitedkingdom: 'United Kingdom',
  uzbekistan: 'Uzbekistan',
};

const SDBG_COUNTRIES = {
  austria: 'Austria',
  czechrepublic: 'Czechia',
  finland: 'Finland',
  france: 'France',
  greece: 'Greece',
  hungary: 'Hungary',
  italy: 'Italy',
  lithuania: 'Lithuania',
  luxembourg: 'Luxembourg',
  poland: 'Poland',
  portugal: 'Portugal',
  romania: 'Romania',
  slovakia: 'Slovakia',
  spain: 'Spain',
};

const BRANDS = {
  vaillant: {
    id: 'vaillant',
    name: 'Vaillant',
    appName: 'myVAILLANT',
    countries: VAILLANT_COUNTRIES,
  },
  sdbg: {
    id: 'sdbg',
    name: 'Saunier Duval',
    appName: 'MiGo Link',
    countries: SDBG_COUNTRIES,
  },
};

function normalizeBrand(brand) {
  return BRANDS[brand] ? brand : DEFAULT_BRAND;
}

function getBrand(brand) {
  return BRANDS[normalizeBrand(brand)];
}

function getRealm(brand, country) {
  return `${normalizeBrand(brand)}-${country}-b2c`;
}

module.exports = {
  BRANDS,
  DEFAULT_BRAND,
  normalizeBrand,
  getBrand,
  getRealm,
};
