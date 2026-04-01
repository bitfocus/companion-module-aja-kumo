export const productIds = [
	{ 0: 'Unknown KUMO Product' },
	{ 1:  'KUMO 16x16 Matrix' },
	{ 2: 'KUMO 16x4 Matrix' },
	{ 3: 'KUMO 32x32 Matrix' },
	{ 4: 'KUMO 32x4 Matrix' },
	{ 5: 'KUMO 64x64 Matrix' },
	{ 6: 'KUMO Remote Control Panel (CP1)' },
	{ 7: 'KUMO Remote Control Panel (CP2)' },
	{ 8: 'KUMO Remote Control Panel (CP1 A)' },
	{ 9: 'KUMO Remote Control Panel (CP2 B)' },
	{ 10: 'KUMO 16x16 12G Matrix' },
	{ 11: 'KUMO 32x32 12G Matrix' },
	{ 12: 'KUMO 64x64 12G Matrix' },
]

export const singleParameters = [
	{ id: 'KumoProductID', name: 'Kumo Product ID', choices: productIds },
	{ id: 'NumberOfSources', name: 'Number of Sources', choices: null },
	{ id: 'NumberOfDestinations', name: 'Number of Destinations', choices: null },
]
