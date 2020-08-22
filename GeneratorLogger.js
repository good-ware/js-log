/* eslint-disable no-param-reassign */
const { v1: uuidv1 } = require('uuid');

class GeneratorLogger {
  /**
   * @description This is similar to FunctionLogger.execute() but is intended for generators. It sends one 'begin'
   *  log entry and returns an object with three methods: status(), error(), and success(). These methods must be called
   *  manually upon success or error. They generate the same log entries as FunctionLogger.execute() (such as, with the
   *  same uuid used in the 'begin' entry). status() is intended for logging messages as data is processed and accepts
   *  an optional string or object to send to the logger. The  object also has a property 'statusMessage' that is used
   *  by status().
   * @param {Object} logger
   * @param {Object} generator Methods are added to this object. It is returned.
   * @param {*} [beginMessage] Message to be logged first
   * @param {*} [endMessage] Message to be logged via generator.success()
   * @param {Function|*} [errorMessage] Message to be logged when via generator.error(). If a function is provided,
   *  it is called with the Error object as the first parameter.
   * @param {Function} [isError]
   * @return {Object} See description
   */
  static begin(logger, generator, beginMessage, endMessage, errorMessage, isError) {
    const extra = { operationId: uuidv1() };

    generator.success = () => logger.log('end', endMessage, extra);
    generator.status = (message) => logger.log(null, message, extra);
    generator.error = (error) => {
      if (isError) {
        if (isError(error)) {
          logger.log(
            'error',
            { message: typeof errorMessage === 'function' ? errorMessage(error) : errorMessage, error },
            extra
          );
        } else {
          logger.log('end', endMessage);
        }
      } else {
        logger.log('error', { message: errorMessage, error }, extra);
      }
    };

    logger.log('begin', beginMessage, extra);
    return generator;
  }
}

module.exports = GeneratorLogger;
