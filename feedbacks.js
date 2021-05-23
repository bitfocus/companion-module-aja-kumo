exports.initFeedbacks = function() {
	const feedbacks = {};

	const foregroundColor = {
		type: 'colorpicker',
		label: 'Foreground color',
		id: 'fg',
		default: this.rgb(255, 255, 255)
	};

	const backgroundColorProgram = {
		type: 'colorpicker',
		label: 'Background color',
		id: 'bg',
		default: this.rgb(255, 0, 0)
	};

	feedbacks.active_destination = {
		label: 'Change color for active destination',
		description: 'When user select a different destination, background color will change',
		options: [
			foregroundColor,
			backgroundColorProgram,
			{
				type: 'number',
				label: 'Destination number',
				id: 'destination',
				default: 1
			}
		]
	};
	
	feedbacks.active_source = {
		label: 'Change color for active source',
		description: 'When user select a different source, background color will change',
		options: [
			foregroundColor,
			backgroundColorProgram,
			{
				type: 'number',
				label: 'Source number',
				id: 'source',
				default: 1
			}
		]
	};

	return feedbacks;

}

exports.executeFeedback = function (feedback, bank) {
	if(feedback.type === 'active_destination') {
		if(this.selectedDestination == feedback.options.destination) {
			return {
				color: feedback.options.fg,
				bgcolor: feedback.options.bg
			};
		}
	}
	
	if(feedback.type === 'active_source') {
		if(this.selectedSource == feedback.options.source) {
			return {
				color: feedback.options.fg,
				bgcolor: feedback.options.bg
			};
		}
	}
};