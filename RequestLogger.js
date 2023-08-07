// eslint-disable-next-line import/no-extraneous-dependencies
const requestPromise = require('request-promise');

const Defaults = require('./Defaults');
const TaskLogger = require('./TaskLogger');

/**
 * @description Logs start and the completion or error of an http operation performed via request-promise
 * @hideconstructor
 */
class RequestLogger {
  /**
   * @description Creates two log entries for an HTTP request using the request-promise package: 'begin' and either
   * 'end' or 'error.' See TaskLogger.execute for more information.
   *
   * @param {object} logger
   * @param {object} options request options
   * @param {function} [errorHandler]
   * @returns {Promise} Returns the value returned by requestPromise
   */
  static request(logger, options, errorHandler) {
    let { url } = options;
    if (options.qs && Object.keys(options.qs).length) url = `${url}?${JSON.stringify(options.qs)}`;

    // Strip the protocol
    const summary = `${options.method} ${url.replace(/^[^:]+:\/\//, '').substr(0, Defaults.maxMessageLength)}`;

    const begin = {
      options,
      message: `Begin: ${summary}`,
    };

    // @todo errorMessage should be a function that logs the status code in StatusCodeError
    return TaskLogger.execute(
      logger.child('http'),
      () => requestPromise(options),
      begin,
      `End: ${summary}`,
      summary,
      errorHandler,
    );
  }
}

module.exports = RequestLogger;
