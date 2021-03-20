const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const cast = require('../../util/cast');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');
const MbitLinkWebSocket = require('../../util/mbitlink-websocket');

/// rename: MicroBit -> MBitLink
/// chage UUID
/// add Tuch logo
/// add Maqueen Patrol

/**
 * Icon png to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAANSSURBVFhHzZbfS1NRHMB99kX/AJ998clH33rPFwnxR4IlJQoRJNlcpagwl2hGwVZQD2auHILC3CIJNtpCkrvptNTczB81m5lYW9vE3Pbt3LO74673O92M1jnwQb+fe875fj33HM/Nyxva4htU8gQqeQKVPIFKnkAlT6CSJ1DJE6jkCVTyBCpzyIZRD5hnoDJHxA/2wX2rHjy6jvRFojKHRCO/wKWqAf/LF3iRqPzHhDc8EFhysoJ+zNjB2VoNsXBQWaRCpBCPx8FsNsPExAT9iSE+M5lM4HA4jt9LKWxbx0BoOQd7/g02ZuneDVgbHsisQI/HA/n5+UCeZk1FRUVGha4Z7oP7dj3rG1gQwEVWMbUP5aiw2Wxo4qw5Mq/I9huzzM+QA7JlHWfOdbMOdt69lo9NDUKhkCyJxWKBbFpzczMbW1xcrCjSra4Dj/7wxH59NQLvNWSMFH962gfrzx+kL7C6miyxlOC0bWCA7CNpjpWVFVmyg8AOOFW1EF5dpD68/hEE8loh+pvGWzYTLPZdS19gcuLu7m4pHUBTUxMYDAYpUrZgMAjl5eUgCIJkgBWoVqvlyQiLfS3wdXKEeogdkIJrIPLZS+OdqUlwd1w8uUCj0UgTjY6OsmTpWmNjo6JPaWkpjcU/TjY/wfuwE3ymwUSB5B81LfBLYqV3Zxzgbr9wcoG9vb1SKoCSkhKorKyUImXzer1QVFQEVqtVMocrqFKpFAXOkpP7nayU+Hs09JO+8v1vPhqLfr7rcvoCxVeVnPy0TTxYyTmmp6dlyTbNQ+BqO8/c7uxbcF6vYrG4st5HXekL9Pv9bPKCggK6ybNpOp2OjS8sLJQnIjivnIXg8izzy+QOXn12l8XiAUnuT4YsIOj15OtCSvI3iLfQ0blTiZDrTmitgogvsf/ikRAIbTXkhC8cX6CI3W5Hk2ZCWVnZsYWJxPZC5LQ2gHibJN2mZRjmOy8pxypECnNzc9Df3w8ajQa0Wi1KT08PfT44mDiZmeAbewwftFdZf4jFyBdNLewK5BZL6UdRiP/Asq4dFu4cFiwDlTnEN/6Erl40hHxqiaAyR8TCAZhqOAPhtaX02wOVPIFKnkAlT6CSJ1DJE6jkCVTyBCp5ApU8gUpu2Mr7AzqIGagjqYZ9AAAAAElFTkSuQmCC';


/**
 * A time interval to wait (in milliseconds) before reporting to the BLE socket
 * that data has stopped coming from the peripheral.
 */
const BLETimeout = -1; //4500;

/**
 * A time interval to wait (in milliseconds) while a block that sends a BLE message is running.
 * @type {number}
 */
const BLESendInterval = 100;

/**
 * A string to report to the BLE socket when the micro:bit has stopped receiving data.
 * @type {string}
 */
const BLEDataStoppedError = 'micro:bit uart extension stopped receiving data';

/**
 * Enum for micro:bit protocol.
 * https://github.com/LLK/scratch-microbit-firmware/blob/master/protocol.md
 * @readonly
 * @enum {string}
 */
const BLEUUID = {
	service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // UART_SERVICE
	rxChar:  '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // TX_Characteristic
	txChar:  '6e400003-b5a3-f393-e0a9-e50e24dcca9e'  // RX_Characteristic
};
const BLENAMEPREFIX = "BBC micro:bit";

/**
 * Manage communication with a MBitLink peripheral over a Scrath Link client socket.
 */
class MBitLink {

	/**
	* Construct a MicroBit communication object.
	* @param {Runtime} runtime - the Scratch 3.0 runtime
	* @param {string} extensionId - the id of the extension
	*/
	constructor (runtime, extensionId) {

		/**
		* The Scratch 3.0 runtime used to trigger the green flag button.
		* @type {Runtime}
		* @private
		*/
		this._runtime = runtime;

		/**
		* The BluetoothLowEnergy connection socket for reading/writing peripheral data.
		* @type {BLE}
		* @private
		*/
		this._ble = null;
		this._runtime.registerPeripheralExtension(extensionId, this);

		/**
		* The id of the extension this peripheral belongs to.
		*/
		this._extensionId = extensionId;

		if( this._runtime._mbitlink == undefined)
			this._runtime._mbitlink = { instance: null, extensions: [] };
		this._runtime._mbitlink.instance = this;

		/**
		* Interval ID for data reading timeout.
		* @type {number}
		* @private
		*/
		this._timeoutID = null;

		/**
		* A flag that is true while we are busy sending data to the BLE socket.
		* @type {boolean}
		* @private
		*/
		this._busy = false;

		/**
		* ID for a timeout which is used to clear the busy flag if it has been
		* true for a long time.
		*/
		this._busyTimeoutID = null;

		this._encoder = new TextEncoder('utf-8');
		this._decoder = new TextDecoder('utf-8');

		this._onReset = this._onReset.bind(this);
		this._onConnect = this._onConnect.bind(this);
		this._onMessage = this._onMessage.bind(this);
		this._linkSocketFactory = this._linkSocketFactory.bind(this);
	}

