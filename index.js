const instance_skel = require('../../instance_skel')
const actions = require('./actions')
const feedbacks = require('./feedbacks')

let debug
let log

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.defineConst('RECONNECT_TIME', 5) // Attempt a reconnect every 5 seconds
		this.defineConst('CONNWAIT', 10) // Time to wait between each status connection (if 64x64, there will be 64*3 + 64*2 http conns made on enable)

		Object.assign(this, {
			...actions,
			...feedbacks
		})
	}

	static GetUpgradeScripts() {
		return [
			instance_skel.CreateConvertToBooleanFeedbackUpgradeScript({
				'active_destination': true,
				'active_source': true,
			})
		]
	}

	watchForNewEvents() {
		if (this.connectionId === null) {
			return // Do not attempt to connect to a disabled connection
		}
		const url = `http://${this.config.ip}/config?action=wait_for_config_events&configid=0&connectionid=${this.connectionId}`
		this._connectionAttempt = this.system.emit('rest_get', url, (err, response) => {
			this._connectionAttempt = null
			if (this.connectionId === null) {
				return
			}

			if (err !== null || response.response.statusCode !== 200) {
				this.disconnect(true)
			} else {
				let parsedResponse = JSON.parse(response.data.toString())

				if (Array.isArray(parsedResponse)) {
					parsedResponse.forEach((x) => {
						if(x.param_id) {
							let dest_update = x.param_id.match(/eParamID_XPT_Destination([0-9]{1,2})_Status/)
							if (dest_update !== null) {
								this.setSrcToDest(dest_update[1], x.int_value)
							}
						}
					})
				}
				this.watchForNewEvents()
			}
		})
	}

	updateConfig(config) {
		this.disconnect()

		this.config = config

		this.init()
	}

	init() {
		if (!this.config.input_count) this.config.input_count = 16
		if (!this.config.output_count) this.config.output_count = 4

		this.status(this.STATUS_UNKNOWN)

		this.names = {
			dest_name: {},
			src_name: {}
		}

		this.connectionId = null

		this.selectedDestination = null
		this.selectedSource = null
		this.reconnectTimeout = null
		this.srcToDestMap = []
		this.variables = [
			{ name: 'destination', label: 'Currently selected destination' },
			{ name: 'source', label: 'Currently selected source' }
		]

		if(this.config.ip) {
			this.connect()
		}
	}

	getNameList(type = 'dest') {
		let list = []
		let count = type === 'dest' ? this.config.output_count : this.config.input_count
		let nameType = `${type}_name`

		for (let i = 1; i <= count; ++i) {
			let name
			name = i in this.names[nameType] ? `${i}: ${this.names[nameType][i].join(' ')}` : i

			list.push({
				id: i,
				label: name
			})
		}

		return list
	}

	disconnect(reconnect = false) {
		this.status(this.STATUS_ERROR, 'Disconnected')

		this.connectionId = null
		if (this._connectionAttempt) {
			this._connectionAttempt = null
		}

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
		}

		if (reconnect) {
			this.reconnectTimeout = setTimeout(this.connect.bind(this), this.RECONNECT_TIME * 1000)
		}
	}

	setSrcToDest(dest, src) {
		if (dest in this.srcToDestMap && this.srcToDestMap[dest] === src) return // #nothingchanged
		this.srcToDestMap[dest] = src
		this.setVariable(`dest_${dest}`, src)
		this.checkFeedbacks('destination_match')
	}

	connect() {
		this.status(this.STATUS_WARNING, 'Connecting...')

		let url = `http://${this.config.ip}/config?action=connect&configid=0`
		this._connectionAttempt = this.system.emit('rest_get', url, (err, response) => {
			if (this._connectionAttempt === null) {
				return
			}

			this._connectionAttempt = null
			if (err !== null || response.response.statusCode !== 200) {
				this.status(this.STATUS_ERROR)
				this.disconnect(true)
			} else {
				let parsedResponse = JSON.parse(response.data.toString())
				this.connectionId = parsedResponse.connectionid
				this.status(this.STATUS_WARNING, 'Loading status...')

				// It could several seconds to get the initial status due to the many status requests we must make
				// So, we're going to get everything setup, then show the variables so the user doesn't have to wait
				// And then the vars will be populated as they come in
				let currentStatus = this.getCurrentStatus()
				this.initVariables()

				Promise.all(currentStatus)
					.then(() => {
						this.status(this.STATUS_OK, `Connection ID ${this.connectionId}`)

						this.actions()
						this.initFeedbacks()
						this.watchForNewEvents()
					}).catch(() => {
						if (this.connectionId === parsedResponse.connectionid) {
							// If connection is disabled before all promises, we don't want to try reconnecting
							this.disconnect(true)
						}
					})
			}
		})
	}

	createVariable(name, label) {
		this.variables.push({
			name: name,
			label: label
		})
	}

	getCurrentStatus() {
		let statusPromises = []
		for (let i = 1; i <= this.config.output_count; ++i) {
			this.createVariable(`dest_${i}`, `Destination ${i} source`)
			this.createVariable(`dest_name_${i}_line1`, `Destination ${i} name, line 1`)
			this.createVariable(`dest_name_${i}_line2`, `Destination ${i} name, line 2`)
			statusPromises.push(this.getSrcDestParam('dest', { num: i }, statusPromises.length * this.CONNWAIT))
			statusPromises.push(this.getSrcDestParam('dest_name', { num: i, line: 1 }, statusPromises.length * this.CONNWAIT))
			statusPromises.push(this.getSrcDestParam('dest_name', { num: i, line: 2 }, statusPromises.length * this.CONNWAIT))
		}

		for (let i = 1; i <= this.config.input_count; ++i) {
			this.createVariable(`src_name_${i}_line1`, `Source ${i} name, line 1`)
			this.createVariable(`src_name_${i}_line2`, `Source ${i} name, line 2`)
			statusPromises.push(this.getSrcDestParam('src_name', { num: i, line: 1 }, statusPromises.length * this.CONNWAIT))
			statusPromises.push(this.getSrcDestParam('src_name', { num: i, line: 2 }, statusPromises.length * this.CONNWAIT))
		}

		return statusPromises
	}

	getSrcDestParam(param, options, timewait) {
		const connectionId = this.connectionId
		let url

		if (param === 'dest') {
			url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Status`)
		} else if (param === 'dest_name') {
			url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Line_${options.line}`)
		} else if (param === 'src_name') {
			url = this.buildParamIdUrl(`eParamID_XPT_Source${options.num}_Line_${options.line}`)
		}

		return new Promise((resolve, reject) => {
			setTimeout(() => {
				if (connectionId !== this.connectionId) {
					return reject('Connection aborted.')
				}

				this.system.emit('rest_get', url, (err, response) => {
					// Make sure we're consistent before updating anything, these should be aborted, but could not be...
					if (connectionId !== this.connectionId) return

					if (err !== null || response.response.statusCode !== 200) {
						reject()
					} else {
						let parsedResponse = JSON.parse(response.data.toString())

						if (param === 'dest') {
							this.setSrcToDest(options.num, parsedResponse.value)
						}
						if (param === 'dest_name' || param === 'src_name') {
							this.setSrcDestName(param, options, parsedResponse.value)
						}
						resolve()
					}
				})
			}, timewait)
		})
	}

	buildParamIdUrl(param) {
		return `http://${this.config.ip}/config?action=get&configid=0&paramid=${param}`
	}

	setSrcDestName(param, options, value) {
		let line = parseInt(options.line) - 1

		if (!(options.num in this.names[param])) {
			this.names[param][options.num] = []
		}

		this.names[param][options.num][line] = value

		this.setVariable(`${param}_${options.num}_line${options.line}`, value)
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
				tooltip: 'Number of inputs/sources the router has.',
				regex: this.REGEX_NUMBER
			},
			{
				type: 'textinput',
				label: 'Output Count',
				id: 'output_count',
				default: 4,
				tooltip: 'Number of outputs/destinations the router has.',
				regex: this.REGEX_NUMBER
			}
		]
	}

	// When module gets deleted
	destroy() {
		this.disconnect()
		this.status(this.STATUS_UNKNOWN)
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
}
exports = module.exports = instance
