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
	}

	updateConfig(config) {
		this.config = config
		this.actions()
		this.init_feedbacks()
		this.initVariables()
	}

	init() {
		this.status(this.STATE_OK)
		debug = this.debug
		log = this.log
		this.actions()
		this.init_feedbacks()
		this.initVariables()
	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'Set the IP here of your Kumo router',
			},
			{
				type: 'textinput',
				id: 'ip',
				label: 'IP Address',
				regex: this.REGEX_IP,
				width: 12,
			},
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

			case 'sourceToDestination':
				if (this.selectedDestination) {
					cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_XPT_Destination${action.options.destination}_Status&value=${action.options.source}`
				} else {
					this.log('error', 'Select destination first')
				}
				break

			case 'route':
				cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_XPT_Destination${action.options.destination}_Status&value=${action.options.source}`
				break

			case 'salvo':
				cmd = `http://${this.config.ip}/config?action=set&configid=0&paramid=eParamID_TakeSalvo&value=${action.options.salvo}`
				break
		}
		this.checkFeedbacks('active_destination')
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
		let variables = [{ name: 'destination', label: 'Selected Destination' }]
		this.setVariableDefinitions(variables)
		this.setVariable('destination', 'Not yet selected')
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
