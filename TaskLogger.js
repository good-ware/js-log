const { v1: uuidv1 } = require('uuid');

class TaskLogger {
  /**
   * @description Creates two log entries for the execution of a task: 'begin' and either 'end' or 'error.' This can be
   *  use to roughly measure the duration of a task. It performs the following actions:
   *  1. Creates a log entry with:
   *     a) tag: 'begin'
   *     b) beginMessage
   *     c) operationId: a newly generated uuid
   *  2. await task() (Note: the task is not requred to return a Promise)
   *  3. If an exception is thrown in step 2:
   *     a) If errorHandler is provided, it is called. If it returns a falsey value, go to c). Otherwise, use the
   *        return value as errorMessage.
   *     b) Logs an error with:
   *        i. error
   *        ii. errorMessage
   *        iii. operationId: the uuid
   *     c) Throws the error (thus terminating this workflow)
   *  4. Creates a log entry with:
   *     a) tag: 'end'
   *     b) endMessage
   *     c) operationId: the uuid
   *  5. Returns the value from step 2
   * @param {Object} logger
   * @param {Function} task A function to invoke with logger as the first parameter
   * @param {*} beginMessage A message to be logged before invoking the task
   * @param {*} endMessage A message to log when the task does not throw an exception
   * @param {*} [errorMessage] A message to log when the task throws an exception. errorMessage can be overridden by
   *  the provided errorHandler.
   * @param {Function} [errorHandler] A function that is invoked with the following arguments when the task throws an
   *  exception:
   *  1) The exception thrown by the task
   *  2) logger
   *  3) errorMessage
   *  The function returns either the message to log or a falsey value indicating nothing should be logged. The
   *  exception is rethrown regardless of the return value.
   * @return {Promise} Resolves to the value returned or the exception thrown by the task
   */
  static async execute(logger, task, beginMessage, endMessage, errorMessage, errorHandler) {
    // eslint-disable-next-line no-param-reassign
    logger = logger.child(null, { operationId: uuidv1() });
    logger.log('begin', beginMessage);

    let result;
    try {
      result = await task(logger);
    } catch (error) {
      let msg = errorMessage;
      if (errorHandler) msg = errorHandler(error, logger, errorMessage);
      if (msg) logger.log('end', msg, { error });
    }
    logger.log('end', endMessage);
    return result;
  }
}

module.exports = TaskLogger;
