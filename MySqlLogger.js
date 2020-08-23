const Defaults = require('./Defaults');
const TaskLogger = require('./TaskLogger');
const GeneratorLogger = require('./GeneratorLogger');

class MySql {
  /**
   * @description Sends two log entries for a Connection.query() execution:
   * 'begin' and either 'end' or 'error.' See TaskLogger.execute for a detailed
   * description. SQL statement and values are logged.
   * @param {Object} logger
   * @param {Connection} connection mysql2 Connection object
   * @param {String} sql SQL statement to execute
   * @param {*[]} [values] SQL statement placeholder arguments
   * @param {Object} [options] Additional options to send to connection.query()
   * @param {Function} [shouldLogError] Determines whether an Error object should be logged
   * @return {Promise} Resolves to the return value of connection.query(sql, values, ...options)
   */
  static async query(
      logger, connection, sql, values = [], options, shouldLogError) {
    const snippet = ` ${sql}`
                        .substr(0, 200)
                        .replace(/\s+/g, ' ')
                        .substr(0, Defaults.maxMessageLength);
    return TaskLogger.execute(
        logger.child('sql'), () => connection.query({sql, values, ...options}),
        {sql, values, message: `SQL Begin:${snippet}`}, `SQL End:${snippet}`,
        `SQL:${snippet}`, shouldLogError);
  }

  /**
   * @description Sends a 'begin' log entry. The SQL statement and values are logged. Returns the
   *  mysql (instead of the mysql2) version of connection.query() for event-based data access with
   *  additional functions for logging added (see GeneratorLogger.begin() for more information).
   * @param {Object} logger
   * @param {Object} connection mysql2 Connection object
   * @param {String} sql The SQL statement to execute
   * @param {*[]} [values] SQL statement placeholder arguments
   * @param {Object} [options] Additional options to send to connection.query()
   * @param {Function} [shouldLogError]
   * @return {Object} Returns the object returned by connection.connection.query() with additional
   *  functions for logging
   */
  static begin(logger, connection, sql, values = [], options, shouldLogError) {
    const snippet = ` ${sql}`
                        .substr(0, 200)
                        .replace(/\s+/g, ' ')
                        .substr(0, Defaults.maxMessageLength);
    const generator = connection.connection.query({sql, values, ...options});
    return GeneratorLogger.begin(
        logger.child('sql'), generator,
        {sql, values, message: `SQL Begin:${snippet}`},
        `SQL Generator:${snippet}`, `SQL End:${snippet}`, `SQL:${snippet}`,
        shouldLogError);
  }
}

module.exports = MySql;
