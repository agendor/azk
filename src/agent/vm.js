import { _, path, config, log, isBlank, fsAsync } from 'azk';
import { subscribe, publish } from 'azk/utils/postal';
import { async, nbind, nfcall, thenAll, promisifyModule } from 'azk/utils/promises';
import Utils from 'azk/utils';
import { Tools } from 'azk/agent/tools';
import { SSH } from 'azk/agent/ssh';

var vbm  = require('vboxmanage');

var machine  = promisifyModule(vbm.machine );
var instance = promisifyModule(vbm.instance);
var hostonly = promisifyModule(vbm.hostonly);
var dhcp     = promisifyModule(vbm.dhcp    );
var _exec    = nbind(vbm.command.exec, vbm.command);

function exec(...args) {
  return _exec(...args).then((result) => {
    if (result[0] !== 0) {
      result[1] = "command: " + args.join(' ') + "\n\n" + result[1];
      throw new Error(result[1]);
    }
    return result[1];
  });
}

function modifyvm(name, ...options) {
  return exec("modifyvm", name, ...options);
}

var guestproperty = {
  set(vm_name, property, value, flags = null) {
    var args = ["guestproperty", "set", vm_name, property, value];
    if (_.isArray(flags)) {
      flags = flags.join(',');
    }
    if (_.isString(flags)) {
      args.push("--flags", flags);
    }
    return exec.apply(null, args);
  },

  get(vm_name, property) {
    return exec("guestproperty", "get", vm_name, property)
      .then((output) => {
        var result = null;
        if (!output.match(/No value set!/)) {
          result = vbm.parse.linebreak_list(output);
        }
        return _.isEmpty(result) ? {} : result[0];
      });
  },

  waitMatch: /^Name:\s*(.*?),\s*value:\s*(.*?),\s*flags:\s*(.*?)$/,

  wait(vm_name, property, timeout, fail = false) {
    var args = ["guestproperty", "wait", vm_name, property, "--timeout", timeout];
    if (fail) {
      args.push("--fail-on-timeout");
    }
    return exec.apply(null, args)
      .then((output) => {
        var match = output.trim().match(this.waitMatch);
        if (match) {
          return {
            Value: match[2],
            Flags: match[3].split(',').map((token) => token.trim())
          };
        }
        return {};
      });
  },
};

hostonly.getByName = function(name) {
  return this.list().then((list) => {
    return _.find(list, (net) => net.Name == name);
  });
};

dhcp.getByNetworkName = function(name) {
  return this.list_servers().then((list) => {
    return _.find(list, (server) => server.NetworkName == name);
  });
};

var hdds = {
  list() {
    return exec("list", "hdds").then((output) => {
      return vbm.parse.linebreak_list(output);
    });
  },

  close(file, remove) {
    var args = ["closemedium", "disk", file];
    if (remove) { args.push("--delete"); }
    return exec.apply(null, args);
  },

  clonehd(origin, target) {
    var self = this;
    return exec("clonehd", origin, target)
      .then(hdds.list)
      .then((hdds) => {
        var closes = [];
        _.each(hdds, (hdd) => {
          if (_.contains([origin, target], hdd.Location)) {
            closes.push(self.close(hdd.Location), hdd.Location == origin);
          }
        });
        return thenAll(closes);
      });
  },
};

function config_nat_interface(name, replace = false) {
  return async(function* () {
    var ssh_port  = yield Utils.net.getPort();
    var ssh_natpf = ["--natpf2", "ssh,tcp,127.0.0.1," + ssh_port + ",,22"];

    if (replace) {
      // Remove and add
      yield modifyvm(name, ["--natpf2", "delete", "ssh"]);
      yield modifyvm(name, ssh_natpf);
    } else {
      yield modifyvm(name, [
        "--nic2", "nat",
        "--nictype2", "virtio",
        "--cableconnected2", "on",
        ...ssh_natpf
      ]);
    }
  });
}

