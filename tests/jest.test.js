const Loggers = require('../index');
const config = require('./config');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

let loggers;
let logger;
let unitTest;
let hasCloudWatch;

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
  hasCloudWatch = loggers.props.cloudWatchStream ? 1 : 0;

  ({ unitTest } = loggers);
}

/**
 * Initialize globals
 */
beforeAll(()=>init(true));

test('ready', () => {
  expect(loggers.ready).toBe(true);
  expect(loggers.logger().ready).toBe(true);
});

test('null message info', () => {
  const count = unitTest.entries.length;
  loggers.info(null);
  expect(unitTest.entries.length).toBe(count+1);
  const item = unitTest.entries[count];
  expect(item.message).toBe(null);
  expect(item.level).toBe('info');
});

test('null message default', () => {
  const count = unitTest.entries.length;
  loggers.log(null, null);
  expect(unitTest.entries.length).toBe(count+1);
  const item = unitTest.entries[count];
  expect(item.message).toBe(null);
  expect(item.level).toBe('debug');
});

test('null message info 2', () => {
  const count = unitTest.entries.length;
  loggers.info(['warn'], null);
  expect(unitTest.entries.length).toBe(count+1);
  const item = unitTest.entries[count];
  expect(item.message).toBe(null);
  expect(item.level).toBe('info');
});

test('undefined message', () => {
  const count = unitTest.entries.length;
  loggers.info();
  expect(unitTest.entries.length).toBe(count+1);
  const item = unitTest.entries[count];
  expect(item.message).toBe('');
  expect(item.level).toBe('info');
});

test('default method', () => {
  const count = unitTest.entries.length;
  loggers.default('hello');
  expect(unitTest.entries.length).toBe(count+1);
  const item = unitTest.entries[count];
  expect(item.message).toBe('hello');
  expect(item.level).toBe('debug');
});
