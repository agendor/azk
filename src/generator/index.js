import { _, config } from 'azk';

var glob = require('glob');
var path = require('path');
var fs   = require('fs');
var Handlebars = require('handlebars');

var template = path.join(
  config('azk_root'), 'src', 'share', 'Azkfile.mustach.js'
);

var generator = {
  __rules: {
    runtime  : [],
    database : [],
    tasks    : [],
  },

  load(dir) {
    _.each(glob.sync(path.join(dir, '**/*.js')), (file) => {
      var rule  = require(file).default || {};
      if (_.isArray(this.__rules[rule.type])) {
        rule.name = path.basename(file, ".js");
        this.__rules[rule.type].push(rule);
      }
    });
  },

  rule(name) {
    return _.find(this.rules, (rule) => { return rule.name == name });
  },

  get rules() {
    return [...this.__rules.runtime, ...this.__rules.database, ...this.__rules.tasks];
  },

  findSystems(dir) {
    var systems = [];

    return _.reduce(this.rules, (systems, rule) => {
      return systems.concat(rule.findSystems(dir, systems) || []);
    }, []);
  },

  get tpl() {
    if (!this._tpl)
      this._tpl = Handlebars.compile(fs.readFileSync(template).toString());
    return this._tpl;
  },

  render(data, file) {
    fs.writeFileSync(file, this.tpl(data));
  }
}

Handlebars.registerHelper('json', (data) => {
  return JSON.stringify(data || null, null, ' ')
    .replace(/\n/g, '')
    .replace(/^(\{|\[) /, '$1');
});

// Load default rules
generator.load(path.join(__dirname, "rules"));

export { generator }

