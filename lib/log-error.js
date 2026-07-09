'use strict';

function getCallerStack() {
  const lines = new Error().stack.split('\n');
  // Remove the first two lines: "Error" + the "logError" frame.
  lines.shift();
  lines.shift();
  return lines.join('\n').trim();
}

module.exports = function logError(error, logger) {
  const stacktrace = getCallerStack();

  if (error.response) {
    const context = {
      statusCode: error.response.status,
      error: JSON.stringify(error.response.data),
      stacktrace,
    };
    const config = error.response.config;
    if (config && config.method) context.method = config.method;
    if (config && config.url) context.url = config.url;
    logger.error('API: response exception', context);
  } else if (error.request) {
    const context = {
      stacktrace,
    };
    const req = error.request;
    if (req._options && req._options.method) context.method = req._options.method;
    if (req._currentUrl) context.url = req._currentUrl;
    context.error = error.message || JSON.stringify(req.data);
    logger.error('API: request exception', context);
  } else {
    logger.error('API: connection exception', {
      error: error.message,
      stacktrace,
    });
  }
};
