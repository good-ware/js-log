/* eslint-disable no-param-reassign */
const { nanoid } = require('nanoid');

/**
 * @description Logs the start and the completion or error of a task whether synchronous or asynchronous
 * @hideconstructor
 */
class TaskLogger {
  /**
   * @description Creates two log entries for the execution of a task: 'begin' and either 'end' or 'error.'
   * 1. Creates a log entry with:
   *    a) tag: 'begin'
   *    b) tag: a newly generated unique id
   *    c) message = beginMessage
   * 2. await task() (Note: the task is not required to return a Promise). The parameter passed is a object with
   *    the properties 'logger' and 'taskId.'
   * 3. If an exception is thrown in step 2:
   *    a) If errorHandler is provided, it is called. If it returns a falsey value, go to c). Otherwise, use the
   *       return value as errorMessage.
   *    b) Logs an error with:
   *       i. error
   *       ii. tag: taskId
   *       iii. message: errorMessage
   *    c) Throws the error (thus terminating this workflow)
   * 4. Creates a log entry with:
   *    a) tag: 'end'
   *    b) tag: taskId
   *    c) message: endMessage
   * 5. Returns the value from step 2
   * @param {object} logger
   * @param {function} task A function to invoke. One argument is passed to this function: an object with the properties
   * 'logger' and 'taskId.'
   * @param {*} beginMessage A message to be logged before invoking the task
   * @param {*} endMessage A message to log when the task does not throw an exception
   * @param {*} [errorMessage] A message to log when the task throws an exception. errorMessage can be overridden by the
   * provided errorHandler.
   * @param {function} [errorHandler] A function that is invoked with the following arguments when the task throws an
   * exception:
   * 1) {Error} The exception thrown by the task
   * 2) {object} The logger argument
   * 3) {*} The errorMessage argument
   * The function returns either the message to log or a falsey value indicating nothing should be logged. The exception
   * is rethrown regardless of the return value.
   * @returns {Promise} Resolves to the value returned or rejects using exception thrown by the task
   */
  static async execute(logger, task, beginMessage, endMessage, errorMessage, errorHandler) {
    const taskId = nanoid();
    logger = logger.child(taskId);
    logger.log('begin', beginMessage);

    let result;
    try {
      result = await task({ logger, taskId });
    } catch (error) {
      let msg = errorMessage;
      if (errorHandler) msg = errorHandler(error, logger, errorMessage) || errorMessage;
      logger.log('error', msg, { error });
      throw error;
    }
    logger.log('end', endMessage || beginMessage);
    return result;
  }
}

module.exports = TaskLogger;
