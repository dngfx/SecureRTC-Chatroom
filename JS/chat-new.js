/* eslint-disable no-undef */
const chatRoom = {
	roomId:       null,
	userName:     null,
	displayName:  null,
	videoPlugin:  null,
	textPlugin:   null,
	apiSecret:    null,
	janus:        null,
	transactions: {},
	participants: {},
	init:         function( roomid, username, displayname, apisecret ) {
		cr.roomId      = roomid;
		cr.userName    = username;
		cr.displayName = displayname;
		cr.apiSecret   = apisecret;

		cr.initJanus();
	},
	initJanus: () => {
		Janus.init({
			debug:        false,
			dependencies: Janus.useDefaultDependencies(),
			callback:     () => {
				cr.connectChat();
			},
		});
	},
	connectChat: function() {
		cr.janus = new Janus({
			server:     server,
			iceServers: rtcIceServers,
			apisecret:  apiSecret,
			keepalive:  true,
			success:    () => {
				cr.janus.attach({
					plugin:   "janus.plugin.textroom",
					opaqueId: uniqueId,
					success:  ( plugin ) => {
						cr.textPlugin = plugin;
						Janus.log( "Plugin attached! (" + cr.textPlugin.getPlugin() + ", id=" + cr.textPlugin.getId() + ")" );
						const body = {
							request: "setup",
						};

						Janus.debug( "Sending message:", body );
						cr.textPlugin.send({
							message: body,
						});
					},
					error: ( error ) => {
						Janus.log( "-- Error attaching textroom plugin", error );
					},
					iceState: ( state ) => {
						Janus.log( "ICE state changed to " + state );
					},
					mediaState: ( medium, on ) => {
						Janus.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
					},
					webrtcState: ( on ) => {
						Janus.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
					},
					onmessage: ( message, jsep ) => {
						Janus.log( " :: Got a message :::", message );

						if( message[ "error" ] ) {
							console.error( message[ "error" ] );

							return;
						}

						if( jsep ) {
							Janus.log( "Handling JSEP", jsep );

							cr.textPlugin.createAnswer({
								jsep:  jsep,
								media: {
									audio: false,
									video: false,
									data:  true,
								},
								success: ( jsep ) => {
									Janus.log( "Got SDP For TextRoom:", jsep );
									const body = {
										request: "ack",
									};

									cr.textPlugin.send({
										message: body,
										jsep:    jsep,
									});
								},
								error: ( error ) => {
									Janus.error( "WebRTC Error:", error );
								},
							});
						}
					},
					ondataopen: ( data ) => {
						Janus.log( "The dataChannel is available" );
						const transaction = randomString( 12 );
						const register    = {
							textroom:    "join",
							transaction: transaction,
							room:        cr.roomId,
							username:    cr.userName,
							display:     cr.displayName,
							apisecret:   cr.apiSecret,
						};

						cr.transactions[ transaction ] = ( response ) => {
							if( response[ "textroom" ] === "error" ) {
								if( response[ "error_code" ] === 417 ) {
									console.error( "There is no such room" );
								}
							}

							let i, info;

							console.log( "Response Participants:", response[ "participants" ] );

							if( response.participants && response.participants.length > 0 ) {
								for( i in response.participants ) {
									const p = response.participants[ i ];
									console.log( `Participant ${i}`, p );

									cr.participants[ p.username ] = p.display;
									if(
										p.username !== cr.userName &&
										document.getElementById( "user-" + p.username ) === null
									) {
										info = {
											username: p.username,
											display:  p.display,
											date:     getDateString(),
										};

										if( !tr.textUsers[ info[ "username" ] ] ) {
											tr.textUsers[ info[ "username" ] ] = info[ "display" ];
										}

										tr.addToUserList( info );
									}
								}
							}
						};

						cr.textPlugin.data({
							text:  JSON.stringify( register ),
							error: ( reason ) => {
								console.error( reason );
							},
						});
					},
					ondata: ( data ) => {
						const json        = JSON.parse( data );
						const transaction = json[ "transaction" ];

						if( cr.transactions[ transaction ] ) {
							Janus.log( "Pushing transaction ", transaction );
							cr.transactions[ transaction ]( json );
							delete cr.transactions[ transaction ];

							return;
						}

						const action = json[ "textroom" ];
						console.log( "Action: ", action );

						tr.handleData( action, json );
					},
				});
			},
		});
	},
};

