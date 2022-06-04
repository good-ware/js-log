const Loggers = require('../index');
const config = require('./config');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

let loggers;

/**
 * @description Runs the test
 * @param {Boolean} colors
 */
function init(colors) {
  config.logging.stage = config.env;
  config.logging.service = config.service;

  Object.assign(config.logging.console, { colors: true, data: colors });

  config.logging.version = config.version;
  config.logging.unitTest = true;

  // =========================================================
  // Configuration for tags that affect logging levels - begin
  config.logging.categories.default.tags = {
    sql: 'off',
    barber: {
      allowLevel: 'error',
      console: 'on',
      other: 'off',
    },
    doctor: { file: 'off' },
    nurse: { file: 'off', allowLevel: 'error' },
  };

  config.logging.categories.barber = { tags: { barber: { console: 'off' } } };
  config.logging.categories.doctor = {
    tags: {
      doctor: { allowLevel: 'off', console: 'off', other: 'on' },
      sql: 'on',
    },
  };
  config.logging.categories.nurse = { tags: { nurse: { console: 'off' } } };
  config.logging.categories.coordinator = {
    console: 'info',
    tags: { coordinator: { level: 'info' }, tag2: { level: 'error' } },
  };
  // Configuration for tags that affect logging levels - end
  // =========================================================

  // =========================
  // Create a Loggers instance
  // config.logging.logDirectoryNotFound = true;

  loggers = new Loggers(config.logging);
  const hasCloudWatch = loggers.props.cloudWatchStream ? 1 : 0;

  // =====================
  // Create a child logger
  const logger = loggers.logger();
  const { unitTest } = loggers;

  if (!loggers.ready || !logger.ready) throw new Error();

  // =================
  // Ready for testing
}

beforeAll(()=>init(true));

test('null message', () => {
  expect(true)
});

