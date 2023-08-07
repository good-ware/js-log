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
beforeAll(() => init(true));

afterAll(() => {
  if (!loggers) return;
  return loggers.stop();
});

// =====
// Tests

test('ready', () => {
  expect(loggers.ready).toBe(true);
  expect(loggers.logger().ready).toBe(true);
});

test('tags via setLogger are used 1', () => {
  loggers.setLogger('test', loggers.child('test'));
  const x = loggers.isLevelEnabled('info', 'test');
  expect(x).toBeTruthy();
  expect(x.tags.test).toBe(true);
});

test('tags via setLogger are used 2', () => {
  loggers.setLogger('test', loggers.child('test'));
  const x = loggers.isLevelEnabled('info', 'test');
  expect(x).toBeTruthy();
  expect(x.tags.doesnotexist).toBeFalsy();
});

test('context via setLogger is mixed in', () => {
  loggers.setLogger('test', loggers.child({ context: { a: 0, b: 1 } }));
  const count = unitTest.entries.length;
  loggers.info({
    context: { a: 1, z: 5 },
    category: 'test',
  });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.context.a).toBe(1);
  expect(item.context.b).toBe(1);
});

test('child context overwrite', () => {
  const child1 = loggers.child(null, { a: 1 });
  expect(child1.context().a).toBe(1);
  const child2 = child1.child(null, { a: 2, b: 2 });
  expect(child2.context().b).toBe(2);
  expect(child2.context().a).toBe(2);
});

test('child null obj', () => {
  const count = unitTest.entries.length;
  loggers
    .child({
      context: { a: 1 },
    })
    .info('hello');
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  console.log(JSON.stringify(item, null, 2));
  expect(item.context.a).toBe(1);
});

test('child null obj2', () => {
  const count = unitTest.entries.length;
  loggers.child(null, { a: 5 }).info('hello', { b: 2 });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.context.a).toBe(5);
  expect(item.data.b).toBe(2);
});

test('context extra', () => {
  const child = loggers.child({
    more: 5,
    data: 8,
  });
  expect(child.context().more).toBe(5);
  expect(child.context().data).toBe(8);
});

test('null message default', () => {
  const count = unitTest.entries.length;
  loggers.log(null, null);
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.message).toBe(null);
  expect(item.level).toBe('debug');
});

test('null message info', () => {
  const count = unitTest.entries.length;
  loggers.info(null);
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[unitTest.entries.length - 1];
  expect(item.message).toBe(null);
  expect(item.level).toBe('info');
});

test('null message info 2', () => {
  const count = unitTest.entries.length;
  loggers.info(['warn'], null);
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.message).toBe(null);
  expect(item.level).toBe('info');
});

test('undefined message', () => {
  const count = unitTest.entries.length;
  loggers.info();
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.message).toBe('');
  expect(item.level).toBe('info');
});

test('default method', () => {
  const count = unitTest.entries.length;
  loggers.default('hello');
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.message).toBe('hello');
  expect(item.level).toBe('debug');
});

test('null context', () => {
  const count = unitTest.entries.length;
  loggers.info({ context: null });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.context.context).toBe(null);
});

test('array context', () => {
  const count = unitTest.entries.length;
  loggers.info({ context: [] });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.context.context.length).toBe(0);
});

test('message is object with message', () => {
  const count = unitTest.entries.length;
  loggers.info({ message: { message: 'x' } });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.message).toBe('x');
});

test('message is object with message and data provided', () => {
  const count = unitTest.entries.length;
  loggers.info({ message: { message: 'x' }, data: { a: 1 } });
  expect(unitTest.entries.length).toBe(count + 1);
  const item = unitTest.entries[count];
  expect(item.data.a).toBe(1);
  expect(item.message).toBe('x');
});

test('message is object with message and others and data object overlaps message', () => {
  const count = unitTest.entries.length;
  loggers.info({ message: { message: 'message is object...', a: 2 }, data: { a: 1 } });
  expect(unitTest.entries.length).toBe(count + 2);
  {
    const item = unitTest.entries[count];
    expect(item.data.a).toBe(2);
    expect(item.message).toBe('message is object...');
  }
  {
    const item = unitTest.entries[count + 1];
    expect(item.data.a).toBe(1);
    expect(item.message).toBe('');
    // 'message' gets promoted out of data but _message remains
    expect(item.data._message).toBe();
  }
});

test('redact event with context extra', () => {
  let calls = 0;

  f = (event) => {
    if (event.type === 'context') calls += 1;
  };
  loggers.on('redact', f);
  const child = loggers.child({ a: 5, context: { b: 6 } });
  loggers.off('redact', f);
  expect(calls).toBe(4);
  expect(child.context().a).toBe(5);
  expect(child.context().b).toBe(6);
});

test('verbose includes http', () => {
  expect(loggers.logger('verbose').isLevelEnabled('http')).toBeTruthy();
});

test('pass truthy and falsy values to setLogger', () => {
  let logger = loggers.child();
  logger = loggers.setLogger('cached', logger);
  expect(loggers.logger('cached')).toBe(logger);
  loggers.setLogger('cached');
  expect(loggers.logger('cached') === logger).toBeFalsy();
});

test('stack', () => {
  const s1 = loggers.stack();
  const s2 = loggers.child().stack();
  expect(s1).toStrictEqual(s2);
  s1.push(5);
  s2.push(6);
  expect(s2.top()).toBe(6);
  expect(s1.top()).toBe(6);
  s2.pop();
  expect(s1.top()).toBe(5);
});
