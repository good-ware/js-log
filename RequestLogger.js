// eslint-disable-next-line import/no-extraneous-dependencies
const requestPromise = require('request-promise');

const Defaults = require('./Defaults');
const TaskLogger = require('./TaskLogger');

class RequestLogger {
  /**
   * @description Sends two log entries for an HTTP request using the
   * request-promise package: 'begin' and either 'end' or 'error.' See
   * TaskLogger.execute() for a more detailed description.
   *
   * @param {Object} logger
   * @param {Object} options request options
   * @param {Function} [shouldLogError]
   * @return {Promise} Value returned by request()
   */
  static request(logger, options, shouldLogError) {
    let { url } = options;
    if (options.qs && Object.keys(options.qs).length) url = `${url}?${JSON.stringify(options.qs)}`;

    // Strip the protocol
    const snippet = `${options.method} ${url.replace(/^[^:]+:\/\//, '').substr(0, Defaults.maxMessageLength)}`;

    const begin = {
      options,
      message: `Begin: ${snippet}`,
    };

    // @todo errorMessage should be a function that logs the status code in
    // StatusCodeError
    return TaskLogger.execute(
      logger.child('http'),
      () => requestPromise(options),
      begin,
      `End: ${snippet}`,
      snippet,
      shouldLogError
    );
  }
}

module.exports = RequestLogger;