function config_dhcp(net, getway, net_mask, ip) {
  return async(function* () {
    var lower_ip = ip;
    var upper_ip = ip;
    yield dhcp.ensure_hostonly_server(net, getway, net_mask, lower_ip, upper_ip);
    yield dhcp.enable_hostonly_server(net);
  });
}

function config_net_interfaces(name, ip, use_dhcp) {
  return async(function* () {
    var result = yield exec("hostonlyif", "create");
    var inter  = result.match(/Interface '(.*)?'/)[1];

    yield modifyvm(name, [
      "--nic1", "hostonly",
      "--nictype1", "virtio",
      "--cableconnected1", "on",
      "--hostonlyadapter1", inter
    ]);

    // Configure dhcp server
    var gateway = Utils.net.calculateGatewayIp(ip);
    var network = Utils.net.calculateNetIp(ip);
    var netmask = "255.255.255.0";

    // nat interfance
    yield config_nat_interface(name);
    yield hostonly.configure_if(inter, gateway, netmask);

    // dhcp server
    if (use_dhcp) {
      yield config_dhcp(inter, gateway, netmask, ip);
    } else {
      var key_base = "/VirtualBox/D2D/eth0";
      return thenAll([
        guestproperty.set(name, `${key_base}/address`, ip),
        guestproperty.set(name, `${key_base}/netmask`, netmask),
        guestproperty.set(name, `${key_base}/network`, network),
      ]);
    }
  });
}

function config_share(name) {
  return async(this, function* () {
    yield exec(
      "sharedfolder", "add", name,
      "--name", "Root",
      "--hostpath", "/"
    );

    yield exec(
      "setextradata", name,
      "VBoxInternal2/SharedFoldersEnableSymlinksCreate/Root",
      "1"
    );
  });
}

function config_disks(name, boot, data) {
  var use_link = true;

  var storage_opts = [
    "storagectl"   , name  ,
    "--name"       , "SATA",
    "--add"        , "sata",
    "--hostiocache", "on"  ,
  ];

  var storage_boot = [
    "storageattach", name  ,
    "--storagectl" , "SATA",
    "--port"       , "0"   ,
    "--device"     , "0"   ,
    "--type"       , "dvddrive",
    "--medium"     , boot  ,
  ];

  var data_link   = `${data}.link`;
  var data_origin = path.join("./", path.basename(data));
  var storage_data = [
    "storageattach", name  ,
    "--storagectl" , "SATA",
    "--port"       , "1"   ,
    "--device"     , "0"   ,
    "--type"       , "hdd" ,
    "--medium"     , use_link ? data_link : data,
  ];

  return async(function* () {
    if (!(yield fsAsync.exists(data))) {
      var file   = data + ".tmp";
      var origin = config("agent:vm:blank_disk");
      yield Utils.unzip(origin, file).catch((err) => {
        throw new Error('Invalid disk file ' + origin + ', err: ' + err);
      });
      yield hdds.clonehd(file, data);
    }

    if (use_link) {
      yield fsAsync.remove(data_link).catch(() => {});
      yield fsAsync.symlink(data_origin, data_link, 'file');
    }

    yield exec.apply(null, storage_opts);
    yield exec.apply(null, storage_boot);
    yield exec.apply(null, storage_data);
  });
}

function acpipowerbutton(name) {
  return exec('controlvm', name, 'acpipowerbutton');
}

