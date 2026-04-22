import got from 'got'
import { CookieJar } from 'tough-cookie'

import { InstanceBase, Regex, combineRgb, runEntrypoint, InstanceStatus } from '@companion-module/base'
import * as CHOICES from './choices.js'

import UpgradeScripts from './upgrades.js'
class AjaKumoInstance extends InstanceBase {
	constructor(internal) {
		// super-constructor
		super(internal)
		this.RECONNECT_TIME = 5 // Attempt a reconnect every 5 seconds
		this.CONNWAIT = 10 // Time to wait between each status connection (if 64x64, there will be 64*3 + 64*2 http conns made on enable)
		this.SALVO_COUNT = 8 // Number of salvos; currently, every Kumo model has 8 salvos
		this.destSrc = ['dest', 'src']
		this.waitingForNewEvent = false
		this.needConnect = false
		this.connecting = false

		this.names = {
			dest_name: {},
			src_name: {},
			salvo: {},
		}
		this.globalVars = {}

		this.cookieJar = new CookieJar() // CookieJar for storing auth cookies
	}

	// interval to re-start event watcher when necessary
	async waitForNewEvents(self) {
		if (self.needConnect && !self.connecting) {
			await self.connect()
		}
		if (!this.waitingForNewEvent) {
			await self.getNewEvent()
		}
		setTimeout(self.waitForNewEvents, 10, self)
	}

	async getNewEvent() {
		if (this.connectionId === null || this.waitingForNewEvent) {
			return // Do not attempt to connect to a disabled connection
		}
		const request_con_id = this.connectionId
		const url = `http://${this.config.ip}/config?action=wait_for_config_events&configid=0&connectionid=${this.connectionId}`
		this.waitingForNewEvent = true

		try {
			const response = await got(url, { cookieJar: this.cookieJar, timeout: { request: 10000 } })

			if (this.connectionId === null)
				return // do not return an error here, since the kumo keeps old connections open for a second
			else if (request_con_id !== this.connectionId) return // this request came from an old connection

			const parsedResponse = JSON.parse(response.body.toString())

			if (Array.isArray(parsedResponse)) {
				parsedResponse.forEach((x) => {
					// this.log('info', `< ${x.param_id}`)
					let param
					if (x.param_id) {
						let dest_update = x.param_id.match(/eParamID_XPT_Destination([0-9]{1,2})/)
						let src_update = x.param_id.match(/eParamID_XPT_Source([0-9]{1,2})/)
						let salvo_update = x.param_id.match(/eParamID_Salvo([0-9]{1,2})/)

						if (dest_update !== null) {
							//						let dest_update = x.param_id.match(/eParamID_XPT_Destination([0-9]{1,2})_Status/)
							param = x.param_id.split('_').pop()
							switch (param) {
								case 'Status':
									this.setSrcToDest(dest_update[1], x.int_value)
									break
								case 'Locked':
									this.destination_locked[dest_update[1]] = x.int_value == 1
									this.setDynamicVariable(`dest_${dest_update[1]}_locked`, x.int_value == 1)
									this.checkFeedbacks('destination_locked')
									break
								case '1':
								case '2':
									this.setSrcDestName('dest_name', { num: dest_update[1], line: param }, x.str_value)
									break
							}
						}
						if (src_update !== null) {
							param = x.param_id.split('_').pop()
							this.setSrcDestName('src_name', { num: src_update[1], line: param }, x.str_value)
						}
						if (salvo_update !== null) {
							this.setSalvoName(salvo_update[1], x.str_value.name)
						}
					}
				})
			}
			this.waitingForNewEvent = false
			//	this.watchForNewEvents() // calling itself without 'returning' will eventually cause a stack overflow
		} catch (e) {
			if (e.code === 'ETIMEDOUT') {
				this.log('error', 'Lost connection for 10000ms, attempting to reconnect')
			} else {
				this.log('error', `Error with new event: ${e.message}, will attempt to reconnect...`)
			}
			// Attempt to reconnect since things could now be out of sync with the device
			await this.disconnect(true)
			this.waitingForNewEvent = false
		}
	}

