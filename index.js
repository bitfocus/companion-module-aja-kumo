import got from 'got';

import { InstanceBase, Regex, combineRgb, runEntrypoint } from '@companion-module/base'
import UpgradeScripts from './upgrades.js'

class AjaKumoInstance extends InstanceBase {
	watchForNewEvents() {
		if (this.connectionId === null) {
			return // Do not attempt to connect to a disabled connection
		}
		const request_con_id = this.connectionId
		const url = `http://${this.config.ip}/config?action=wait_for_config_events&configid=0&connectionid=${this.connectionId}`

		got.get(url).then(response => {
			if (this.connectionId === null) return // do not return an error here, since the kumo keeps old connections open for a second
			else if (request_con_id !== this.connectionId) return // this request came from an old connection

			let parsedResponse = JSON.parse(response.body.toString())

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
		})
		.catch(e => {
			this.log('error', `Error with new event ${e.message}`)
		})
	}

	async configUpdated(config) {
		if(this.config.ip === config.ip &&
			this.config.src_count === config.src_count &&
			this.config.dest_count === config.dest_count) return // Nothing updated

		this.disconnect()

		this.config = config

		this.connect()
	}

	async init(config) {
		this.config = config

		this.RECONNECT_TIME = 5 // Attempt a reconnect every 5 seconds
		this.CONNWAIT = 10 // Time to wait between each status connection (if 64x64, there will be 64*3 + 64*2 http conns made on enable)
		this.SALVO_COUNT = 8 // Number of salvos; currently, every Kumo model has 8 salvos

		this.names = {
			dest_name: {},
			src_name: {},
			salvo: {},
		}

		this.actions()
		this.initFeedbacks()

		this.connect()
	}

	getNameList(type = 'dest') {
		let list = []
		let count = this.config[`${type}_count`]
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

	getSalvoList() {
		let list = []

		for (let i = 1; i <= this.SALVO_COUNT; ++i) {
			list.push({
				id: i,
				label: i in this.names.salvo ? `${i}: ${this.names.salvo[i]}` : i
			})
		}

		return list
	}

	disconnect(reconnect = false) {
		this.updateStatus('disconnected')

		this.connectionId = null

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
		this.setDynamicVariable(`dest_${dest}`, src)
		this.checkFeedbacks('source_match')
		this.checkFeedbacks('destination_match')
	}

	setDynamicVariable(name, value) {
		const variable = {};
		variable[name] = value

		this.setVariableValues(variable)
	}

	device_reset() {
		this.connectionId = null
		this.reconnectTimeout = null
		this.srcToDestMap = {}

		this.selectedDestination = null
		this.selectedSource = null
		this.variables = [
			{ variableId: 'destination', name: 'Current pre-selected destination' },
			{ variableId: 'source', name: 'Current pre-selected source' }
		]
	}

	async connect() {
		this.device_reset()

		if(!this.config.ip) return

		this.updateStatus('connecting')

		const url = `http://${this.config.ip}/config?action=connect&configid=0`
		const ip = this.config.ip

		const parsedResponse = await got.get(url, {
			timeout: {
				request: 3000
			}
		})
			.json()
			.catch(e => {
				if(ip !== this.config.ip) return
				this.disconnect(true)
				this.updateStatus('connection_failure')
			})
		if(!parsedResponse || ip !== this.config.ip) return

		this.connectionId = parsedResponse.connectionid
		this.updateStatus('ok', 'Loading status...')

		// It could several seconds to get the initial status due to the many status requests we must make
		// So, we're going to get everything setup, then show the variables so the user doesn't have to wait
		// And then the vars will be populated as they come in
		let currentStatus = this.getCurrentStatus()
		this.initVariables()

		return Promise.all(currentStatus)
			.then(() => {
				this.updateStatus('ok')
				this.log('info', `Connected to device, connection ID ${this.connectionId}`)

				this.actions()
				this.initFeedbacks()
				this.watchForNewEvents()
				this.setLabelComboVariables('dest')
				this.setLabelComboVariables('src')
			}).catch(x => {
				if (this.connectionId === parsedResponse.connectionid) {
					// If connection is disabled before all promises, we don't want to try reconnecting
					this.disconnect(true)
				}
			})
	}

	createVariable(name, label) {
		this.variables.push({
			variableId: name,
			name: label
		})
	}

	getCurrentStatus() {
		let statusPromises = []
		let destsrc = ['dest', 'src']

		destsrc.forEach(x => {
			let title = x === 'dest' ? 'Destination' : 'Source'

			for (let i = 1; i <= this.config[`${x}_count`]; ++i) {
				if (x === 'dest') {
					this.createVariable(`dest_${i}`, `Destination ${i} source`)
					statusPromises.push(this.getParam('dest', { num: i }, statusPromises.length * this.CONNWAIT))
				}

				this.createVariable(`${x}_name_${i}_line1`, `${title} ${i} name, line 1`)
				this.createVariable(`${x}_name_${i}_line2`, `${title} ${i} name, line 2`)
				this.createVariable(`${x}_${i}_label_combo`, `${title} ${i} label with number, line 1 and 2`)
				statusPromises.push(this.getParam(`${x}_name`, { num: i, line: 1 }, statusPromises.length * this.CONNWAIT))
				statusPromises.push(this.getParam(`${x}_name`, { num: i, line: 2 }, statusPromises.length * this.CONNWAIT))
			}
		})

		for (let i = 1; i <= this.SALVO_COUNT; ++i) {
			this.createVariable(`salvo_name_${i}`, `Salvo ${i} name`)
			statusPromises.push(this.getParam('salvo', { num: i }, statusPromises.length * this.CONNWAIT))
		}

		return statusPromises
	}

	getParam(param, options, timewait) {
		const connectionId = this.connectionId
		let url

		if (param === 'dest') {
			url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Status`)
		} else if (param === 'dest_name') {
			url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Line_${options.line}`)
		} else if (param === 'src_name') {
			url = this.buildParamIdUrl(`eParamID_XPT_Source${options.num}_Line_${options.line}`)
		} else if (param === 'salvo') {
			url = this.buildParamIdUrl(`eParamID_Salvo${options.num}`)
		}

		return new Promise((resolve, reject) => {
			setTimeout(() => {
				if (connectionId !== this.connectionId) {
					return reject('Connection aborted.')
				}

				got.get(url).then((response) => {
					// Make sure we're consistent before updating anything, these should be aborted, but could not be...
					if (connectionId !== this.connectionId) reject()

					let parsedResponse = JSON.parse(response.body.toString())

					if (param === 'dest') {
						this.setSrcToDest(options.num, parsedResponse.value)
					} else if (param === 'dest_name' || param === 'src_name') {
						this.setSrcDestName(param, options, parsedResponse.value)
					} else if (param === 'salvo' && parsedResponse.value && parsedResponse.value.name) {
						this.setSalvoName(options.num, parsedResponse.value.name)
					}
					resolve()
				}).catch(x => {
					reject(x.message)
				})
			}, timewait)
		})
	}

