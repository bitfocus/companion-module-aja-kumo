const instance_skel = require('../../instance_skel')
const actions = require('./actions')
const { executeFeedback, initFeedbacks } = require('./feedbacks')

let debug
let log

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		Object.assign(this, {
			...actions
		})

		this.init()
		this.selectedDestination = null
		this.selectedSource = null
	}

	updateConfig(config) {
		if (this.connectionId !== null) {
			this.disconnect()
		}

		this.config = config

		this.init();

		//this.actions()
		//this.init_feedbacks()
		//this.initVariables()
	}

	init() {
		this.status(this.STATUS_UNKNOWN)

		this.connectionId = null

		this.selectedDestination = null
		this.selectedSource = null
		this.routeRefresh = []
		this.variables = [
			{ name: 'destination', label: 'Currently selected destination' },
			{ name: 'source', label: 'Currently selected source' }
		]

		if(this.config.ip) {
			this.connect()
		}
		//this.initVariables()
	}

	disconnect() {
		if (this._connectionAttempt) {
			this._connectionAttempt.abort()
			this._connectionAttempt = null
		}
		// Abort any open route refreshes
		this.routeRefresh.every((x) => !x || x.abort())

		this.connectionId = null
	}

	connect() {
		if (!this.config.input_count) this.config.input_count = 16
		if (!this.config.output_count) this.config.output_count = 4

		let url = `http://${this.config.ip}/config?action=connect&configid=0`
		this._connectionAttempt = this.system.emit('rest_get', url, (err, response) => {
			this._connectionAttempt = null;
			if (err !== null || response.response.statusCode !== 200) {
				this.connectionId = null
				this.status(this.STATUS_ERROR)
			} else {
				let parsedResponse = JSON.parse(response.data.toString());
				this.connectionId = parsedResponse.connectionid
				this.status(this.STATUS_OK, `Connection ID ${this.connectionId}`)

				this.initalizeAllRoutes()
				this.initVariables()
			}
		})
	}

	initalizeAllRoutes() {
		for (let i = 1; i <= this.config.output_count; ++i) {
			this.variables.push({
				name: `destination_${i}`,
				label: `Destination ${i} source`
			})

			this.refreshRoute(i)
		}
	}

	refreshRoute(output) {
		const connectionId = this.connectionId
		const url = `http://${this.config.ip}/config?action=get&configid=0&paramid=eParamID_XPT_Destination${output}_Status`;

		this.routeRefresh[output] = this.system.emit('rest_get', url, (err, response) => {
			// Make sure we're consistent before updating anything, these should be aborted, but just in case not...
			if (connectionId !== this.connectionId) return;

			if (err !== null || response.response.statusCode !== 200) {
				this.status(this.STATUS_WARNING, 'Error getting route status')
			} else {
				delete this.routeRefresh[output]
				let parsedResponse = JSON.parse(response.data.toString());
				this.setVariable(`destination_${output}`, parsedResponse.value)
			}
		})
	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'textinput',
				id: 'ip',
				label: 'IP Address',
				tooltip: 'Set the IP here of your Kumo router',
				regex: this.REGEX_IP,
				width: 12,
			},
			{
				type: 'textinput',
				label: 'Input Count',
				id: 'input_count',
				default: 16,
				tooltip: 'Number of inputs the router has.',
				regex: this.REGEX_NUMBER
			},
			{
				type: 'textinput',
				label: 'Output Count',
				id: 'output_count',
				default: 4,
				tooltip: 'Number of destinations the router has.',
				regex: this.REGEX_NUMBER
			}
		]
	}

	// When module gets deleted
	destroy() {
		debug('destroy')
	}

	actions(system) {
		this.setActions(this.getActions())
	}

	action(action) {
		let id = action.action
		let cmd

		switch (id) {
			case 'destination':
				this.selectedDestination = action.options.destination
				this.setVariable('destination', action.options.destination)
				break
				
			case 'source':
				this.selectedSource = action.options.source
				this.setVariable('source', action.options.source)
				this.getVariable('destination', destination => {
					if(destination) {
						cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_XPT_Destination${destination}_Status&value=${action.options.source}`
					}
				})
				break

			case 'route':
				cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_XPT_Destination${action.options.destination}_Status&value=${action.options.source}`
				break

			case 'salvo':
				cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_TakeSalvo&value=${action.options.salvo}`
				break
		}
		this.checkFeedbacks('active_destination')
		this.checkFeedbacks('active_source')
		this.system.emit('rest_get', cmd, (err, result) => {
			if (err !== null) {
				this.log('error', 'HTTP GET Request failed (' + result.error.code + ')')
				this.status(this.STATUS_ERROR, result.error.code)
			} else {
				this.status(this.STATUS_OK)
			}
		})
	}

	initVariables() {
		this.setVariableDefinitions(this.variables)
		this.setVariable('destination', 'Not yet selected')
		this.setVariable('source', 'Not yet selected')
	}

	/**
	 * Set available feedback choices
	 */
	init_feedbacks() {
		const feedbacks = initFeedbacks.bind(this)()
		this.setFeedbackDefinitions(feedbacks)
	}

	/**
	 * Execute feedback
	 * @param  {} feedback
	 * @param  {} bank
	 */
	feedback(feedback, bank) {
		return executeFeedback.bind(this)(feedback, bank)
	}
}
exports = module.exports = instance