	async configUpdated(config) {
		if (
			this.config.ip === config.ip &&
			this.config.src_count === config.src_count &&
			this.config.dest_count === config.dest_count &&
			this.config.password === config.password
		)
			return // Nothing updated

		await this.disconnect()

		this.config = config

		this.needConnect = true
	}

	async init(config) {
		this.config = config

		this.needConnect = true

		setTimeout(this.waitForNewEvents, 100, this)
		//await this.waitForNewEvents(this)
	}

	getNameList(type = 'dest') {
		const list = []
		const count = this.config[`${type}_count`]
		const nameType = `${type}_name`
		const nameCount = Object.keys(this.names[nameType]).length

		// this.log('debug', `get ${type} list, ${nameCount} names `)

		for (let i = 1; i <= count; i++) {
			const name = i in this.names[nameType] ? `${i}: ${this.names[nameType][i].join(' ')}` : `${i}`

			list.push({
				id: `${i}`,
				label: name,
			})
		}

		return list
	}

	getSalvoList() {
		const list = []

		for (let i = 1; i <= this.SALVO_COUNT; i++) {
			list.push({
				id: `${i}`,
				label: i in this.names.salvo ? `${i}: ${this.names.salvo[i]}` : `${i}`,
			})
		}

		return list
	}

	async disconnect(reconnect = false) {
		this.connecting = false
		this.needConnect = false

		this.connectionId = null
		this.cookieJar.removeAllCookies()

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			delete this.reconnectTimeout
		}

		this.updateStatus(InstanceStatus.Disconnected, 'Disconnected')

		if (reconnect) {
			this.reconnectTimeout = setTimeout(() => (this.needConnect = true), this.RECONNECT_TIME * 1000)
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
		const variable = {}
		variable[name] = value

		this.setVariableValues(variable)
	}

	device_reset() {
		this.connectionId = null
		this.srcToDestMap = {}
		this.destination_locked = {}
		this.globalVars = {}

		this.selectedDestination = null
		this.selectedSource = null
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			delete this.reconnectTimeout
		}

