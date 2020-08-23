const {v1: uuidv1} = require('uuid');

class TaskLogger {
  /**
   * @description Sends two log entries for a function: 'begin' and either 'end'
   * or 'error.' This is useful for roughly measuring the duration of a
   * function. The provided function optionally return a Promise.
   *
   *  1. Send a log entry containing a 'begin' tag with a new uuid and the
   * provided message
   *  2. await task()
   *  3. If an exception is thrown:
   *     3a. Log the exception with the uuid
   *     3b. Rethrow the exception
   *  4. Send a log entry containing an 'end' tag with the uuid
   *  5. Return the value returned by step 2
   * @param {Object} logger
   * @param {Function} task Function to call
   * @param {*} [beginMessage] Message to be logged before calling task
   * @param {*} [endMessage] Message to be logged after successfully calling or
   *     awaiting task
   * @param {Function|*} [errorMessage] Message to be logged when the task
   *     throws an exception. If a
   *  function is provided, it is called with an Error object as the first
   * parameter.
   * @param {Function} shouldLogError Optional function that accepts the
   *     exception thrown by task and
   *  returns a truthy value if the provided error object represents a failure.
   * The exception is rethrown in either case.
   * @return {Promise} The return value of task
   */
  static async execute(
      logger, task, beginMessage, endMessage, errorMessage, shouldLogError) {
    const extra = {operationId: uuidv1()};

    logger.log('begin', beginMessage, extra);

    let result;
    try {
      result = await task();
    } catch (error) {
      if (shouldLogError) {
        if (shouldLogError(error)) {
          logger.log(
              'error', {
                message: typeof errorMessage === 'function' ?
                    errorMessage(error) :
                    errorMessage,
                error
              },
              extra);
        } else {
          logger.log('end', endMessage, extra);
        }
      } else {
        logger.log('error', {message: errorMessage, error}, extra);
      }
      throw error;
    }
    logger.log('end', endMessage, extra);
    return result;
  }
}

module.exports = TaskLogger;
