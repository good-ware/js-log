/* eslint-disable no-restricted-syntax */
// const why = require('why-is-node-running');
const Loggers = require('../index');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

let loggers;

/**
 * @description Runs the test
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
    tags: { doctor: { allowLevel: 'off', console: 'off', other: 'on' } },
  };
  config.logging.categories.nurse = { tags: { nurse: { console: 'off' } } };
  config.logging.categories.coordinator = {
    console: 'info',
    tags: { coordinator: { level: 'info' }, tag2: { level: 'error' } },
  };
  // Configuration for tags that affect logging levels - end
  // =========================================================

  // =============================
  // Create the 'loggers' instance
  loggers = new Loggers(config.logging);

  const hasCloudWatch = loggers.props.cloudWatch ? 1 : 0;

  // ============================
  // Create the 'logger' instance
  const logger = loggers.logger();
  const { unitTest } = loggers;

  // =================
  // Ready for testing

  // log({message: { error: Error })
  {
    logger.log({ message: { error: new Error('err') } });
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (entry.level !== 'error') throw new Error();
  }
  // log({message: Error})
  {
    logger.log({ message: new Error('err') });
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (entry.level !== 'error') throw new Error();
  }
  // log({error: Error})
  {
    logger.log({ error: new Error('err') });
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (entry.level !== 'error') throw new Error();
  }
  // log(Error)
  {
    logger.log(new Error('err'));
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (entry.level !== 'error') throw new Error();
  }
  // log(Error, 'message')
  {
    logger.log(new Error('err'), 'message');
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (entry.level !== 'error') throw new Error();
    if (!entry.message === 'message') throw new Error();
    if (!entry.data.error) throw new Error();
  }
  {
    logger.info(new Error('err'), 'message');
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (entry.level !== 'info') throw new Error();
    if (!entry.message === 'message') throw new Error();
    if (!entry.data.error) throw new Error();
  }
  {
    logger.child().log(new Error('err'), 'message');
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (entry.level !== 'error') throw new Error();
    if (!entry.message === 'message') throw new Error();
    if (!entry.data.error) throw new Error();
  }
  {
    logger.child().info(new Error('err'), 'message');
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (entry.level !== 'info') throw new Error();
    if (!entry.message === 'message') throw new Error();
    if (!entry.data.error) throw new Error();
  }

  // Test passing category to logLevel
  {
    logger.info(['extra'], null, null, 'dragon');
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (!entry.category === 'dragon') throw new Error();
    if (!entry.tags.includes('extra')) throw new Error();
  }

  {
    logger.info({ tags: ['extra'], category: 'dragon' });
    const entry = unitTest.entries[unitTest.entries.length - 1];
    if (!entry.category === 'dragon') throw new Error();
    if (!entry.tags.includes('extra')) throw new Error();
  }

  // This is logged as info
  {
    loggers.child('error').info('Yabba dabba');
    const { level } = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (level !== 'info') throw new Error();
  }

  // Error + message, call logLevel method on logger
  {
    logger.error({ error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (entry.level !== 'error') throw new Error();
    if (!entry.data.error) throw new Error();
    if (entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }

  // Error + message, call logLevel method on child
  {
    logger.child().error({ error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (!entry.data.error) throw new Error();
    if (!colors && entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }

  // Error + message + tag
  {
    logger.child().error(['info'], { error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (!entry.tags.includes('info')) throw new Error();
    if (!entry.data.error) throw new Error();
    if (!colors && entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }

  // Error + message, call log() on logger
  {
    logger.log(null, { error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (!entry.data.error) throw new Error();
    if (!colors && entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }

  // Error + message, call log() on child
  {
    logger.child().log({ error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    const entry = unitTest.entries[unitTest.entries.length - 2];
    if (!entry.data.error) throw new Error();
    if (!colors && entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }

  // Pass an object to child(). context is a string.
  {
    // logging-level methods override tags
    loggers.child({ tags: 'error', context: 'doo' }).info('Yabba dabba');
    const obj = unitTest.file.entries[unitTest.file.entries.length - 1];
    const { data, level } = obj;
    if (level !== 'info') throw new Error();
    if (data.context !== 'doo') throw new Error();
  }

  // message is an object 1
  {
    logger.info(['c'], { message: { a: 1, b: 2 } });
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('c')) throw new Error();
    if (!entry.data.a) throw new Error();
    if (!entry.data.b) throw new Error();
  }

  // message is an object 1
  {
    logger.child().info(['c'], { message: { a: 1, b: 2 } });
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('c')) throw new Error();
    if (!entry.data.a) throw new Error();
    if (!entry.data.b) throw new Error();
  }

  // log level method with context and tags
  {
    logger.error({ tags: ['d'], a: 1, b: 2, context: { d: 5 } });
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('d')) throw new Error();
    if (!entry.data.a) throw new Error();
    if (!entry.data.b) throw new Error();
    if (!entry.data.d) throw new Error();
  }

  // Child context is passed to logger()
  {
    loggers.logger('a').child(null, { b: 5 }).child(null, { a: 1 }).logger('b').info('hi');
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.data.a) throw new Error();
    if (!entry.data.b) throw new Error();
  }

  // This is logged as debug
  {
    loggers.child('error').log(loggers.tags({ logLevel: 'warn' }, { logLevel: 'debug' }), 'Yabba dabba');
    const { level } = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (level !== 'debug') throw new Error();
  }

  // Error
  {
    logger.error('some error', new Error('5'));
    const entry1 = unitTest.file.entries[unitTest.file.entries.length - 2];
    if (entry1.message !== 'some error') throw new Error();
    const entry = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (entry.message !== 'Error: 5') throw new Error();
    if (!entry.data.stack) throw new Error();
  }

  // Error
  {
    logger.error('', new Error('5'));
    const entry = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (entry.message !== 'Error: 5') throw new Error();
  }

  const tags = loggers.tags('message');
  if (!tags.message) throw new Error();

  // Test disabling a tag
  if (!loggers.isLevelEnabled(loggers.tags({ silly: 1 }, { silly: 0 }))) throw new Error('isLevelEnabled failed');

  // Test isLevelEnabled
  if (!loggers.isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');
  if (!loggers.isLevelEnabled('more')) throw new Error('isLevelEnabled failed');

  // test 'on'
  let onRan;
  loggers.winstonLogger().on('close', () => {
    // eslint-disable-next-line no-console
    console.log('** closed **');
    onRan = true;
  });

  // Test 'ready'
  if (!loggers.ready) throw new Error('ready failed');

  // Test two level names in tags
  {
    const result = loggers.isLevelEnabled({ error: true, debug: true });
    if (result.level !== 'error') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
  }

  // Test logLevel tag
  {
    const result = loggers.isLevelEnabled({ error: true, logLevel: 'debug' });
    if (result.level !== 'debug') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
    if ('logLevel' in result.tags) throw new Error();
  }

  // Test categoryOptions
  if (loggers.categoryOptions('bar')) throw new Error('categoryOptions failed');
  if (!loggers.categoryOptions('default')) throw new Error('categoryOptions failed');

  {
    // category must be a string or falsy - output warning
    loggers.options.unitTest = false;
    logger.info('message', null, [5]);

    loggers.options.unitTest = true;

    let failed = true;
    try {
      loggers.child(null, null, [5]);
      failed = false;
    } catch (error) {
      //
    }

    if (!failed) throw new Error('Should have failed');

    failed = true;
    try {
      loggers.log(null, null, null, [5]);
      failed = false;
    } catch (error) {
      //
    }
    if (!failed) throw new Error('Should have failed');
  }

  // Test passing tags as first parameter to level names
  {
    const entries = unitTest.entries.length;
    const log = loggers.child(null, { operationId: 5 });
    log.default(['purge', 'begin'], 'Purging files', { directory: 5 });
    if (unitTest.entries.length !== entries + 1) throw new Error();
  }

  // Tag filtering
  for (const i of [1, 2]) {
    const extra = hasCloudWatch && i === 1 ? 1 : 0;
    // Repeat to test switch caching
    // Default category
    {
      const entries = unitTest.entries.length;
      loggers.log(['info', 'sql'], 'SQL info');
      if (entries !== unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      loggers.log(['error', 'sql'], 'SQL error');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      loggers.log(['warn', 'sql'], 'SQL warn');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      loggers.log(['info', 'barber'], 'Barber message');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.entries.length;
      loggers.log(['error', 'barber'], 'Barber error');
      if (entries === unitTest.entries.length) throw new Error();
    }

    {
      const entries = unitTest.file.entries.length;
      loggers.log(['warn', 'barber'], 'Barber warn');
      if (entries !== unitTest.file.entries.length) throw new Error();
    }

    // Barber category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['more', 'barber'], 'Barber message', null, 'barber');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      // Did not write to file
      if (fileEntries !== unitTest.file.entries.length) throw new Error();
    }

    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'barber'], 'Barber error', null, 'barber');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }

    // Nurse category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['more', 'nurse'], 'Nurse more', null, 'nurse');
      if (consoleEntries + extra !== unitTest.console.entries.length) throw new Error();
      if (fileEntries + extra !== unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'nurse'], 'Nurse error', null, 'nurse');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      loggers.log(['warn', 'nurse'], 'Nurse warning', null, 'nurse');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }

    // Doctor category
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      // Do not log to console
      logger.more(['doctor'], 'Doctor more', null, 'doctor');
      if (consoleEntries + extra !== unitTest.console.entries.length) throw new Error();
      // Log to file because 'other' defined at category level
      if (fileEntries + extra === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'doctor'], 'Doctor error', null, 'doctor');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['warn', 'doctor'], 'Doctor warning', null, 'doctor');
      if (fileEntries === unitTest.file.entries.length) throw new Error();
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }
  }

  // Test overriding level - coordinator
  {
    const entries = unitTest.console.entries.length;
    logger.silly('a message', null, 'coordinator');
    if (entries + hasCloudWatch !== unitTest.console.entries.length) throw new Error();
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
    const before = unitTest.entries.length;
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    err.error = err2;
    err2.cause = err;
    logger.error(err);
    const after = unitTest.entries.length;
    if (after - before !== 2) throw new Error();
    if (!unitTest.entries[unitTest.entries.length - 2].message.startsWith('Error: error 1')) throw new Error();
    if (unitTest.entries[unitTest.entries.length - 1].message !== 'Error: error 2') throw new Error();
  }

  // circular test 2
  {
    const before = unitTest.entries.length;
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    err.error = err2;
    err2.cause = err;
    logger.error('hey', err);
    const after = unitTest.entries.length;
    if (after - before !== 3) throw new Error();
    if (!unitTest.entries[unitTest.entries.length - 3].message.startsWith('hey')) throw new Error();
    if (!unitTest.entries[unitTest.entries.length - 2].message.startsWith('Error: error 1')) throw new Error();
    if (unitTest.entries[unitTest.entries.length - 1].message !== 'Error: error 2') throw new Error();
  }

  // circular test 3
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
    const contextLogger = loggers.child('cxt', { cxtExtra: 5 }, 'logger');
    contextLogger.debug('logging with context logger');
    if (unitTest.entries[unitTest.entries.length - 1].data.cxtExtra !== 5) throw new Error();
  }

  loggers.logger('cat').info('Cat logger');
  if (unitTest.entries[unitTest.entries.length - 1].message !== 'Cat logger') throw new Error();

  // Flush followed by logging works
  await loggers.flushCloudWatchTransports();
  logger.info('message2');

  // Flushing with nothing works
  await loggers.flushCloudWatchTransports();
  await loggers.flushCloudWatchTransports();

  // Test isLevelEnabled
  if (!loggers.child(null, null, 'foo').isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');

  // Test get/getLoggers and a category that is not in config (flyweight)
  loggers.child(null, null, 'foo').debug('debug');
  logger.debug('debug message', null, 'foo');

  // Log an array
  logger.debug([0, 1, 2, 3]);

  // message is an array
  logger.debug({ message: [0, 1, 2, 3] });

  // message is an object
  logger.debug({ message: { a: 1, b: 2 } });

  loggers.log(['tag1', 'tag2', 'tag3'], 'Default'); // default level (debug)
  loggers.log(null, 'msg');
  loggers.log('debug', 'Debug');
  loggers.log(['tag'], 'Debug default');

  // Test passing object to log()
  loggers.log({
    level: 'info',
    tags: ['money'],
    message: 'object test',
    more: 5,
  });

  loggers.log({ info: true, tag: true, tag2: false }, 'msg');
  loggers.log('info');
  loggers.log('info', null);
  loggers.log('info', 'extra tags', { tags: '5' });
  loggers.log('info', { message: 'extra tags2', tags: '1' }, { tags: '2' });
  loggers.log('info', { message: { anotherObject: 5 } });
  loggers.log('info', { message: [1, 2, 3] });
  loggers.log('info', [1, 2, 3]);
  loggers.log('info', null);
  loggers.log('info', 'Info');
  loggers.log('info', { msg: 'No message' });
  loggers.log('info', { message: 'With details', prop: 2 });
  loggers.log('info', { message: 'With extra', prop: 2 }, { extra: 1 });

  // extra as an array goes into 'message' and overlaps with the provided
  // message
  {
    const oldLen = unitTest.entries.length;
    loggers.log('info', { message: 'With extra array' }, ['extra', 'is', 'array']);
    if (unitTest.entries.length - oldLen !== 1) throw new Error();
  }

  loggers.log('warn', 'This is your final warning');

  // Error 'foo' goes into message
  loggers.log('error', '', { foo: new Error('data') });
  if (!unitTest.entries[unitTest.entries.length - 1].message) throw new Error();

  {
    loggers.log(
      'error',
      { message: 'outer error', error: new Error('inner error'), stack: 'x' },
      { requestId: 1, extra: 2 }
    );
    let item = unitTest.entries[unitTest.entries.length - 2];
    if (item.data.extra !== 2) throw new Error();
    if (item.message !== 'outer error') throw new Error();
    if (!item.stack) throw new Error();
    if (item.data.error !== 'Error: inner error') throw new Error();
    item = unitTest.entries[unitTest.entries.length - 1];
  }

  // logStack tests
  {
    loggers.log({ info: true, logStack: true }, 'hello');
    let item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    loggers.log({ info: true, logStack: false }, 'hello');
    item = unitTest.entries[unitTest.entries.length - 1];
    if (item.stack) throw new Error();
  }
  {
    logger.info(['logStack'], 'A message');
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
    if (item.logStack) throw new Error();
  }
  {
    logger.info(new Error());
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (item.stack) throw new Error();
  }
  {
    logger.error(['logStack'], new Error());
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
  }

  // extra converted to a string using toString
  loggers.log('debug', new Error('data'));

  loggers.log('error', new Error('error'));
  // You can provide an error as the first argument and also a message
  loggers.log(new Error(''), 'message');
  logger.error({ error: 'I already have an error' });

  // This logs three items
  loggers.log(new Error('naked error'), { message: 5, error: 'I already have an error' });

  // 4 items
  loggers.log(new Error('naked error'), { message: 5, error: 'error', cause: 'cause' });

  // These two should be identical
  logger.log(new Error('naked error'), { error: 'I already have an error' });
  logger.error({ error: 'I already have an error' }, new Error('naked error'));

  {
    loggers.log('error', 'I will add the stack');
    const item = unitTest.entries[unitTest.entries.length - 1];
    if (!item.stack) throw new Error();
  }

  // test error in extra AND message
  logger.error(new Error('an error'), new Error('extra error'));

  logger.error({ message: 'x', error: new Error('an error') }, new Error('extra error'));

  const err = new Error('shared error');
  logger.error(err, err);
  logger.error({ message: 'another shared error', error: err }, err);

  // ===========================
  // Unhandled promise rejection
  {
    const len = Object.keys(unitTest.logGroupIds).length;
    Promise.reject(new Error('Rejected promise'));
    await new Promise((resolve) => setTimeout(resolve, 1));

    const len2 = Object.keys(unitTest.logGroupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  // ===================
  // Unhandled exception
  {
    const len = Object.keys(unitTest.logGroupIds).length;

    setTimeout(() => {
      throw new Error('Unhandled exception');
    }, 0.1);
    await new Promise((resolve) => setTimeout(resolve, 1));

    const len2 = Object.keys(unitTest.logGroupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  // ===============
  // Stop the logger
  if (!loggers.ready) throw new Error('ready failed');
  await loggers.stop();
  if (loggers.ready) throw new Error('ready failed');

  logger.info(`I've stopped and I can't get up`);

  {
    // These values must be tweaked whenever more entries are logged
    if (unitTest.entries.length !== 159 + 10 * hasCloudWatch) throw new Error(unitTest.entries.length);
    const len = Object.keys(unitTest.logGroupIds).length;
    if (len !== 32) throw new Error(len);
    if (unitTest.dataCount !== 104 + 10 * hasCloudWatch) throw new Error(unitTest.dataCount);
  }

  if (!onRan) throw new Error();

  // Start it again
  loggers.start();
  logger.info('Restarted');

  await loggers.stop();

  loggers.start();
  await loggers.flushCloudWatchTransports();
  await loggers.flushCloudWatchTransports();
  await loggers.stop();

  loggers = undefined;
}

/**
 * @description Tester
 */
async function test() {
  let error;

  try {
    await go(false);
    await go(true);
    // eslint-disable-next-line no-console
    console.log('Successful');
  } catch (err) {
    error = err;
  }

  if (loggers) {
    await loggers.stop();
    loggers = false;
  }

  // Uncomment if the process is hanging to investigate
  // why();

  if (error) throw error;
}

test().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