		this.variables = [
			{ variableId: 'destination', name: 'Current pre-selected destination' },
			{ variableId: 'source', name: 'Current pre-selected source' },
		]
	}

	async connect() {
		this.device_reset()

		if (!this.config.ip) return

		this.updateStatus(InstanceStatus.Connecting, 'Connecting')
		this.connecting = true

		const ip = this.config.ip
		const url = `http://${ip}/config?action=connect&configid=0`
		const password = this.config.password

		if (password) {
			this.log('debug', 'Attempting to get auth cookies')
			try {
				const authResponse = await got
					.post(`http://${ip}/authenticator/login`, {
						form: {
							password_provided: password,
						},
						timeout: {
							request: 3000,
						},
						cookieJar: this.cookieJar,
					})
					.json()
			} catch (e) {
				if (e.code === 'ETIMEDOUT') {
					this.log('error', `Could not reach AJA KUMO at ${ip}`)
				} else {
					this.log('error', `Unknown error during authentication: ${e.toString()}`)
				}
				await this.disconnect()
				this.updateStatus(InstanceStatus.ConnectionFailure, 'Connection_failure')
			}

			// Don't continue if original auth request fails, gets retried in the catch
			if (!authResponse) return

			if (authResponse.login != 'success') {
				this.log('error', 'Authentication failed')
				this.log('debug', 'Authentication response: ' + authResponse.login)
				await this.disconnect() // Don't retry until password has been updated
				this.updateStatus(InstanceStatus.BadConfig, 'Wrong password')
				return
			}
		}

		try {
			const parsedResponse = await got(url, {
				timeout: {
					request: 3000,
				},
				cookieJar: this.cookieJar,
			}).json()

			if (!parsedResponse || ip !== this.config.ip) return

			this.connectionId = parsedResponse.connectionid
		} catch (e) {
			if (ip !== this.config.ip) return
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Connection failure')
			switch (e.code) {
				case 'ETIMEDOUT':
					this.log('error', `Could not reach AJA KUMO at ${ip}`)
					break
				case 'ERR_NON_2XX_3XX_RESPONSE':
					this.log('error', 'Missing password')
					this.updateStatus(InstanceStatus.BadConfig, 'Missing password')
					// Disable reconnecting until password has been added
					clearTimeout(this.reconnectTimeout)
					break
				default:
					this.log('error', `Unknown error during connecting: ${e.toString()}`)
			}
			await this.disconnect(true)
		}

		this.updateStatus(InstanceStatus.Connecting, 'Loading status...')

		this.initVariables()

		// It could several seconds to get the initial status due to the many status requests we must make
		// So, we're going to get everything setup, then show the variables so the user doesn't have to wait
		// And then the vars will be populated as they come in
		//const currentStatus = this.getCurrentStatus()

		// We need to batch the requests, otherwise frames larger than 32 get pummelled with data requests
		this.dataCount = 0

		let initialData = this.getSalvoStatus()

		CHOICES.singleParameters.forEach((x) => {
			//const url = this.buildParamIdUrl(x.id)
			initialData.push(this.getParam('global', { id: x.id, desc: x.name }, this.CONNWAIT))
		})

		this.destSrc.forEach((x) => {
			const e = this.config[`${x}_count`]
			initialData.push(...this.getCurrentStatus(x, { from: 1, to: e }))
		})

		this.dataTotal = initialData.length

		//this.log('debug', `Data Total ${this.dataTotal}`)
		while (initialData.length > 0) {
			const e = initialData.length
			let results = []
			for (let b = 0; b <= e; b += 32) {
				results.push(...(await Promise.allSettled(initialData.slice(b, Math.min(e, b + 32)))))
			}
			// rebuild initialData to account for any 'rejected' requests
			const unresolved = initialData.reduce((acc, item, idx) => {
				if (results[idx].status == 'rejected') {
					acc.push(item)
				}
				return acc
			}, [])
			initialData = [...unresolved]
		}

		this.updateStatus(InstanceStatus.Ok, 'Connected')
		this.log('info', `Connected to device, connection ID ${this.connectionId}`)

		this.actions()
		this.initFeedbacks()
		this.initPresets()
		this.needConnect = false
		this.connecting = false
	}

	createVariable(name, label) {
		const ret = {
			variableId: name,
			name: label,
		}
		this.variables.push(ret)
		return ret
	}

	getCurrentStatus(x, range) {
		const statusPromises = []

		let title = x === 'dest' ? 'Destination' : 'Source'

		for (let i = range.from; i <= range.to; i++) {
			if (x === 'dest') {
				statusPromises.push(this.getParam('dest', { num: i }, range.from * statusPromises.length * this.CONNWAIT))
				statusPromises.push(this.getParam('locked', { num: i }, range.from * statusPromises.length * this.CONNWAIT))
			}

			statusPromises.push(
				this.getParam(`${x}_name`, { num: i, line: 1 }, range.from * statusPromises.length * this.CONNWAIT)
			)
			statusPromises.push(
				this.getParam(`${x}_name`, { num: i, line: 2 }, range.from * statusPromises.length * this.CONNWAIT)
			)
		}
		//this.log('debug', `returning ${statusPromises.length} promises`)
		return statusPromises
	}

	getSalvoStatus() {
		const statusPromises = []
		for (let i = 1; i <= this.SALVO_COUNT; i++) {
			statusPromises.push(this.getParam('salvo', { num: i }, statusPromises.length * this.CONNWAIT))
		}

		return statusPromises
	}

	getParam(param, options, timewait) {
		const connectionId = this.connectionId
		let url

		switch (param) {
			case 'dest':
				url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Status`)
				break
			case 'dest_name':
				url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Line_${options.line}`)
				break
			case 'src_name':
				url = this.buildParamIdUrl(`eParamID_XPT_Source${options.num}_Line_${options.line}`)
				break
			case 'salvo':
				url = this.buildParamIdUrl(`eParamID_Salvo${options.num}`)
				break
			case 'locked':
				url = this.buildParamIdUrl(`eParamID_XPT_Destination${options.num}_Locked`)
				break
			case 'global':
				url = this.buildParamIdUrl(`eParamID_${options.id}`)
				break
		}

		return new Promise((resolve, reject) => {
			setTimeout(() => {
				if (connectionId !== this.connectionId) {
					return reject('Connection aborted.')
				}

				got
					.get(url, { cookieJar: this.cookieJar })
					.then((response) => {
						// Make sure we're consistent before updating anything, these should be aborted, but could not be...
						if (connectionId !== this.connectionId) reject()

						let parsedResponse = JSON.parse(response.body.toString())

						switch (param) {
							case 'dest':
								this.setSrcToDest(options.num, parsedResponse.value)
								break
							case 'dest_name':
							case 'src_name':
								this.setSrcDestName(param, options, parsedResponse.value)
								break
							case 'salvo':
								this.setSalvoName(options.num, parsedResponse.value.name)
								break
							case 'locked':
								this.setDynamicVariable(`dest_${options.num}_locked`, parsedResponse.value == 1)
								this.destination_locked[options.num] = parsedResponse.value == 1
								break
							case 'global':
								this.setDynamicVariable(options.id, parsedResponse.value)
								this.globalVars[options.id] = parsedResponse.value
								if (options.id == 'KumoProductID') {
									this.globalVars['KumoProductName'] = parsedResponse.value_name
									this.setDynamicVariable('KumoProductName', parsedResponse.value_name)
								}
						}

						resolve(`${param}:${options.num}`)
					})
					.catch((x) => {
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

	setSrcDestName(param, options, value) {
		const line = parseInt(options.line) - 1
		const thisLine = value || ''
		let comboText = ''
		let comboName = param.split('_')[0] + `_${options.num}_label_combo`

		if (!(options.num in this.names[param])) {
			this.names[param][options.num] = []
		}

		this.names[param][options.num][line] = thisLine
		this.setDynamicVariable(`${param}_${options.num}_line${options.line}`, thisLine)
		let otherLine = this.names[param][options.num][1 - line] || ''

		if (line == 0) {
			comboText = thisLine + '\n' + otherLine
		} else {
			comboText = otherLine + '\n' + thisLine
		}
		this.setDynamicVariable(comboName, comboText)
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
				id: 'password',
				label: 'Password',
				tooltip: 'Password if authentication is enabled, leave blank if not',
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
			},
		]
	}

	// When module gets deleted
	async destroy() {
		await this.disconnect()
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			delete this.reconnectTimeout
		}
	}

	actions() {
		const actions = {
			route: {
				name: 'Route a source (input) to a destination (output)',
				description:
					'For explicitly routing a source to a destination. Used to perform a route in a single button press.',
				options: [
					{
						type: 'dropdown',
						label: 'destination',
						id: 'destination',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getNameList('dest'),
					},
					{
						type: 'dropdown',
						label: 'source',
						id: 'source',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getNameList('src'),
					},
				],
				callback: async (event, context) => {
					const dest = await context.parseVariablesInString(`${event.options.destination}`)
					const src = await context.parseVariablesInString(`${event.options.source}`)

					await this.actionCall(`eParamID_XPT_Destination${dest}_Status`, src)
					this.checkFeedbacks('source_match')
				},
			},
			destination: {
				name: 'Pre-select a destination',
				description:
					'Sets a draft destination and Companion remembers it. Then next, use "Send source" action and this destination will be used.',
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'destination',
						default: '1',
						choices: this.getNameList('dest'),
					},
				],
				callback: async (event, context) => {
					this.selectedDestination = event.options.destination
					this.setVariableValues({ destination: this.selectedDestination })
					this.checkFeedbacks('active_destination', 'source_match')
				},
			},
			source: {
				name: 'Send source to the pre-selected destination',
				description:
					'Sends a route command with the Source being the one chosen here, and the Destination being the one pre-selected with the action "Pre-select".',
				options: [
					{
						type: 'dropdown',
						label: 'source number',
						id: 'source',
						default: '1',
						choices: this.getNameList('src'),
					},
				],
				callback: async (event, context) => {
					const destination = this.getVariableValue('destination')
					this.selectedSource = await context.parseVariablesInString(`${event.options.source}`)
					this.setVariableValues({ source: this.selectedSource })
					if (destination) {
						await this.actionCall(`eParamID_XPT_Destination${destination}_Status`, this.selectedSource)
					}
					this.checkFeedbacks('active_source', 'source_match')
				},
			},
			salvo: {
				name: 'Take (apply) a salvo',
				options: [
					{
						type: 'dropdown',
						label: 'salvo',
						id: 'salvo',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getSalvoList(),
					},
				],
				callback: async (event, context) => {
					await this.actionCall('eParamID_TakeSalvo', await context.parseVariablesInString(`${event.options.salvo}`))
					this.checkFeedbacks('source_match')
				},
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
						choices: this.getNameList('dest'),
					},
					{
						type: 'dropdown',
						label: 'destination B',
						id: 'dest_B',
						default: '2',
						choices: this.getNameList('dest'),
					},
				],
				callback: async (event) => {
					const source_of_dest_A = this.srcToDestMap[event.options.dest_A]
					const source_of_dest_B = this.srcToDestMap[event.options.dest_B]
					await this.actionCall(`eParamID_XPT_Destination${event.options.dest_A}_Status`, source_of_dest_B)
					await this.actionCall(`eParamID_XPT_Destination${event.options.dest_B}_Status`, source_of_dest_A)
					this.checkFeedbacks('active_destination', 'source_match')
				},
			},
			lock: {
				name: 'Lock/Unlock destination',
				description: 'Lock or unlock a destination to prevent or allow routing changes.',
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'destination',
						default: '1',
						useVariables: true,
						allowCustom: true,
						choices: this.getNameList('dest'),
					},
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						default: '1',
						choices: [
							{ id: '1', label: 'Lock' },
							{ id: '0', label: 'Unlock' },
							{ id: '2', label: 'Toggle' },
						],
					},
				],
				callback: async (event, context) => {
					const dest = await context.parseVariablesInString(`${event.options.destination}`)
					let value = parseInt(event.options.mode)
					if (value === 2) {
						value = this.destination_locked[dest] ? 0 : 1
					}
					await this.actionCall(`eParamID_XPT_Destination${dest}_Locked`, value)
					this.checkFeedbacks('destination_locked')
				},
			},
		}

		this.setActionDefinitions(actions)
	}

	async actionCall(id, val, action = 'set') {
		const url = `http://${this.config.ip}/config?action=${action}&configid=0&paramid=${id}&value=${val}`

		try {
			const response = await got(url, { cookieJar: this.cookieJar })
			if (this.connectionId === null) return
		} catch (e) {
			if (e.response?.statusCode === 403 && id.includes('_Status')) {
				this.log('warn', `Device rejected command: ${id}=${val} (Destination locked?)`)
			} else if (e.code === 'ERR_NON_2XX_3XX_RESPONSE') {
				this.log('warn', `Device rejected command (${e.response?.statusCode}): ${id}=${val}`)
			} else {
				this.log('error', `Failed to send command to device: ${e}`)
			}
		}
	}

	initVariables() {
		let v = {}
		let initialVars = {}
		CHOICES.singleParameters.forEach((x) => {
			v = this.createVariable(x.id, x.name)
			initialVars[v.variableId] = ''
		})
		v = this.createVariable('KumoProductName', '')
		initialVars[v.variableId] = ''
		this.destSrc.forEach((x) => {
			let title = x === 'dest' ? 'Destination' : 'Source'

			for (let i = 1; i <= this.config[`${x}_count`]; i++) {
				if (x === 'dest') {
					v = this.createVariable(`dest_${i}`, `Destination ${i} source`)
					initialVars[v.variableId] = 0
					v = this.createVariable(`dest_${i}_locked`, `Destination ${i} is locked`)
					initialVars[v.variableId] = false
				}

				for (let l = 1; l <= 2; l++) {
					v = this.createVariable(`${x}_name_${i}_line${l}`, `${title} ${i} name, line ${l}`)
					initialVars[v.variableId] = ''
				}
				v = this.createVariable(`${x}_${i}_label_combo`, `${title} ${i} full label`)
				initialVars[v.variableId] = '\n'
			}
		})
		for (let i = 1; i <= this.SALVO_COUNT; i++) {
			v = this.createVariable(`salvo_name_${i}`, `Salvo ${i} name`)
			initialVars[v.variableId] = `Salvo ${i}`
		}

		this.setVariableDefinitions(this.variables)
		this.setVariableValues(initialVars)
		this.setVariableValues({
			destination: 'Not yet selected',
			source: 'Not yet selected',
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
					bgcolor: combineRgb(255, 0, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'destination',
						default: 1,
						choices: this.getNameList('dest'),
					},
				],
				callback: async (feedback, context) => {
					return this.selectedDestination == feedback.options.destination
				},
			},
			active_source: {
				type: 'boolean',
				name: 'Selection of a source button',
				description: 'When a source button is selected in Companion.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Source',
						id: 'source',
						default: 1,
						choices: this.getNameList('src'),
					},
				],
				callback: (feedback) => {
					return this.selectedSource == feedback.options.source
				},
			},
			source_match: {
				type: 'boolean',
				name: 'Source matches the pre-selected destination',
				description: 'When this source is routed to the pre-selected destination remembered by Companion.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(128, 128, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Source',
						id: 'source',
						default: 1,
						choices: this.getNameList('src'),
					},
				],
				callback: (feedback) => {
					return (
						this.selectedDestination in this.srcToDestMap &&
						feedback.options.source == this.srcToDestMap[this.selectedDestination]
					)
				},
			},
			destination_match: {
				type: 'boolean',
				name: 'Specific source is routed to a specific destination',
				description: 'When routing on this device changes to a specific source and destination.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 128, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'dest',
						default: 1,
						choices: this.getNameList('dest'),
					},
					{
						type: 'dropdown',
						label: 'Source',
						id: 'src',
						default: 1,
						choices: this.getNameList('src'),
					},
				],
				callback: (feedback) => {
					return (
						feedback.options.dest in this.srcToDestMap &&
						this.srcToDestMap[feedback.options.dest] == feedback.options.src
					)
				},
			},
			destination_locked: {
				type: 'boolean',
				name: 'Specific destination is locked',
				description: 'When destination is locked to prevent changing.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(128, 0, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Destination',
						id: 'dest',
						default: 1,
						choices: this.getNameList('dest'),
					},
				],
				callback: (feedback) => {
					return this.destination_locked[feedback.options.dest]
				},
			},
		}

		this.setFeedbackDefinitions(feedbacks)
	}

	initPresets() {
		const presets = []

		// Preset for 'Source buttons' and 'Destination buttons'
		function make_src_dest_button_preset(type, n) {
			let type_name
			let actions = []
			let feedbacks = []
			if (type == 'dest') {
				type_name = 'Destination'
				actions = [{ actionId: 'destination', options: { destination: n } }]
				feedbacks = [
					{
						feedbackId: 'active_destination',
						options: {
							destination: n,
						},
						style: {
							color: combineRgb(255, 255, 255),
							bgcolor: combineRgb(255, 0, 0),
						},
					},
				]
			} else {
				type_name = 'Source'
				actions = [{ actionId: 'source', options: { source: n } }]
				feedbacks = [
					{
						feedbackId: 'source_match',
						options: {
							source: n,
						},
						style: {
							color: combineRgb(255, 255, 255),
							bgcolor: combineRgb(255, 0, 0),
						},
					},
				]
			}
			return {
				category: `${type_name} buttons`,
				name: `${type_name} ${n}`,
				type: 'button',
				style: {
					text: `$(kumo:${type}_${n}_label_combo)`,
					size: '18',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
					show_topbar: false,
				},
				steps: [
					{
						down: actions,
						up: [],
					},
				],
				feedbacks: feedbacks,
			}
		}
		// Create for each src & dest in the matrix

		this.destSrc.forEach((type) => {
			for (let i = 1; i <= this.config[`${type}_count`]; i++) {
				presets.push(make_src_dest_button_preset(type, i))
			}
		})

		// Apply presets
		this.setPresetDefinitions(presets)
	}
}

runEntrypoint(AjaKumoInstance, UpgradeScripts)
