exports.initFeedbacks = function() {
	const feedbacks = {};

	feedbacks.active_destination = {
		type: 'boolean',
		label: 'Destination change',
		description: 'When a different destination button is selected in Companion',
		style: {
			color: this.rgb(255, 255, 255),
			bgcolor: this.rgb(255, 0, 0)
		},
		options: [{
			type: 'number',
			label: 'Destination number',
			id: 'destination',
			default: 1
		}],
		callback: (feedback) => {
			return this.selectedDestination == feedback.options.destination
		}
	}
	
	feedbacks.active_source = {
		type: 'boolean',
		label: 'Source change',
		description: 'When a different source button is selected in Companion',
		style: {
			color: this.rgb(255, 255, 255),
			bgcolor: this.rgb(255, 0, 0)
		},
		options: [{
			type: 'number',
			label: 'Source number',
			id: 'source',
			default: 1
		}],
		callback: (feedback) => {
			return this.selectedSource == feedback.options.source
		}
	}

	feedbacks.destination_match = {
		type: 'boolean',
		label: 'Source routes to destination',
		description: 'When the source routes to the destination',
		style: {
			color: this.rgb(255, 255, 255),
			bgcolor: this.rgb(255, 0, 0)
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
	}

	this.setFeedbackDefinitions(feedbacks)
}
