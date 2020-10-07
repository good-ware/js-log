/* eslint-disable no-param-reassign */
const { v1: uuidv1 } = require('uuid');

/**
 * @description Logs the start of a generator and returns an object for logging the progress, end, and error of it
 * @hideconstructor
 */
class GeneratorLogger {
  /**
   * @description Similar to TaskLogger.execute() but is intended for generators. It creates one 'begin' log entry with:
   *  1. tag: 'begin'
   *  2. message: beginMessage
   *  3. operationId: a newly created uuid
   * and it returns an object with logging-related methods
   * @param {Object} logger
   * @param {*} beginMessage An initial message to log
   * @param {*} [endMessage] A message to be logged via end()
   * @param {*} [errorMessage] A message to be logged via error()
   * @return {Object} Returns an object with the following properties:
   *  1. {Object} logger: A child logger of 'logger' with the uuid tag
   *  2. {String} uuid
   *  and the following methods:
   *  1. error({Error} error) Log the provided error with the tag 'error'
   *  2. end({*} message) Logs endMessage and message with:
   *     a) tag: 'end'
   *     b) operationId
   */
  static begin(logger, beginMessage, endMessage, errorMessage) {
    const uuid = uuidv1();
    logger = logger.child(uuid);
    logger.log('begin', beginMessage);

    return {
      logger,
      uuid,
      end: (message) => logger.log('end', endMessage, message),
      error: (error) => logger.log('error', errorMessage, { error }),
    };
  }
}

module.exports = GeneratorLogger;
