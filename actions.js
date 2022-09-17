exports.getActions = function () {
	let actions = {}

	actions['route'] = {
		label: 'Route input to output',
		options: [
			{
				type: 'dropdown',
				label: 'Destination',
				id: 'destination',
				default: '1',
				choices: this.getNameList()
			},
			{
				type: 'dropdown',
				label: 'Source',
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
				type: 'dropdown',
				label: 'Destination number',
				id: 'destination',
				default: 1,
				choices: this.getNameList()
			}
		]
	}
	actions['source'] = {
		label: 'Send source to previous selected destination',
		options: [
			{
				type: 'dropdown',
				label: 'Source number',
				id: 'source',
				default: 1,
				choices: this.getNameList('src')
			}
		]
	}
	actions['salvo'] = {
		label: 'Send salvo command',
		options: [
			{
				type: 'dropdown',
				label: 'Salvo',
				id: 'salvo',
				default: '1',
				choices: this.getSalvoList()
			},
		],
	}
	actions['swap_sources'] = {
		label: 'Swap the sources of two specified destinations',
		options: [
			{
				type: 'dropdown',
				label: 'Destination A',
				id: 'dest_A',
				default: '1',
				choices: this.getNameList(),
			},
			{
				type: 'dropdown',
				label: 'Destination B',
				id: 'dest_B',
				default: '2',
				choices: this.getNameList(),
			},
		],
	}

	return actions
}
