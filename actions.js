exports.getActions = function () {
	let actions = {}

	actions['route'] = {
		label: 'Route input to output',
		options: [
			{
				type: 'dropdown',
				label: 'output',
				id: 'destination',
				default: '1',
				choices: this.getNameList()
			},
			{
				type: 'dropdown',
				label: 'source',
				id: 'source',
				default: '1',
				choices: this.getNameList('src')
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
	actions['source'] = {
		label: 'Send source to previous selected destination',
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
				type: 'dropdown',
				label: 'salvo',
				id: 'salvo',
				default: '1',
				choices: this.getSalvoList()
			},
		],
	}

	return actions
}