	_linkSocketFactory(type) {
		return new MbitLinkWebSocket(type);
	}

	/**
	* Called by the runtime when user wants to scan for a peripheral.
	*/
	scan () {
		if (this._ble) {
			this._ble.disconnect();
		}

		let bak = this._runtime._linkSocketFactory;
		this._runtime._linkSocketFactory = this._linkSocketFactory;

		this._ble = new BLE(this._runtime, this._extensionId, {
			acceptAllDevices: false,
			filters: [
				{services: [BLEUUID.service]},
				{namePrefix: BLENAMEPREFIX}
			]
		}, this._onConnect, this._onReset);

		this._runtime._linkSocketFactory = bak;
	}

	/**
	* Called by the runtime when user wants to connect to a certain peripheral.
	* @param {number} id - the id of the peripheral to connect to.
	*/
	connect (id) {
		if (this._ble) {
			this._ble.connectPeripheral(id);
		}
	}

	/**
	* Disconnect from the micro:bit.
	*/
	disconnect () {
		if (this._ble) {
			this._ble.disconnect();
		}
		this._onReset();
	}

	/**
	* Reset all the state and timeout/interval ids.
	*/
	_onReset () {
		console.info('[link]', 'onReset');
		if (this._timeoutID) {
			window.clearTimeout(this._timeoutID);
			this._timeoutID = null;
		}
	}

	/**
	* Return true if connected to the micro:bit.
	* @return {boolean} - whether the micro:bit is connected.
	*/
	isConnected () {
		let connected = false;
		if (this._ble) {
			connected = this._ble.isConnected();
		}
		return connected;
	}

	/**
	* Send a message to the peripheral BLE socket.
	* @param {string} message - the message to write
	*/
	send (message) {
		if (!this.isConnected()) {
			console.info('[link.send][error]', "not connect");
			return;
		}
		if (this._busy) {
			console.info('[link.send][error]', "busy");
			return;
		}

		// Set a busy flag so that while we are sending a message and waiting for
		// the response, additional messages are ignored.
		this._busy = true;

		// Set a timeout after which to reset the busy flag. This is used in case
		// a BLE message was sent for which we never received a response, because
		// e.g. the peripheral was turned off after the message was sent. We reset
		// the busy flag after a while so that it is possible to try again later.
		this._busyTimeoutID = window.setTimeout(() => {
			this._busy = false;
		}, 5000);

		//console.info('[link-send]', message);
		const output = this._encoder.encode(message + "\n");
		const data = Base64Util.uint8ArrayToBase64(output);

		this._ble.write(BLEUUID.service, BLEUUID.txChar, data, "base64", true).then(
			() => {
				this._busy = false;
				window.clearTimeout(this._busyTimeoutID);
			}
		);
	}

	/**
	* Starts reading data from peripheral after BLE has connected to it.
	* @private
	*/
	_onConnect () {
		//console.info('[link]', 'onConnect');
		//this._ble.startNotifications(BLEUUID.service, BLEUUID.rxChar, this._onMessage);
        this._ble.read(BLEUUID.service, BLEUUID.rxChar, true, this._onMessage);
		if(BLETimeout > 100) {
			this._timeoutID = window.setTimeout(
				() => this._ble.handleDisconnectError(BLEDataStoppedError),
				BLETimeout
			);
		}
	}

	/**
	* Process the sensor data from the incoming BLE characteristic.
	* @param {object} input - the incoming BLE data.
	* @private
	*/
	_onMessage (base64) {
		const input = Base64Util.base64ToUint8Array(base64);
		const data = this._decoder.decode(input);
		//console.info('[link:mess]', data);
		
		for(let i=0; i<this._runtime._mbitlink.extensions.length; i++) {
			if(this._runtime._mbitlink.extensions[i].onMessage(data)) break;
		}

		if(BLETimeout > 100) {
			// cancel disconnect timeout and start a new one
			window.clearTimeout(this._timeoutID);
			this._timeoutID = window.setTimeout(
				() => this._ble.handleDisconnectError(BLEDataStoppedError),
				BLETimeout
			);
		}
	}
}

/**
 * Scratch 3.0 blocks to interact with a MBitLink peripheral.
 */
class Scratch3_MBitLink_Blocks {

	/**
	* @return {string} - the name of this extension.
	*/
	static get EXTENSION_NAME () {
		return 'micro:bit link';
	}

	/**
	* @return {string} - the ID of this extension.
	*/
	static get EXTENSION_ID () {
		return 'mbitlink';
	}

	/**
	* Construct a set of MBitLink blocks.
	* @param {Runtime} runtime - the Scratch 3.0 runtime.
	*/
	constructor (runtime) {
		/**
		* The Scratch 3.0 runtime.
		* @type {Runtime}
		*/
		this.runtime = runtime;

		// Create a new MBitLink peripheral instance
		this.instance = new MBitLink(this.runtime, Scratch3_MBitLink_Blocks.EXTENSION_ID);
	}

	/**
	* @returns {object} metadata for this extension and its blocks.
	*/
	getInfo () {
		return {
			id: Scratch3_MBitLink_Blocks.EXTENSION_ID,
			name: Scratch3_MBitLink_Blocks.EXTENSION_NAME,
			blockIconURI: blockIconURI,
			showStatusButton: true,
			blocks: [ ],
		};
	}
}

module.exports = Scratch3_MBitLink_Blocks;
