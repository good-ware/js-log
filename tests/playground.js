/* eslint-disable no-restricted-syntax */
// const why = require('why-is-node-running');
const Loggers = require('../Loggers');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

/**
 * @description Runs an example
 * @return {Promise}
 */
async function go(colors) {
  // eslint-disable-next-line global-require
  const config = require('./config');

  config.logging.stage = config.env;
  config.logging.service = config.service;
  config.logging.console = { colors, data: colors };

  config.logging.version = config.version;

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
    tags: { doctor: { allowLevel: 'off', console: 'off', other: 'on' } },
  };
  config.logging.categories.nurse = { tags: { nurse: { console: 'off' } } };
  config.logging.categories.coordinator = {
    console: 'info',
    tags: { coordinator: { level: 'info' }, tag2: { level: 'error' } },
  };

  const loggers = new Loggers(config.logging);

  // ====== Manual test to make sure files are flushed
  // There is no easy automated way to check this
  // logger.info('doctor');
  // loggers.unitTest.flush = true;
  // await logger.stop();

  // @todo when in no-color mode check only 1 message is sent to console
  // logger.error({message:'one', error: new Error('two')});

  loggers.log('error', 'Outer error', new Error('Inner error'));

  await loggers.stop();

  // Uncomment if the process is hanging to investigate
  // why();
}

// eslint-disable-next-line no-console
go(true).catch(console.error);
