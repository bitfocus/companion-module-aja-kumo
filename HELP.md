## AJA Kumo Router control
This module sends HTTP requests to the router for control. On connection, we get the current router status and watch for changes for feedbacks and variables.

### Actions

- Route a source (input) to a destination (output)
- Select a destination in Companion
- Send source to previously selected destination
- Take (apply) a salvo
- Swap source between two given destinations

### Variables
- Salvo names
	- `$(kumo:salvo_name_n)`
- Currently routed source per destination:
    - `$(kumo:dest_n)`
- Source and destination names: 
    - `$(kumo:src_name_n_line1)`
    - `$(kumo:src_name_n_line2)`
    - `$(kumo:dest_name_n_line1)`
    - `$(kumo:dest_name_n_line2)`
- Currently selected source button internally
    - `$(kumo:source)`
- Currently selected destination button internally
    - `$(kumo:destination)`

### Feedbacks
All feedbacks are booleans, which allows them to be used in triggers.

- Destination change
	- When a different destination button is selected in Companion
- Source change
	- When a different source button is selected in Companion
- Source matches the destination
	- When this source (specified) is routed to the destination selected in Companion
- Source routes to destination
	- When a specific source routes to a specific destination

### Usage


#### Behaviour similar to KUMO

To create a complete 'matrix' of source and destination buttons similar to the KUMO CP and KUMO Web Browser User Interface, follow the below steps.

For source buttons:
- Create a button with Button text: `1\n$(kumo:src_name_1_line1)\n$(kumo:src_name_1_line2)`
- Add a Press action for **Send source to previously selected destination** with `Source number`: 1
- Add a Feedback for **Source matches the destination** with `Source number`: 1

For destination buttons:
- Create a button with Button text: `1\n$(kumo:dest_name_1_line1)\n$(kumo:dest_name_1_line2)`
- Add a Press action for **Select destination** with `Destination number`: 1
- Add a Feedback for **Destination change** with `Destination number`: 1

Repeat for each number of source and destinations, incrementing `1` for each new button.