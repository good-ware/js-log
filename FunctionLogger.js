const { v1: uuidv1 } = require('uuid');

class FunctionLogger {
  /**
   * @description Sends two log entries for a function: 'begin' and either 'end' or 'error.' This function is useful for
   *  roughly measuring the duration of an operation. It does the following:
   *
   *  1. Send a log entry containing a 'begin' tag with a new uuid and the provided message
   *  2. await func()
   *  3. If await throws an exception:
   *     3a. Log the exception with the uuid
   *     3b. Rethrow the exception
   *  4. Send a log entry containing an 'end' tag with the uuid
   *  5. Return the value resolved by the Promise
   *
   * @param {Object} logger
   * @param {Function} func Function to call
   * @param {*} [beginMessage] Message to be logged before awaiting the func
   * @param {*} [endMessage] Message to be logged after successfully awaiting the func
   * @param {Function|*} [errorMessage] Message to be logged when the func throws an exception. If a function is
   *  provided, it is called with an Error object as the first parameter.
   * @param {Function} isError Optional function that accepts the exception thrown by func and returns a truthy
   *  value if the provided error object represents a failure. The exception is rethrown in either case.
   * @return {Promise} The return value of func
   */
  static async execute(logger, func, beginMessage, endMessage, errorMessage, isError) {
    const extra = { operationId: uuidv1() };

    logger.log('begin', beginMessage, extra);

    let result;
    try {
      result = await func();
    } catch (error) {
      if (isError) {
        if (isError(error)) {
          logger.log(
            'error',
            { message: typeof errorMessage === 'function' ? errorMessage(error) : errorMessage, error },
            extra
          );
        } else {
          logger.log('end', endMessage, extra);
        }
      } else {
        logger.log('error', { message: errorMessage, error }, extra);
      }
      throw error;
    }
    logger.log('end', endMessage, extra);
    return result;
  }
}

module.exports = FunctionLogger;