const textRoom = {
	textUsers:  {},
	handleData: ( action, data ) => {
		switch ( action ) {
			case "message":
				tr.handleMessage( data );
				break;

			case "join":
				tr.handleJoin( data );
				break;

			case "success":
				tr.handleSuccess( data );
				break;

			case "leave":
				console.log( data );
				tr.handleLeave( data );
				break;

			default:
				console.log( action );
				break;
		}
	},
	handleMessage: ( data ) => {
		console.log( data );
		const info = {
			from:    data[ "from" ],
			text:    cleanMessage( data[ "text" ] ),
			date:    getDateString( data[ "date" ] ),
			private: data[ "whisper" ] === true,
		};

		tr.addMessage( info );
	},

	handleJoin: ( data ) => {
		const info = {
			username: data[ "username" ],
			display:  data[ "display" ],
			date:     getDateString(),
		};

		console.log( "Calling remove attribute" );
		document.getElementById( "chat-text-input" ).removeAttribute( "disabled" );

		if( !tr.textUsers.hasOwnProperty( data[ "username" ] ) ) {
			tr.textUsers[ data[ "username" ] ] = data[ "display" ];
		}

		console.log( "Join JSON", data );
		tr.textUsers[ data[ "username" ] ] = data[ "display" ];
		const userItem                     = document.getElementById( "user-" + info[ "username" ] );

		// If user is not in the list
		if( userItem === null ) {
			// Add them
			tr.addToUserList( info );
		}

		console.log( "Enabling user textbox" );
		document.getElementById( "chat-text-input" ).removeAttribute( "disabled" );
	},
	handleSuccess: ( data ) => {
		const i = 0;

		if( data[ "participants" ] && data[ "participants" ].length > 0 ) {
			const p = data[ "participants" ];
			console.log( "Success!", data );
			const len = p.length;
			let i     = 0;

			for( i = 0; i < len; i++ ) {
				const user = p[ i ];
				console.log( "USer;", user );
			}
		}
	},
	handleLeave: ( data ) => {
		const info = {
			username: data[ "username" ],
			display:  tr.textUsers[ data[ "username" ] ],
			date:     getDateString(),
		};

		info[ "message" ] = `<b>${tr.textUsers[ info[ "username" ] ]}</b> has left the room`;

		tr.removeFromUserList( info );
	},

	sendMessage: ( message ) => {
		if( message === "" ) {
			return;
		}

		const data = {
			textroom:    "message",
			transaction: randomString( 12 ),
			room:        cr.roomId,
			text:        message,
		};

		cr.textPlugin.data({
			text:  JSON.stringify( data ),
			error: ( reason ) => {
				console.error( reason );
			},
			success: () => {
				resetChatBox();
			},
		});
	},

	addMessage: ( info ) => {
		const classname   = info[ "private" ] ? " privmsg" : "";
		const message     = buildChatMessage( info[ "date" ], `<b class="username">${tr.textUsers[ info[ "from" ] ]}</b> ${info.text}` );
		message.className = message.class + classname;
		tr.showMessage( message );
	},

	addStatusMessage: ( info ) => {
		const message     = buildChatMessage( info[ "date" ], info[ "message" ] );
		message.className = message.class + " status";
		tr.showMessage( message );
	},

	showMessage: ( message ) => {
		const msgbox = document.getElementById( "chat-box-text" );
		msgbox.appendChild( message );
		msgbox.scrollTop = msgbox.scrollHeight;
	},

	addToUserList: ( info ) => {
		console.log( "Add to user list: ", info );
		const userlist = document.getElementById( "user-list" );

		const newlist     = document.createElement( "div" );
		newlist.id        = "user-" + info[ "username" ];
		newlist.innerText = tr.textUsers[ info[ "username" ] ];
		userlist.appendChild( newlist );

		info[ "message" ] = `<b>${tr.textUsers[ info[ "username" ] ]}</b> has joined the room`;
		console.log( info );
		tr.addStatusMessage( info );
	},

	removeFromUserList: ( info ) => {
		delete tr.textUsers[ info[ "username" ] ];

		console.log( tr.participants );

		if( tr.participants && tr.participants.length > 0 ) {
			const p = tr.participants;
			console.log( "Success!", data );
			const len = p.length;
			let i     = 0;

			for( i = 0; i < len; i++ ) {
				const user = p[ i ];
				console.log( user );
			}
		}

		const elem = document.getElementById( "user-" + info[ "username" ] );
		elem.parentNode.removeChild( elem );

		tr.addStatusMessage( info );
	},
};

const videoRoom = {
	users: {},
	init:  () => {
		console.log( "hello" );
	},
};

const cr = chatRoom;
const tr = textRoom;
const vr = videoRoom;
function randomString( len, charSet ) {
	charSet          = charSet || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let randomString = "";
	for( let i = 0; i < len; i++ ) {
		const randomPoz = Math.floor( Math.random() * charSet.length );
		randomString   += charSet.substring( randomPoz, randomPoz + 1 );
	}

	return randomString;
}

function getDateString( jsonDate ) {
	let when = new Date();
	if( jsonDate ) {
		when = new Date( Date.parse( jsonDate ) );
	}
	const dateString =
		( "0" + when.getUTCHours() ).slice( -2 ) +
		":" +
		( "0" + when.getUTCMinutes() ).slice( -2 ) +
		":" +
		( "0" + when.getUTCSeconds() ).slice( -2 );

	return dateString;
}

function buildChatMessage( date, text ) {
	const message     = document.createElement( "div" );
	message.class     = "chat-message";
	message.innerHTML = `[${date}] ${text}`;

	return message;
}

function checkEnter( field, event ) {
	const theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if( theCode === 13 ) {
		if( field.id === "chat-text-input" ) {
			tr.sendMessage( field.value );
		}

		return false;
	} else {
		return true;
	}
}

function resetChatBox() {
	document.getElementById( "chat-text-input" ).value = "";
}

function cleanMessage( msg ) {
	console.log( "Cleaning message", msg );
	msg = msg.replace( new RegExp( "<", "g" ), "&lt" );
	msg = msg.replace( new RegExp( ">", "g" ), "&gt" );

	return msg;
}
