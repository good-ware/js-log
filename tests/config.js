const deepmerge = require('deepmerge');
const dotenv = require('dotenv');

const pack = require('../package.json');
// Read .env files into process.env
const env = process.env.NODE_ENV || 'test';
dotenv.config({ path: '.env' });
dotenv.config({ path: `.env-${env}` });

// Default configuration
let config = {
  env,
  version: pack.version,
  service: pack.name,
  logging: {
    cloudWatch: {
      logGroup: `/${env}/goodware/log`,
    },
    console: {
      level: 'silly',
      data: true,
    },
    categories: {
      briefConsole: {
        console: {
          level: 'info',
          data: false,
        },
      },
      briefConsoleNoErrors: {
        console: {
          level: 'info',
          data: false,
          childErrors: false,
        },
      },
      dataConsole: {
        console: {
          level: 'info',
          data: true,
        },
      },
    },
    redact: {
      passwordx: undefined,
      password: {
        recursive: false,
      },
    },
  },
};

// Extra configurations are named after NODE_ENV and merged into config
// Providing .env-{NODE_ENV} file is preferable to editing this file
const configs = {};

// Unit testing
configs.test = {
  logging: {
    categories: {
      default: {
        file: 'silly',
        errorFile: 'on',
      },
      dog: {
        file: 'warn',
        console: 'warn',
      },
    },
  },
};

// To test CloudWatch Logs, set AWS_REGION environment variable
if (process.env.AWS_REGION) {
  configs.test.logging.categories.default.cloudWatch = 'info';
  configs.test.logging.categories.dog.cloudWatch = 'warn';
}

if (env in configs) {
  config = deepmerge(config, configs[env], { arrayMerge: (destination, source) => [...destination, ...source] });
}

module.exports = config;
