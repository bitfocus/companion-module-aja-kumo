exports.getActions = function () {
	let actions = {}

	actions['route'] = {
		label: 'Route input to output',
		options: [
			{
				type: 'textinput',
				label: 'output',
				id: 'destination',
				default: '1',
				regex: this.REGEX_NUMBER,
			},
			{
				type: 'textinput',
				label: 'source',
				id: 'source',
				default: '1',
				regex: this.REGEX_NUMBER,
			},
		],
	}
	actions['destination'] = {
		label: 'Select destination',
		options: [
			{
				type: 'number',
				label: 'destination number',
				id: 'destination',
				min: 1,
				max: 64,
				default: 1
			}
		]
	}
	actions['sourceToDestination'] = {
		label: 'Select source to active destination',
		options: [
			{
				type: 'number',
				label: 'source number',
				id: 'source',
				min: 1,
				max: 64,
				default: 1
			}
		]
	}
	actions['salvo'] = {
		label: 'Send salvo command',
		options: [
			{
				type: 'textinput',
				label: 'salvo',
				id: 'salvo',
				default: '1',
				regex: this.REGEX_NUMBER,
			},
		],
	}

	return actions
}
