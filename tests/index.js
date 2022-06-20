/* eslint-disable no-promise-executor-return */
// const why = require('why-is-node-running');
const Loggers = require('../index');
const TaskLogger = require('../TaskLogger');

// For debugging info, run with:
// WINSTON_CLOUDWATCH_DEBUG=true node logger.js

let loggers;

/**
 * @description Runs the test
 * @param {Boolean} showData
 * @return {Promise}
 */
async function go(showData) {
  // eslint-disable-next-line global-require
  const config = require('./config');

  config.logging.stage = config.env;
  config.logging.service = config.service;

  Object.assign(config.logging.console, { colors: true, data: showData });

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

  // Configuration for tags that affect logging levels end
  // =====================================================

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
  //

  // loggers.tags()
  {
    const tags = loggers.tags('message');
    if (!tags.message) throw new Error();
  }

  // ====================
  // isLevelEnabled begin

  if (!loggers.isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');
  if (!loggers.isLevelEnabled('more')) throw new Error('isLevelEnabled failed');

  // logging at any level works
  if (!loggers.child(null, null, 'foo').isLevelEnabled('debug')) throw new Error('isLevelEnabled failed');
  // disable a tag
  if (!loggers.isLevelEnabled(loggers.tags({ silly: 1 }, { silly: 0 }))) throw new Error('isLevelEnabled failed');

  // two level names in tags
  {
    const result = loggers.isLevelEnabled({ error: true, debug: true });
    if (result.level !== 'error') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
  }

  // logLevel tag
  {
    const result = loggers.isLevelEnabled({ error: true, logLevel: 'debug' });
    if (result.level !== 'debug') throw new Error();
    if (!result.tags.error) throw new Error();
    if (!result.tags.debug) throw new Error();
    if ('logLevel' in result.tags) throw new Error();
  }

  // isLevelEnabled end
  // ==================

  // categoryOptions
  if (loggers.categoryOptions('bar')) throw new Error('categoryOptions failed');
  if (!loggers.categoryOptions('default')) throw new Error('categoryOptions failed');

  // category must be a string or falsy - output warning
  // eslint-disable-next-line no-lone-blocks
  {
    loggers.options.unitTest = false;
    logger.info('message', null, null, [5]);
    loggers.options.unitTest = true;
  }

  {
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
      loggers.log(null, null, null, null, [5]);
      failed = false;
    } catch (error) {
      //
    }
    if (!failed) throw new Error('Should have failed');
  }

  // ==============
  // logger() begin

  // eslint-disable-next-line no-self-compare
  if (loggers.logger('dog') !== loggers.logger('dog')) throw new Error();

  // 'dog' doesn't log at silly
  {
    const count = unitTest.entries.length;
    loggers.logger('dog').silly('a');
    if (count !== unitTest.entries.length) throw new Error();
  }

  // Check disabling the warn tag
  if (loggers.isLevelEnabled({ tags: { silly: true, warn: false }, category: 'dog' })) throw new Error();

  // 'dog' will log at silly because warn is added
  loggers.logger('dog', loggers.child(['warn', 'goofy'], { dog: 'woof', a: {b: {d: 5}} }));

  if (!loggers.isLevelEnabled({ tags: 'silly', category: 'dog' })) throw new Error();

  // Check the category of a saved logger is the same as the category provided to Loggers.logger(category, loggerObj)
  if (loggers.logger('dog').category() !== 'dog') throw new Error();

  {
    const count = unitTest.entries.length;
    loggers.logger('dog').silly('a'); // logLevel is specified via silly()
    if (count !== unitTest.entries.length) throw new Error();
    loggers.logger('dog').log('a', null, {a: 5}); // Use the tags for dog's logger
    // Nothing was logged to thie console?
    if (count+1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.context.dog !== 'woof') throw new Error();
  }

  // get/getLoggers and a category that is not in config (flyweight)
  {
    const count = unitTest.entries.length;
    loggers.child(null, null, 'foo').debug('debug');
    if (count +1 !== unitTest.entries.length) throw new Error();
  }

  // logger() end
  // ============

  // ================
  // log() etc. begin

  // An error is provided and the message is blank. errors add logStack
  {
    const count = unitTest.entries.length;
    loggers.error(undefined, new Error('abc'));
    if (count + 1 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count].logStack) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    const groupIds = Object.keys(unitTest.groupIds).length;
    loggers.error(null, new Error('abc'));
    if (count + 2 !== unitTest.entries.length) throw new Error();
    if (groupIds + 1 !== Object.keys(unitTest.groupIds).length) throw new Error();
    if (!unitTest.entries[count+1].groupId) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    loggers.error(null, { a: 5, error: new Error('err') });
    if (count + 2 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count+1].groupId) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    const error = new Error('x');
    loggers.info(null, { error });
    if (count + 2 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count+1].groupId) throw new Error();
  }

  // An error is provided and the message is blank; data data is provided
  {
    const count = unitTest.entries.length;
    const error = new Error('x');
    loggers.info(undefined, { error, x: 5 });
    if (count + 2 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count+1].groupId) throw new Error();
  }

  // Specify the level
  {
    const count = unitTest.entries.length;
    logger.log('warn', new Error());
    if (count+1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'warn') throw new Error();
  }
  // Add level 'error' because no level tag is specified
  {
    const count = unitTest.entries.length;
    logger.log(new Error());
    if (count+1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
  }

  // =============
  // Console begin 

  // No output (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.silly('msg', {}, null, 'briefConsole');
    if (count !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs message (default category)
  {
    const count = unitTest.console.entries.length;
    loggers.silly('msg', { a: 1 });
    if (count+1 !== unitTest.console.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.id) throw new Error();
  }
  // Outputs no message, overriding level
  {
    const count = unitTest.console.entries.length;
    loggers.silly(new Error('fail'), null, null, 'briefConsole');
    if (count !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs error (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.error(new Error('fail'), null, null, 'briefConsole');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs a message without an error (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', 'Message', new Error('fail'), null, 'briefConsoleNoErrors');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs a message and an error (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', 'Message', new Error('fail'), null, 'briefConsole');
    if (count + 2 !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs an error (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', '', new Error('fail'), null, 'briefConsole');
    if (count + 2 !== unitTest.console.entries.length) throw new Error();
  }
  // Message can be 0 (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', 0, null, null, 'briefConsole');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Message can be false (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', false, null, null, 'briefConsole');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Message when null (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', null, null, null, 'briefConsole');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Message when undefined (specify category)
  {
    const count = unitTest.console.entries.length;
    loggers.log('error', undefined, null, null, 'briefConsole');
    if (count + 1 !== unitTest.console.entries.length) throw new Error();
  }
  // Outputs message without data
  {
    const count = unitTest.console.entries.length;
    loggers.info('msg', { a: 1 }, null, 'briefConsole');
    if (count +1 !== unitTest.console.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (entry[Symbol.for('message')].indexOf('data:') >= 0) throw new Error();
  }
  // Outputs message with data
  {
    const count = unitTest.console.entries.length;
    loggers.info('msg', { a: 1 }, null, 'dataConsole');
    if (count +1 !== unitTest.console.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (entry[Symbol.for('message')].indexOf('data:') < 0) throw new Error();
  }

  // console end
  // ===========

  // message: Error
  {
    const count = unitTest.entries.length;
    logger.log({ message: new Error('err') });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
  }
  // data: {error: Error}
  {
    const count = unitTest.entries.length;
    logger.log({ data: { error: new Error('err') } });
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count+1];
    if (entry.level !== 'error') throw new Error();
    if (entry.message !== 'Error: err') throw new Error();
  }
  // message: {error: Error} - same as the above
  {
    const count = unitTest.entries.length;
    logger.log({ message: { error: new Error('err') } });
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count+1];
    if (entry.level !== 'error') throw new Error();
    if (entry.message !== 'Error: err') throw new Error();
  }
  // message: {error: Error, message: 's'}
  {
    const count = unitTest.entries.length;
    logger.log({ message: { message: 's', error: new Error('err') } });
    if (count +2 !== unitTest.entries.length) throw new Error();
    let entry = unitTest.entries[count+1];
    if (entry.level !== 'error') throw new Error();
    if (entry.message !== 'Error: err') throw new Error();
    entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
    if (entry.message !== 's') throw new Error();
  }
  // log({error: Error})
  {
    const count = unitTest.entries.length;
    logger.log({ error: new Error('err') });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
  }
  // log(Error)
  {
    const count = unitTest.entries.length;
    logger.log(new Error('err'));
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
  }
  // log(Error, 'message')
  {
    const count = unitTest.entries.length;
    logger.log(new Error('err'), 'message');
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
    if (!entry.message === 'message') throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.info(new Error('err'), 'message');
    if (count +2 !== unitTest.entries.length) throw new Error();
    let entry = unitTest.entries[count];
    if (entry.level !== 'info') throw new Error();
    if (entry.message !== 'message') throw new Error();
    if (entry.stack) throw new Error();
    entry = unitTest.entries[count + 1];
    if (entry.level !== 'info') throw new Error();
    if (!entry.tags.includes('error')) throw new Error();
    if (!entry.data.message === 'Error: err') throw new Error();
    if (!entry.stack) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.child().info(new Error('err'), 'message');
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'info') throw new Error();
    if (!entry.message === 'message') throw new Error();
    // if (!entry.data.error) throw new Error();
  }
  // passing category to logLevel
  {
    const count = unitTest.entries.length;
    logger.info(['extra'], 'A message', null, null, 'dragon');
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.category !== 'dragon') throw new Error();
    if (!entry.tags.includes('extra')) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.info({ tags: ['extra'], category: 'dragon' });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
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
    const count = unitTest.entries.length;
    logger.error({ error: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    if (count + 1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (entry.level !== 'error') throw new Error();
    if (entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }
  // Error + message + tag
  {
    const count = unitTest.entries.length;
    logger.child().error(['info'], { data: new Error('inner error'), message: { message: 'Foo', a: 8 } });
    if (count + 2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (!entry.tags.includes('info')) throw new Error();
    if (!entry.data.a) throw new Error();
    if (entry.message !== 'Foo') throw new Error();
  }
  // Error + message, call log() on logger
  {
    const count = unitTest.entries.length;
    logger.log(null, { data: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (!entry.data.a) throw new Error();
    if (entry.message !== 'Foo') throw new Error();
  }
  // Error + message, call log() on child
  {
    const count = unitTest.entries.length;
    logger.child().log({ data: new Error('inner error'), message: { message: 'Foo', a: 5 } });
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (!showData && entry.message !== 'Foo') throw new Error();
    if (!entry.data.a) throw new Error();
  }
  // Pass an object to child(). data is a string.
  // logging-level methods override tags
  {
    const count = unitTest.entries.length;
    loggers.child({ tags: 'error', context: 'doo' }).info('Yabba dabba');
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.entries[count];
    if (!entry.tags.includes('error')) throw new Error();
    const obj = unitTest.file.entries[unitTest.file.entries.length - 1];
    const { context, level } = obj;
    if (level !== 'info') throw new Error();
    if (context.context !== 'doo') throw new Error();
  }
  // message is an object 1
  {
    const count = unitTest.entries.length;
    logger.info(['c'], { message: { a: 1, b: 2 } });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('c')) throw new Error();
    const { message } = entry.data;
    if (!message.a) throw new Error();
    if (!message.b) throw new Error();
  }
  // message is an object 1
  {
    const count = unitTest.entries.length;
    logger.child().info(['c'], { message: { a: 1, b: 2 } });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('c')) throw new Error();
    const { message } = entry.data;
    if (!message.a) throw new Error();
    if (!message.b) throw new Error();
  }
  // log level method with data and tags
  {
    const count = unitTest.entries.length;
    logger.error({ tags: ['d'], context: { a: 1, b: 2 }, data: { d: 5 } });
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.tags.includes('d')) throw new Error();
    if (!entry.context.a) throw new Error();
    if (!entry.context.b) throw new Error();
    if (!entry.data.d) throw new Error();
  }
  // Child data is passed to logger()
  {
    const count = unitTest.entries.length;
    loggers.logger('a').child(null, { b: 5 }).child(null, { a: 1 }).logger('b').info('hi');
    if (count +1 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (!entry.context.a) throw new Error();
    if (!entry.context.b) throw new Error();
  }
  // This is logged as debug
  {
    const count = unitTest.entries.length;
    loggers.child('error').log(loggers.tags({ logLevel: 'warn' }, { logLevel: 'debug' }), 'Yabba dabba');
    if (count +1 !== unitTest.entries.length) throw new Error();
    const { level } = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (level !== 'debug') throw new Error();
  }
  // Error
  {
    const count = unitTest.entries.length;
    logger.error('some error', new Error('5'));
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry1 = unitTest.file.entries[unitTest.file.entries.length - 2];
    if (entry1.message !== 'some error') throw new Error();
    const entry = unitTest.file.entries[count + 1];
    if (entry.message !== 'Error: 5') throw new Error();
  }
  // Blank message, Error provided
  {
    const count = unitTest.entries.length;
    logger.error('', new Error('5'));
    if (count +2 !== unitTest.entries.length) throw new Error();
    const entry = unitTest.file.entries[unitTest.file.entries.length - 1];
    if (entry.message !== 'Error: 5') throw new Error(JSON.stringify(entry));
  }
  // passing tags as first parameter to level names
  {
    const count = unitTest.entries.length;
    const log = loggers.child(null, { operationId: 5 });
    log.default(['purge', 'begin'], 'Purging files', { directory: 5 });
    if (count+1 !== unitTest.entries.length) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.debug('debug message', null, null, 'foo');
    if (count +1 !== unitTest.entries.length) throw new Error();
  }

  // =========================================================
  // TODO the following tests need to at least check the count

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

  // passing object to log()
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
  {
    const count = unitTest.entries.length;
    loggers.log('error', '', { foo: new Error('data') });
    if (!unitTest.entries[count+1].message) throw new Error();
  }

  {
    const count = unitTest.entries.length;
    loggers.log(
      'error',
      { message: 'outer error', error: new Error('inner error'), stack: 'x' },
      { requestId: 1, extra: 2 }
    );
    let item = unitTest.entries[count];
    if (item.data.extra !== 2) throw new Error();
    if (item.message !== 'outer error') throw new Error();
    if (!item.stack) throw new Error();
    // if (item.data.error !== 'Error: inner error') throw new Error();
    item = unitTest.entries[count];
  }

  // logStack tests
  {
    const count = unitTest.entries.length;
    loggers.log({ info: true, logStack: true }, 'hello');
    let item = unitTest.entries[count];
    if (!item.stack) throw new Error();
    loggers.log({ info: true, logStack: false }, 'hello');
    item = unitTest.entries[count+1];
    if (item.stack) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.info(['logStack'], 'A message');
    const item = unitTest.entries[count];
    if (!item.stack) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.info(new Error());
    const item = unitTest.entries[count];
    if (!item.stack) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    logger.error(['logStack'], new Error());
    const item = unitTest.entries[count];
    if (!item.stack) throw new Error();
  }

  // extra converted to a string using toString
  loggers.log('debug', new Error('data'));

  loggers.log('error', new Error('error'));
  // You can provide an error as the first argument and also a message
  loggers.log(new Error(), 'message');
  logger.error({ error: 'I already have an error' });

  // This logs three items
  loggers.log(new Error('naked error'), { message: 5, error: 'I already have an error' });

  // 4 items
  loggers.log(new Error('naked error'), { message: 5, error: 'error', cause: 'cause' });

  // These two should be identical
  logger.log(new Error('naked error'), { error: 'I already have an error' });
  logger.error({ error: 'I already have an error' }, new Error('naked error'));

  {
    const count = unitTest.entries.length;
    loggers.log('error', 'I will add the stack');
    const item = unitTest.entries[count];
    if (!item.stack) throw new Error();
  }

  // error in extra AND message
  logger.error(new Error('an error'), new Error('extra error'));

  logger.error({ message: 'x', error: new Error('an error') }, new Error('extra error'));

  {
    const err = new Error('shared error');
    logger.error(err, err);
    logger.error({ message: 'another shared error', error: err }, err);
  }


  // TODO if hasCloudwatch then check cloudwatch entries exist

  // log() etc. end
  // ==============

  // ===================
  // Tag filtering begin

  // Repeat to test switch caching
  [1, 2].forEach(() => {
    // SQL tag
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
    // Barber tag
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
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['more', 'barber'], 'Barber message', null, null, 'barber');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      // Did not write to file
      if (fileEntries !== unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'barber'], 'Barber error', null, null, 'barber');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    // Nurse tag
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      const cloudWatchEntries = unitTest.cloudWatch.entries.length;
      loggers.log(['info', 'nurse'], 'nurse info', null, null, 'nurse');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      if (fileEntries !== unitTest.file.entries.length) throw new Error();
      if (hasCloudWatch + cloudWatchEntries !== unitTest.cloudWatch.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'nurse'], 'Nurse error', null, null, 'nurse');
      if (consoleEntries === unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      loggers.log(['warn', 'nurse'], 'Nurse warning', null, null, 'nurse');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }
    // Doctor category with sql tag
    {
      const count = unitTest.entries.length;
      const fileEntries = unitTest.file.entries.length;
      logger.logger('doctor').more(['sql'], 'xyz');
      const entry = unitTest.entries[count];
      if (entry.message !== 'xyz') throw new Error();
      if (entry.level !== 'more') throw new Error();
      // Log to file because 'other' defined at category level
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    // Doctor tag
    {
      const consoleEntries = unitTest.console.entries.length;
      const cloudWatchEntries = unitTest.cloudWatch.entries.length;
      // Do not log to console
      logger.more(['doctor'], 'Doctor more', null, null, 'doctor');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      if (cloudWatchEntries !== unitTest.cloudWatch.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['error', 'doctor'], 'Doctor error', null, null, 'doctor');
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
      if (fileEntries === unitTest.file.entries.length) throw new Error();
    }
    {
      const consoleEntries = unitTest.console.entries.length;
      const fileEntries = unitTest.file.entries.length;
      loggers.log(['warn', 'doctor'], 'Doctor warning', null, null, 'doctor');
      if (fileEntries === unitTest.file.entries.length) throw new Error();
      if (consoleEntries !== unitTest.console.entries.length) throw new Error();
    }
  });
  // overriding level - coordinator
  {
    const entries = unitTest.console.entries.length;
    logger.silly('a message', null, null, 'coordinator');
    if (entries !== unitTest.console.entries.length) throw new Error();
    logger.silly(['coordinator'], 'Silly changed to info', null, null, 'coordinator');
    if (entries === unitTest.console.entries.length) throw new Error();
  }
  // overriding level - coordinator & tag2
  {
    const entries = unitTest.console.entries.length;
    logger.silly(['tag2', 'coordinator'], 'Silly changed to error', null, null, 'coordinator');
    if (entries === unitTest.console.entries.length) throw new Error();
    const entry = unitTest.console.entries[unitTest.console.entries.length - 1];
    if (entry.level.indexOf('error') === -1) throw entry;
  }

  // Tag filtering end
  // =================

  // circular test 1
  {
    const count = unitTest.entries.length;
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    err.error = err2;
    err2.cause = err;
    logger.error(err);
    if (count + 2 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count].message.startsWith('Error: error 1')) throw new Error();
    if (unitTest.entries[count+1].message !== 'Error: error 2') throw new Error();
  }

  // circular test 2
  {
    const count = unitTest.entries.length;
    const err = new Error('error 1');
    const err2 = new Error('error 2');
    err.error = err2;
    err2.cause = err;
    logger.error('hey', err);
    if (count + 3 !== unitTest.entries.length) throw new Error();
    if (!unitTest.entries[count].message.startsWith('hey')) throw new Error();
    if (!unitTest.entries[count+1].message.startsWith('Error: error 1')) throw new Error();
    if (unitTest.entries[count+2].message !== 'Error: error 2') throw new Error();
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
    const count = unitTest.entries.length;
    loggers.logger('cat').info('Cat logger');
    if (unitTest.entries[count].message !== 'Cat logger') throw new Error();
  }

  // Flush followed by logging works
  await loggers.flushCloudWatchTransports();
  logger.info('message2');

  // Flushing with nothing works
  await loggers.flushCloudWatchTransports();
  await loggers.flushCloudWatchTransports();

  // =========================
  // Transform data via events
  {
    const handler = (obj) => {
      if (!obj.arg.one) throw new Error();
      // eslint-disable-next-line no-param-reassign
      obj.arg = { x: 'hi' };
    };

    loggers.on('redact', handler);
    const count = unitTest.entries.length;
    loggers.info('message', { one: true });
    loggers.off('redact', handler);

    if (unitTest.entries[count].data.x !== 'hi') throw new Error();
  }

  {
    let called;
    loggers.once('log', (entry) => {
      if (entry.message !== 'hello') throw new Error();
      called = true;
    });
    loggers.info('hello');
    if (!called) throw new Error();
  }

  // =========
  // Redaction

  // password is not recursive
  {
    const count = unitTest.entries.length;
    loggers.error({ password: 5, foo: 1 });
    if (unitTest.entries[count].data.password) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    loggers.info({ b: { password: 5 } });
    if (!unitTest.entries[count].data.b.password) throw new Error();
  }

  // passwordx is recursive
  {
    const count = unitTest.entries.length;
    loggers.info({ passwordx: 5, foo: 1 });
    if (unitTest.entries[count].data.passwordx) throw new Error();
  }
  {
    const count = unitTest.entries.length;
    loggers.error({ b: { passwordx: 5 }, foo: 1 });
    if (unitTest.entries[count].data.b.passwordx) throw new Error();
  }

  // ===========================
  // Unhandled promise rejection
  {
    const len = Object.keys(unitTest.groupIds).length;
    Promise.reject(new Error('Rejected promise'));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const len2 = Object.keys(unitTest.groupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  // ===================
  // Unhandled exception
  {
    const len = Object.keys(unitTest.groupIds).length;

    setImmediate(() => {
      throw new Error('Unhandled exception');
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const len2 = Object.keys(unitTest.groupIds).length;
    if (len2 <= len) throw new Error(len2);
  }

  // ==========
  // TaskLogger
  try {
    TaskLogger.execute(
      loggers,
      () => {
        throw new Error('x');
      },
      'begin',
      'end'
    );
  } catch (error) {
    //
  }

  // =====
  // Stack
  {
    const stack = loggers.stack('joe');
    if (!stack) throw new Error();
    // test caching
    if (stack !== loggers.stack('joe')) throw new Error();
    stack.push(loggers);
    stack.push(loggers);
    if (stack.push(loggers) !== 3) throw new Error();
    if (loggers !== stack.pop(2)) throw new Error();
    if (stack.push(loggers) !== 3) throw new Error();
    if (stack.pop() !== loggers) throw new Error();
    if (stack.pop(0) !== loggers) throw new Error();
    if (stack.length) throw new Error();
  }

  // ===========================
  // Stop/start/flush the logger

  // Handle close event
  let onRan;
  loggers.winstonLogger().on('close', () => {
    // eslint-disable-next-line no-console
    console.log('** closed **');
    onRan = true;
  });

  if (!loggers.ready) throw new Error('ready failed');
  await loggers.stop();
  if (loggers.ready) throw new Error('ready failed');
  if (!onRan) throw new Error();

  logger.info(`I've stopped and I can't get up`);

  // Start it again
  loggers.start();
  if (!loggers.ready) throw new Error('ready failed');
  logger.info('Restarted');

  await loggers.stop();
  if (loggers.ready) throw new Error('ready failed');
  loggers.start();

  await loggers.flushCloudWatchTransports();
  await loggers.flushCloudWatchTransports();
  await loggers.restart();
  await loggers.stop();

  loggers = undefined;
}

/**
 * @description Tester
 */
async function test() {
  let error;

  try {
    await go(true);
    await go(false);

    // eslint-disable-next-line no-console
    console.log('\x1b[32m\x1b[40m\u2713\x1b Pass\x1b[0m');
  } catch (err) {
    error = err;
  }

  if (loggers) {
    try {
      await loggers.stop();
    } catch (err) {
      error = err;
    }
    loggers = undefined;
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