var vm = {
  info(vm_name) {
    return machine.info(vm_name).then((info) => {
      if (info['Forwarding(0)']) {
        var port = info['Forwarding(0)'].replace(/ssh,tcp,127.0.0.1,(.*),,22/, '$1');
        if (port) {
          info.ssh_port = port;
        }
      }
      return _.merge(info, { installed: true, running: info.VMState == "running" });
    }, (err) => {
      if (err.message.match(/cannot show vm info/)) {
        return { installed: false, running: false };
      }
      throw err;
    });
  },

  init(opts = {}) {
    opts = _.defaults(opts, {
      dhcp: false,
    });

    return Tools.async_status("vm", this, function* (status_change) {
      var name = opts.name;
      if (yield this.isInstalled(name)) {
        return false;
      }

      status_change("installing");
      yield exec("createvm", "--name", name, "--register");

      var cmd = [
        "--ostype", "Linux26_64",
        "--cpus", config("agent:vm:cpus"),
        "--memory", config("agent:vm:memory"),
        "--vram", "9",
        "--rtcuseutc", "on",
        "--acpi", "on",
        "--ioapic", "on",
        "--hpet", "on",
        "--hwvirtex", "on",
        "--vtxvpid", "on",
        "--largepages", "on",
        "--nestedpaging", "on",
        "--firmware", "bios",
        "--bioslogofadein", "off",
        "--bioslogofadeout", "off",
        "--bioslogodisplaytime", "0",
        "--biosbootmenu", "disabled",
        "--boot1", "dvd",
      ];

      var usage = yield nfcall(vbm.command.exec, "modifyvm");
      if (usage.join("\n").match(/--vtxux/)) {
        cmd.push('--vtxux', 'on');
      }

      yield modifyvm(name, cmd);
      yield config_net_interfaces(name, opts.ip, opts.dhcp);
      yield config_disks(name, opts.boot, opts.data);
      yield config_share(name);

      status_change("installed");

      return yield this.info(name);
    });
  },

  rename(old_name, new_name) {
    return this.isInstalled(old_name).then((installed) => {
      if (installed) {
        return modifyvm(old_name, ['--name', new_name]);
      }
    });
  },

  isInstalled(vm_name) {
    return this.info(vm_name).then((status) => {
      return status.installed;
    });
  },

  isRunnig(vm_name) {
    return this.info(vm_name).then((status) => {
      return status.running;
    });
  },

  // TODO: Move install to start
  start(vm_name, wait = false) {
    log.debug("[vm] call to start vm %s", vm_name);
    return Tools.async_status("vm", this, function* (status_change) {
      var info = yield vm.info(vm_name);

      if (info.installed && !(info.running)) {
        status_change("starting");
        // Reconfigures the interface nat all times
        yield config_nat_interface(vm_name, true);
        return instance.start(vm_name).then(() => {
          if (wait) {
            return this.waitReady(vm_name, wait);
          } else {
            status_change("started");
            return true;
          }
        });
      }
      return false;
    });
  },

  getProperty(...args) {
    return guestproperty.get(...args);
  },

  setProperty(...args) {
    return guestproperty.set(...args);
  },

  saveScreenShot(vm_name) {
    return async(this, function* () {
      var info = yield vm.info(vm_name);
      if (info.installed && info.running) {
        var dir  = config("agent:vm:screen_path");
        var file = path.join(dir, `${(new Date()).getTime()}.png`);
        yield fsAsync.mkdirs(dir);
        yield exec('controlvm', vm_name, 'screenshotpng', file);
        return file;
      }
      return null;
    });
  },

  waitReady(vm_name, timeout) {
    log.debug("[vm] waiting for the vm `%s` becomes available", vm_name);
    return Tools.async_status("vm", this, function* (status_change) {
      var info = yield vm.info(vm_name);
      var key  = "/VirtualBox/D2D/Done";

      if (info.installed && info.running) {
        var status = yield guestproperty.get(vm_name, key);
        if (status.Value !== "true") {
          status_change("waiting");
          status = yield guestproperty.wait(vm_name, key, timeout, false);
          if (status.Value === "true") {
            status_change("ready");
            return true;
          }
        } else {
          return true;
        }
      }

      return false;
    });
  },

  // TODO: Add treatment to when the lock virtualbox
  stop(vm_name, force = false, timeout = 30) {
    log.debug("[vm] call to stop vm %s", vm_name);

    return Tools.async_status("vm", this, function* (status_change) {
      var info = yield vm.info(vm_name);
      if (info.running) {
        status_change("stopping");

        var hrend, hrstart = process.hrtime();
        if (force) {
          yield instance.stop(vm_name);
        } else {
          yield acpipowerbutton(vm_name);
        }

        // Wait for shutdown
        while (true) {
          info  = yield this.info(vm_name);
          hrend = process.hrtime(hrstart);
          // Force after timeout
          if ((!force) && info.running && hrend[0] > timeout) {
            force = true;
            status_change("forced");
            yield instance.stop(vm_name);
          } else if (!info.running) {
            break;
          }
        }

        status_change("stopped");
        return true;
      }
      return false;
    });
  },

  remove(vm_name) {
    return Tools.async_status("vm", this, function* (status_change) {
      var info = yield vm.info(vm_name);

      if (info.name == vm_name) {
        status_change("removing");

        // Removing disk if it's not a link (old disk style)
        var disk_file = info['SATA-1-0'];
        if (!_.isEmpty(disk_file)) {

          var is_link = yield fsAsync.lstat(disk_file);

          if (!is_link.isSymbolicLink()) {
            yield exec("storagectl", vm_name, "--name", "SATA", "--remove");
            yield exec("closemedium", "disk", disk_file);
          }
        }

        // Remove networking interface
        if (!isBlank(info.hostonlyadapter1)) {
          var net    = yield hostonly.getByName(info.hostonlyadapter1);
          var server = yield dhcp.getByNetworkName(net.VBoxNetworkName);
          if (!_.isEmpty(net)) {
            if (!_.isEmpty(server)) {
              yield dhcp.remove_hostonly_server(info.hostonlyadapter1);
            }
            yield hostonly.remove_if(info.hostonlyadapter1);
          }
        }

        // Remove vm
        yield machine.remove(vm_name);

        status_change("removed");
      }
    });
  },

  make_ssh(vm_name) {
    return async(this, function* () {
      var info = yield this.info(vm_name);
      if (info.running) {
        return new SSH('127.0.0.1', info.ssh_port);
      } else {
        throw new Error("vm is not running");
      }
    });
  },

  ssh(name, cmd, wait = false) {
    return this.make_ssh(name).then((ssh) => { return ssh.exec(cmd, wait); });
  },

  copyFile(name, origin, target) {
    return this.make_ssh(name).then((ssh) => { return ssh.putFile(origin, target); });
  },

  copyVMFile(name, origin, target) {
    return this.make_ssh(name).then((ssh) => { return ssh.getFile(origin, target); });
  },

  mount(vm_name, share, point, opts = {}) {
    _.defaults(opts, {
      umask: "0000",
      gid  : "vboxsf",
      uid  : config("agent:vm:user"),
    });

    // object to array of the key=value
    opts = _.reduce(opts, (acc, value, key) => {
      acc.push(`${key}=${value}`); return acc;
    }, []);

    var mount = `sudo mount -t vboxsf -o ${opts.join(',')} ${share} ${point}`;
    var check = `mount | grep "${point}\\s" &>/dev/null`;
    var cmd   = [
      `if sudo modprobe vboxguest &> /dev/null && sudo modprobe vboxsf &> /dev/null; then`,
      `  [ -d "${point}" ] || { sudo mkdir -p ${point}; } ;`,
      "  { " + check + " || " + mount + "; } ;",
      "fi"
    ].join(" ");

    var stderr = "";

    var _subscription = subscribe('agent.vm.ssh.status', (event) => {
      if (event.type == "ssh" && event.context == "stderr") {
        stderr += event.data.toString();
      }
      publish('agent.vm.mount.status', event);
    });

    return VM.ssh(vm_name, cmd).then((code) => {
      if (code !== 0) {
        throw new Error('not mount share files, error:\n' + stderr);
      }
      _subscription.unsubscribe();
    })
    .catch(function (err) {
      _subscription.unsubscribe();
      throw err;
    });
  },
};

var VM = vm;
export { VM, dhcp, hostonly };
