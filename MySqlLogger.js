const Defaults = require('./Defaults');
const TaskLogger = require('./TaskLogger');
const GeneratorLogger = require('./GeneratorLogger');

class MySql {
  /**
   * @description Creates two log entries for a Connection.query() execution: 'begin' and either 'end' or 'error.' See
   *  TaskLogger.execute for more information. The sql and values arguments are logged.
   * @param {Object} logger
   * @param {Connection} connection mysql2 Connection object
   * @param {String} sql SQL statement to execute
   * @param {*[]} [values] SQL statement placeholder arguments
   * @param {Object} [options] Additional options to send to connection.query()
   * @return {Promise} Returns the return value of connection.query(sql, values, ...options)
   */
  static async query(logger, connection, sql, values = [], options) {
    const summary = ` ${sql}`.substr(0, 200).replace(/\s+/g, ' ').substr(0, Defaults.maxMessageLength);
    return TaskLogger.execute(
      logger.child('sql'),
      () => connection.query({ sql, values, ...options }),
      { sql, values, message: `SQL Begin:${summary}` },
      `SQL End:${summary}`,
      `SQL:${summary}`
    );
  }

  /**
   * @description Creates a 'begin' log entry. The SQL statement and values are logged. Returns the value returned by
   *  the older mysql package (instead of the mysql2 package) connection.query method in order to permit event-based
   *  data access.
   * @param {Object} logger
   * @param {Object} connection A mysql2 Connection object
   * @param {String} sql A SQL statement to execute
   * @param {*[]} [values] Placeholder arguments for the sql statement
   * @param {Object} [options] Additional options to send to connection.query
   * @return {Object[]} The first array entry is a stream object. The second entry is the object returned by
   *  GeneratorLogger.begin with the following additional properties:
   *  1. sql
   *  2. values
   *  3. summary: A summarized version of the sql argument
   *  See GeneratorLogger.begin for more information.
   */
  static stream(logger, connection, sql, values = [], options) {
    const summary = ` ${sql}`.substr(0, 200).replace(/\s+/g, ' ').substr(0, Defaults.maxMessageLength);
    const generator = connection.connection.query({ sql, values, ...options });
    const logObj = GeneratorLogger.begin(
      logger.child('sql'),
      { sql, values, message: `SQL Begin:${summary}` },
      `SQL End:${summary}`,
      `SQL:${summary}`
    );
    logObj.assign(sql, values, summary);
    return [generator, logObj];
  }
}

module.exports = MySql;
