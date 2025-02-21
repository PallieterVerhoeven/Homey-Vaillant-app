'use strict';

const LokiTransport = require('winston-loki');
const crypto = require('crypto');
const winston = require('winston');
const { createLogger } = require('winston');
const Homey = require('homey');

module.exports = class Logger {

  constructor(homey) {
    this.homey = homey;
    const transports = [
      new winston.transports.Console({
        level: 'info',
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ];

    if (this.homey.settings.get('loggingEnabled')) {
      transports.push(this.getLokiTransport());
    }

    this.logger = createLogger({
      transports: transports
    });
  }

  getLokiTransport() {
    if (!this.homey.settings.get('loggingId')) {
      this.homey.settings.set('loggingId', this.createLoggingId());
    }

    return new LokiTransport({
      host: Homey.env.GRAFANA_LOKI_HOST,
      basicAuth: Homey.env.GRAFANA_LOKI_TOKEN,
      interval: 60,
      json: true,
      format: winston.format.json(),
      level: 'debug',
      labels: {
        app: 'homey-vaillant',
        loggingId: this.homey.settings.get('loggingId')
      },
      onConnectionError: (err) => console.error(err),
    });
  }

  getLogger() {
    return this.logger;
  }

  createLoggingId() {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }
};
