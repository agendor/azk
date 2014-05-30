import { _ } from 'azk/utils';
var path    = require('path');
var dnsSync = require('dns-sync');

// Root path
var azk_root =
  process.env.AZK_ROOT_PATH ||
  path.join('..', '..');

var data_path =
  process.env.AZK_DATA_PATH ||
  path.join(process.env.HOME, '.azk', 'data');

// Use virtual machine
var requires_vm = process.platform == 'linux' ?
  (process.env.AZK_USE_VM || false) : true;

// Vm informations
// TODO: Show erro if not resolve ip
var vm_name = "azk-agent";
var vm_ip   = dnsSync.resolve(vm_name);

// Docker opts
var docker_host =
  process.env.AZK_DOCKER_HOST || process.env.DOCKER_HOST ||
  (requires_vm ? "http://azk-agent:4243" : "unix:///var/run/docker.sock");

// Log level
var log_level = process.env.AZK_DEBUG ? 'debug' : 'warn';

function merge(options) {
  _.each(options, (values, key) => {
    if (key != '*')
      options[key] = _.merge({}, options['*'], values);
  });
  return options;
}

var options = merge({
  '*': {
    manifest: "Azkfile.js",
    locale  : 'en-US',
    paths   : {
      azk_root,
      data  : data_path,
      log   : path.join(data_path, 'logs', 'azk.log'),

      agent_pid: path.join(data_path, 'run', 'agent.pid'),
      unfsd_pid: path.join(data_path, 'run', 'unfsd.pid'),
      memcached_pid: path.join(data_path, 'run', 'memcachedjs.pid'),
      hipache_pid: path.join(data_path, 'run', 'hipache.pid'),

      agent_socket : path.join(data_path, 'run', 'agent.socket'),
      memcached_socket : path.join(data_path, 'run', 'memcachedjs.socket'),
      unfsd_file   : path.join(data_path, 'run', 'exports'),
      balancer_file: path.join(data_path, 'run', 'hipache.json'),

      unfsd: process.env.AZK_UNFSD_PATH,
    },
    logs_level: {
      console: (process.env.AZK_DEBUG ? 'debug' : 'warn'),
      file: process.env.AZK_LOG_LEVEL || 'info',
    },
    docker  : {
      host          : docker_host,
      namespace     : 'azk',
      repository    : 'azk',
      image_default : 'racker/precise-with-updates:latest',
    },
    agent: {
      port: 8080,
      requires_vm: requires_vm,
      portrange_start: 11000,
      vm: {
        ip         : vm_ip,
        name       : vm_name,
        user       : "docker",
        password   : "live",
        boot_disk  : path.join(data_path, "vm", "debian2docker.iso"),
        data_disk  : path.join(data_path, "vm", "azk-agent.vmdk"),
        blank_disk : path.join(data_path, "vm", "azk-agent.vmdk.bz"),
        mount_point: '/home/docker/files'
      }
    }
  },
  test: {
    paths: {
      log: path.join(data_path, 'logs', 'azk_test.log'),
    },
    docker: {
      namespace   : 'azk.test',
      repository  : 'azk-test',
      image_empty : 'cevich/empty_base_image',
    },
    agent: {
      vm: {
        data_disk : path.join(data_path, "vm", "azk-agent-spec.vmdk"),
      }
    }
  }
});

function env() {
  return process.env.NODE_ENV || 'production';
}

export function get(key) {
  if (key == "env") return env();

  var keys   = key.split(':');
  var buffer = options[env()] || options['*'];

  for(var i = 0; i < keys.length; i++) {
    buffer = buffer[keys[i]];
    if (!buffer) break;
  }

  return buffer;
};

export function set(key, value) {
  if (key == "env") {
    process.env.NODE_ENV = value;
  } else {
    var keys   = [env(), ...key.split(':')];
    var buffer = { [keys.pop()]: value };
    while(key  = keys.pop()) { buffer = { [key]: buffer } };

    // Check env exist
    if (!options[env()]) {
      options[env()] = _.cloneDeep(options['*']);
    }

    _.merge(options, buffer);
  }
  return value;
}