	setSalvoName(num, name) {
		this.names['salvo'][num] = name
		this.setDynamicVariable(`salvo_name_${num}`, name)
	}

	buildParamIdUrl(param) {
		return `http://${this.config.ip}/config?action=get&configid=0&paramid=${param}`
	}

	// Create a combination string containing number and name lines, separated by newlines
	setLabelComboVariables(type) {
		for (var i = 1; i <= this.config[`${type}_count`]; i++) {
			if ( i in this.names[`${type}_name`] ) {
				var label_text
				label_text = `${i}\n` + this.names[`${type}_name`][i].join('\n')
				this.setDynamicVariable(
					`${type}_${i}_label_combo`,
					label_text
				)
			}
		}
	}

	setSrcDestName(param, options, value) {
		let line = parseInt(options.line) - 1

		if (!(options.num in this.names[param])) {
			this.names[param][options.num] = []
		}

		this.names[param][options.num][line] = value

		this.setDynamicVariable(`${param}_${options.num}_line${options.line}`, value)

	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'ip',
				label: 'IP Address',
				tooltip: 'Set the IP address of the KUMO router',
				regex: Regex.IP,
				width: 12,
			},
			{
				type: 'textinput',
				label: 'Source Count',
				id: 'src_count',
				default: 16,
				tooltip: 'Number of inputs/sources the router has.',
				regex: Regex.NUMBER,
			},
			{
				type: 'textinput',
				label: 'Destination Count',
				id: 'dest_count',
				default: 4,
				tooltip: 'Number of outputs/destinations the router has.',
				regex: Regex.NUMBER,
			}
		]
	}

	// When module gets deleted
	async destroy() {
		this.disconnect()
		this.updateStatus('disconnected')
	}

	actions(system) {
		const actions = {
			route: {
				name: 'Route a source (input) to a destination (output)',
				description: 'The primary command for routing. Use to set the Source and the Destination in a single button press.',
				options: [
					{
						type: 'dropdown',
						label: 'destination',
						id: 'destination',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getNameList('dest')
					},
					{
						type: 'dropdown',
						label: 'source',
						id: 'source',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getNameList('src')
					},
				],
				callback: async (event) => {
					const dest = await this.parseVariablesInString(event.options.destination);
					const src = await this.parseVariablesInString(event.options.source);

					this.actionCall(`eParamID_XPT_Destination${dest}_Status`, src)
					this.checkFeedbacks('source_match')
				}
			},
			destination: {
				name: 'Pre-select a destination',
				description: 'Sets a draft destination and Companion remembers it. Then next, use "Send source" action and this destination will be used.',
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'destination',
						default: '1',
						choices: this.getNameList()
					}
				],
				callback: (event) => {
					this.selectedDestination = event.options.destination
					this.setVariableValues({ destination: event.options.destination })
					this.checkFeedbacks('active_destination', 'source_match')
				},
			},
			source: {
				name: 'Send source to the pre-selected destination',
				description: 'Sends a route command with the Source being the one chosen here, and the Destination being the one pre-selected with the action "Pre-select".',
				options: [
					{
						type: 'dropdown',
						label: 'source number',
						id: 'source',
						default: 1,
						choices: this.getNameList()
					}
				],
				callback: async (event) => {
					const destination = this.getVariableValue('destination');
					this.selectedSource = event.options.source
					this.setVariableValues({ source: event.options.source })
					if (destination) {
						this.actionCall(`eParamID_XPT_Destination${destination}_Status`, event.options.source)
					}
					this.checkFeedbacks('active_source', 'source_match')
				}
			},
			salvo: {
				name: 'Take (apply) a salvo',
				options: [
					{
						type: 'dropdown',
						label: 'salvo',
						id: 'salvo',
						default: '1',
						choices: this.getSalvoList()
					},
				],
				callback: (event) => {
					this.actionCall('eParamID_TakeSalvo', event.options.salvo)
					this.checkFeedbacks('source_match')
				}
			},
			swap_sources: {
				name: 'Swap sources',
				description: 'Swap the sources of two specified destinations',
				options: [
					{
						type: 'dropdown',
						label: 'destination A',
						id: 'dest_A',
						default: '1',
						choices: this.getNameList()
					},
					{
						type: 'dropdown',
						label: 'destination B',
						id: 'dest_B',
						default: '2',
						choices: this.getNameList()
					},
				],
				callback: (event) => {
					let source_of_dest_A = this.srcToDestMap[event.options.dest_A]
					let source_of_dest_B = this.srcToDestMap[event.options.dest_B]
					this.actionCall(`eParamID_XPT_Destination${event.options.dest_A}_Status`, source_of_dest_B)
					this.actionCall(`eParamID_XPT_Destination${event.options.dest_B}_Status`, source_of_dest_A)
					this.checkFeedbacks('active_destination', 'source_match')
				}
			},
		}

		this.setActionDefinitions(actions)
	}

	actionCall(id, val, action = 'set') {
		const url = `http://${this.config.ip}/config?action=${action}&configid=0&paramid=${id}&value=${val}`

		got.get(url).then(response => {
			if (this.connectionId === null) reject()
		})
		.catch(e => {
			this.log('error', `Failed to send command to device: ${e}`)
		})
	}

	initVariables() {
		this.setVariableDefinitions(this.variables)
		this.setVariableValues({
			destination: 'Not yet selected',
			source: 'Not yet selected'
		})
	}

	initFeedbacks() {
		const feedbacks = {
			active_destination: {
				type: 'boolean',
				name: 'Selection of a destination button',
				description: 'When a destination button is selected in Companion.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0)
				},
				options: [{
					type: 'dropdown',
					label: 'Destination',
					id: 'destination',
					default: 1,
					choices: this.getNameList('dest'),
				}],
				callback: (feedback) => {
					return this.selectedDestination == feedback.options.destination
				}
			},
			active_source: {
				type: 'boolean',
				name: 'Selection of a source button',
				description: 'When a source button is selected in Companion.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0)
				},
				options: [{
					type: 'dropdown',
					label: 'Source',
					id: 'source',
					default: 1,
					choices: this.getNameList('src'),
				}],
				callback: (feedback) => {
					return this.selectedSource == feedback.options.source
				}
			},
			source_match: {
				type: 'boolean',
				name: 'Source matches the pre-selected destination',
				description: 'When this source is routed to the pre-selected destination remembered by Companion.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0)
				},
				options: [
					{
						type: 'dropdown',
						label: 'Source',
						id: 'source',
						default: 1,
						choices: this.getNameList('src')
					},
				],
				callback: (feedback) => {
					return this.selectedDestination in this.srcToDestMap && feedback.options.source == this.srcToDestMap[this.selectedDestination]
				}
			},
			destination_match: {
				type: 'boolean',
				name: 'Specific source is routed to a specific destination',
				description: 'When routing on this device changes to a specific source and destination.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0)
				},
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'dest',
						default: 1,
						choices: this.getNameList()
					},
					{
						type: 'dropdown',
						label: 'Source',
						id: 'src',
						default: 1,
						choices: this.getNameList('src')
					}
				],
				callback: (feedback) => {
					return feedback.options.dest in this.srcToDestMap
						&& this.srcToDestMap[feedback.options.dest] == feedback.options.src
				}
			},
		}

		this.setFeedbackDefinitions(feedbacks)
	}
}

runEntrypoint(AjaKumoInstance, UpgradeScripts)
