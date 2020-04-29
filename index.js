var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;

	self.actions();
}

instance.prototype.init = function() {
	var self = this;

	self.status(self.STATE_OK);

	debug = self.debug;
	log = self.log;
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'Set the IP here of your Kumo router'
		},
		{
			type: 'textinput',
			id: 'ip',
			label: 'IP Address',
			regex: self.REGEX_IP,
			width: 12
		}
	]
}

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	debug("destroy");
}

instance.prototype.actions = function(system) {
	var self = this;

	self.setActions({
		'route': {
			label: 'Route input to output',
			options: [
				{
					type: 'textinput',
					label: 'output',
					id: 'destination',
					default: '1',
					regex: self.REGEX_NUMBER
				},
				{
					type: 'textinput',
					label: 'source',
					id: 'source',
					default: '1',
					regex: self.REGEX_NUMBER
				}
			]
		},
		'salvo': {
			label: 'Send salvo command',
			options: [
				{
					type: 'textinput',
					label: 'salvo',
					id: 'salvo',
					default: '1',
					regex: self.REGEX_NUMBER
				}
			]
		}
	});
}

instance.prototype.action = function(action) {
	var self = this;
	var id = action.action;
	var cmd;

switch (id) {

	case 'route':
		cmd = `http://${self.config.ip}/config?action=set&configid=0&paramid=eParamID_XPT_Destination${action.options.destination}_Status&value=${action.options.source}`;
		break;

	case 'salvo':
		cmd = `http://${self.config.ip}/config?action=set&configid=0&paramid=eParamID_TakeSalvo&value=${action.options.salvo}`;
		break;
}
		self.system.emit('rest_get', cmd, function (err, result) {
			if (err !== null) {
				self.log('error', 'HTTP GET Request failed (' + result.error.code + ')');
				self.status(self.STATUS_ERROR, result.error.code);
			}
			else {
				self.status(self.STATUS_OK);
			}
		});
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
