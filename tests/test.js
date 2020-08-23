/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
// const why = require('why-is-node-running');
const LogService = require('../LogService');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

let logger;

/**
 * @description Run the test
 * @param {Boolean} colors
 * @return {Promise}
 */
async function go(colors) {
  // eslint-disable-next-line global-require
  const config = require('./config');

  config.logging.stage = config.env;
  config.logging.service = config.service;
  config.logging.console = { colors, data: colors };

  config.logging.version = config.version;
  config.logging.unitTest = true;

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

  logger = new LogService(config.logging);
  const { unitTest } = logger;

  // ====== Manual test to make sure files are flushed
  // There is no easy automated way to check this
  // LogService.info('doctor');
  // logger.unitTest.flush = true;
  // await logger.stop();

  // @todo when in no-color mode check only 1 message is sent to console
  // logger.error({message:'lksdjf', error: new Error('lksjadf')});

  // This is logged as info
  // @todo test this
  {
    logger.child('error').info('Yabba dabba');
    const { level } = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (level !== 'info') throw new Error();
  }

  // This is logged as debug
  // @todo test this
  {
    logger.child('error').log(LogService.tags({ logLevel: 'warn' }, { logLevel: 'debug' }), 'Yabba dabba');
    const { level } = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (level !== 'debug') throw new Error();
  }

  // Code meta test
  {
    logger.info({ code: 5 });
    const entry = unitTest.file.entries[unitTest.file.entries.length - 1];
    console.log(entry.code);
    if (entry.code !== 5) throw new Error();
    if (entry.data.code !== 5) throw new Error();
  }

  // Error meta test
  {
    logger.error({ error: 5 });
    const entry = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (entry.error !== '5') throw new Error();
  }

  const tags = LogService.tags('message');
  if (!tags.message) throw new Error();

  // Test disabling a tag
  if (!logger.isLevelEnabled(LogService.tags({ silly: 1 }, { silly: 0 }))) throw new Error('isLevelEnabled failed');

  // Test isLevelEnabled
  if (!logger.isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');
  if (!logger.isLevelEnabled('more')) throw new Error('isLevelEnabled failed');

  // test 'on'
  let onRan;
  logger.winstonLogger().on('close', () => {
    console.log('** closed **');
    onRan = true;
  });

  // Test 'ready'
  if (!logger.isReady()) throw new Error('ready failed');

  // Test two level names in tags
  {
    const result = logger.isLevelEnabled({ error: true, debug: true });
    if (result.level !== 'error') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
  }

  // Test logLevel tag
  {
    const result = logger.isLevelEnabled({ error: true, logLevel: 'debug' });
    if (result.level !== 'debug') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
    if ('logLevel' in result.tags) throw new Error();
  }

  // Test categoryOptions
  if (logger.categoryOptions('bar')) throw new Error('categoryOptions failed');
  if (!logger.categoryOptions('default')) throw new Error('categoryOptions failed');

  {
    // category must be a string or falsy - output warning
    logger.options.unitTest = false;
    logger.info('message', null, [5]);

    logger.options.unitTest = true;

    let failed = true;
    try {
      logger.child(null, null, [5]);
      failed = false;
    } catch (error) {
      //
    }

    if (!failed) throw new Error('Should have failed');

    failed = true;
    try {
      logger.log(null, null, null, [5]);
      failed = false;
    } catch (error) {
      //
    }
    if (!failed) throw new Error('Should have failed');
  }

  // Nonoverlap
  /*
  {
    const entry = logger.logEntry('info', {}, 'extraMessage');
    if (entry.message !== 'extraMessage') throw new Error(`Should be
  'extraMessage', is ${entry.message}`);
  }
  */

  // Test passing tags as first parameter to level names
  {
    const entries = unitTest.entries.length;
    const log = logger.child(null, { operationId: 5 });
    log.default(['purge', 'begin'], 'Purging files', { directory: 5 });
    if (unitTest.entries.length !== entries + 1) throw new Error();
  }

  // Tag filtering
  // eslint-disable-next-line no-empty-pattern
  for (const {} of [1, 2]) {
    // Repeat to test switch caching
    // Default category
    {
      const entries = unitTest.entries.length;
      logger.log(['info', 'sql'], 'SQL info');
      if (entries !== unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      logger.log(['error', 'sql'], 'SQL error');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      logger.log(['warn', 'sql'], 'SQL warn');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      logger.log(['info', 'barber'], 'Barber message');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      logger.log(['error', 'barber'], 'Barber error');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.file.entries.length;
      logger.log(['warn', 'barber'], 'Barber warn');
      if (entries !== unitTest.file.entries.length) throw new Error();
    }

    // Barber category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['more', 'barber'], 'Barber message', null, 'barber');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      // Did not write to file
      if (fileEntries !== unitTest.file.entries.length) throw new Error();
    }

    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['error', 'barber'], 'Barber error', null, 'barber');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }

    // Nurse category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['more', 'nurse'], 'Nurse more', null, 'nurse');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      // Did not write to file
      if (fileEntries !== unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['error', 'nurse'], 'Nurse error', null, 'nurse');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      logger.log(['warn', 'nurse'], 'Nurse warning', null, 'nurse');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }

    // Doctor category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.more(['doctor'], 'Doctor more', null, 'doctor');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      // Wrote to file because 'other' defined at category level
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['error', 'doctor'], 'Doctor error', null, 'doctor');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.log(['warn', 'doctor'], 'Doctor warning', null, 'doctor');
      if (fileEntries === unitTest.file.entries.length) throw new Error();
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }
  }

  // Test overriding level - coordinator
  {
    const entries = unitTest.console.entries.length;
    logger.silly('a message', null, 'coordinator');
    if (entries !== unitTest.console.entries.length) throw new Error();
    logger.silly('coordinator', 'Silly changed to info', null, 'coordinator');
    if (entries === unitTest.console.entries.length) throw new Error();
  }

  // Test overriding level - coordinator & tag2
  {
    const entries = unitTest.console.entries.length;
    logger.silly(['tag2', 'coordinator'], 'Silly changed to error', null, 'coordinator');
    if (entries === unitTest.console.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (entry.level.indexOf('error') === -1) throw entry;
  }

  // circular test 1
  {
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    err.error = err2;
    err2.cause = err;
    logger.error(err);
    if (!unitTest.entries[unitTest.entries.length - 2].message.startsWith('Error: error 1')) throw new Error();
    if (unitTest.entries[unitTest.entries.length - 1].message !== 'Error: error 2') throw new Error();
  }

  // circular test 2
  {
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    const err3 = new Error('error 3');
    err.error = err2;
    err2.error = err3;
    err3.error = err;
    err3.cause = err2;
    logger.error(err);
    logger.error(err2);
    logger.error(err3);
    logger.error(new Error(), err);
    logger.error(new Error(), err2);
    logger.error(new Error(), err3);
  }

  {
    const extra = { error: new Error('outer error') };
    // Logs two entries: 1. message 2. Error: outer error
    logger.error('message', extra);
    // extra is not modified
    if (!extra.error) throw new Error();
  }

  {
    const contextLogService = logger.child('cxt', { cxtExtra: 5 }, 'logger');
    contextLogService.debug('logging with context logger');
    if (unitTest.entries[unitTest.entries.length - 1].data.cxtExtra !== 5) throw new Error();
  }

  logger.logger('cat').info('Cat logger');
  if (unitTest.entries[unitTest.entries.length - 1].message !== 'Cat logger') throw new Error();

  // Flush followed by logging works
  await logger.flushCloudWatch();
  logger.info('message2');

  // Flushing with nothing works
  await logger.flushCloudWatch();
  await logger.flushCloudWatch();

  // Test isLevelEnabled
  if (!logger.child(null, null, 'foo').isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');

  // Test get/getLogService and a category that is not in config (flyweight)
  logger.child(null, null, 'foo').debug('debug');
  logger.debug('debug message', null, 'foo');

  // Log an array
  logger.debug([0, 1, 2, 3]);

  // message is an array
  logger.debug({ message: [0, 1, 2, 3] });

  // message is an object
  logger.debug({ message: { a: 1, b: 2 } });

  logger.log(['tag1', 'tag2', 'tag3'], 'Default'); // default level (debug)
  logger.log(null, 'msg');
  logger.log('debug', 'Debug');
  logger.log(['tag'], 'Debug default');

  // Test passing object to log()
  logger.log({
    level: 'info',
    tags: ['money'],
    message: 'object test',
    more: 5,
  });

  logger.log({ info: true, tag: true, tag2: false }, 'msg');
  logger.log('info');
  logger.log('info', null);
  logger.log('info', 'extra tags', { tags: '5' });
  logger.log('info', { message: 'extra tags2', tags: '1' }, { tags: '2' });
  logger.log('info', { message: { anotherObject: 5 } });
  logger.log('info', { message: [1, 2, 3] });
  logger.log('info', [1, 2, 3]);
  logger.log('info', null);
  logger.log('info', 'Info');
  logger.log('info', { msg: 'No message' });
  logger.log('info', { message: 'With details', prop: 2 });
  logger.log('info', { message: 'With extra', prop: 2 }, { extra: 1 });

  // extra as an array goes into 'message' and overlaps with the provided
  // message
  {
    const oldLen = unitTest.entries.length;
    logger.log('info', { message: 'With extra array' }, ['extra', 'is', 'array']);
    if (unitTest.entries.length - oldLen !== 2) throw new Error();
  }

  logger.log('warn', 'This is your final warning');

  // extra 'foo' goes into data; add stack; message remains blank
  {
    const oldLen = unitTest.dataCount;
    logger.log('error', '', { foo: new Error('data') });
    if (unitTest.entries[unitTest.entries.length - 1].message) throw new Error();
    if (!unitTest.entries[unitTest.entries.length - 1].stack.startsWith('Error')) throw new Error();
    if (unitTest.dataCount - oldLen !== 1) throw new Error();
  }

  // Test logStack meta
  {
    logger.log({ info: true, logStack: true }, 'hello');
    let item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    if (item.logStack) throw new Error();
    logger.log({ info: true, logStack: false }, 'hello');
    item = unitTest.entries[unitTest.entries.length - 1];
    if (item.stack) throw new Error();
    if (item.logStack) throw new Error();
  }

  {
    logger.log(
      'error',
      { message: 'outer error', error: new Error('inner error'), stack: 'x' },
      { requestId: 1, extra: 2 }
    );
    let item = unitTest.entries[unitTest.entries.length - 2];
    if (item.requestId !== 1) throw new Error();
    if (item.data.extra !== 2) throw new Error();
    if (item.message !== 'outer error') throw new Error();
    if (!item.logStack) throw new Error();
    if (item.stack !== 'x') throw new Error();
    if (item.data.error !== 'Error: inner error') throw new Error();
    item = unitTest.entries[unitTest.entries.length - 1];
    if (item.requestId !== 1) throw new Error();
    if (item.logStack) throw new Error();
  }

  // logStack tests
  {
    logger.info(['logStack'], 'A message');
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    if (item.logStack) throw new Error();
  }
  {
    logger.info(new Error());
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    if (item.logStack) throw new Error();
  }
  {
    logger.error(['logStack'], new Error());
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    if (!item.logStack) throw new Error();
  }

  // extra converted to a string using toString
  logger.log('debug', new Error('data'));

  logger.log('error', new Error('error'));
  // You can provide an error as the first argument and also a message
  logger.log(new Error(''), 'message');
  logger.error({ error: 'I already have an error' });

  // This logs three items
  logger.log(new Error('naked error'), { message: 5, error: 'I already have an error' });

  // 4 items
  logger.log(new Error('naked error'), { message: 5, error: 'error', cause: 'cause' });

  // These two should be identical
  logger.log(new Error('naked error'), { error: 'I already have an error' });
  logger.error({ error: 'I already have an error' }, new Error('naked error'));

  {
    logger.log('error', 'I will add the stack');
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
  }

  // test error in extra AND message
  logger.error(new Error('an error'), new Error('extra error'));

  logger.error({ message: 'x', error: new Error('an error') }, new Error('extra error'));

  const err = new Error('shared error');
  logger.error(err, err);
  logger.error({ message: 'another shared error', error: err }, err);

  // Test unhandled promise rejection
  {
    const len = Object.keys(unitTest.logGroupIds).length;
    // eslint-disable-next-line no-unused-vars
    Promise.reject(new Error('Rejected promise'));
    await new Promise((resolve) => setTimeout(resolve, 1));

    const len2 = Object.keys(unitTest.logGroupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  // Test unhandled exception
  {
    const len = Object.keys(unitTest.logGroupIds).length;

    setTimeout(() => {
      throw new Error('Unhandled exception');
    });
    await new Promise((resolve) => setTimeout(resolve, 1));

    const len2 = Object.keys(unitTest.logGroupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  const hasCloudWatch = !!logger.cloudWatch;

  // Stop the logger
  await new Promise((resolve) => setTimeout(() => logger.stop().then(resolve), 100));

  if (logger.isReady()) throw new Error('ready failed');

  // eslint-disable-next-line quotes
  logger.info(`I've stopped and I can't get up`);

  {
    // These values must be tweaked whenever more entries are logged
    if (unitTest.entries.length !== 122) throw new Error(unitTest.entries.length);
    const len = Object.keys(unitTest.logGroupIds).length;
    if (len !== 21 - hasCloudWatch) throw new Error(len);
    if (unitTest.dataCount !== 63 - hasCloudWatch * 2) throw new Error(unitTest.dataCount);
  }

  if (!onRan) throw new Error();

  // Start it again
  logger.start();
  logger.info('Restarted');

  await logger.stop();

  logger.start();
  await logger.flushCloudWatch();
  await logger.flushCloudWatch();
  await logger.stop();

  logger = undefined;
}

/**
 * @description Tester
 */
async function test() {
  try {
    await go(false);
    await go(true);
    console.log('Successful');
  } catch (error) {
    console.error(error);
  }

  if (logger) {
    await logger.stop();
    logger = null;
  }

  // Uncomment if the process is hanging to investigate
  // why();
}

test().catch(console.error);
