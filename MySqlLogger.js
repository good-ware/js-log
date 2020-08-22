const Defaults = require('./LoggerDefaults');
const FunctionLogger = require('./FunctionLogger');
const GeneratorLogger = require('./GeneratorLogger');

class MySql {
  /**
   * @description Sends two log entries for a Connection.query() execution: 'begin' and either 'end' or 'error.' See
   *  FunctionLogger.execute for a detailed description. SQL statement and values are logged.
   * @param {Object} logger
   * @param {Object} connection mysql2 Connection with func wrapper
   * @param {String} sql SQL statement to execute
   * @param {Array} [values] SQL statement placeholder arguments
   * @param {Object} [options] Additional options to send to connection.query()
   * @param {Function} [isError]
   * @return {Promise} The return value of connection.query(sql, values, ...options)
   */
  static async query(logger, connection, sql, values = [], options, isError) {
    const snippet = ` ${sql}`.substr(0, 200).replace(/\s+/g, ' ').substr(0, Defaults.maxMessageLength);
    return FunctionLogger.execute(
      logger.child('sql'),
      () => connection.query({ sql, values, ...options }),
      { sql, values, message: `SQL Begin:${snippet}` },
      `SQL End:${snippet}`,
      `SQL:${snippet}`,
      isError
    );
  }

  /**
   * @description Sends a 'begin' log entry. The SQL statement and values are logged. Returns the mysql version
   *  of connection.query() instead of mysql2's version for event-based data access with additional functions for
   *  logging. See GeneratorLogger.begin() for more information.
   * @param {Object} logger
   * @param {Object} connection mysql2 Connection object
   * @param {String} sql The SQL statement to execute
   * @param {*[]} values Optional SQL statement placeholder arguments
   * @param {Object} options Additional options to send to connection.query()
   * @param {Function} [isError]
   * @return {Object} Returns the object returned by connection.connection.query() with additional functions for logging
   */
  static begin(logger, connection, sql, values = [], options, isError) {
    const snippet = ` ${sql}`.substr(0, 200).replace(/\s+/g, ' ').substr(0, Defaults.maxMessageLength);
    const generator = connection.connection.query({ sql, values, ...options });
    return GeneratorLogger.begin(
      logger.child('sql'),
      generator,
      { sql, values, message: `SQL Begin:${snippet}` },
      `SQL Generator:${snippet}`,
      `SQL End:${snippet}`,
      `SQL:${snippet}`,
      isError
    );
  }
}

module.exports = MySql;
