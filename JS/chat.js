const chatRoom = {
	server:       null,
	apiSecret:    null,
	janus:        null,
	roomId:       null,
	userName:     null,
	displayName:  null,
	uniqueId:     null,
	randomId:     null,
	textRoom:     null,
	videoRoom:    null,
	chatRoom:     null,
	debug:        "all",
	transactions: {},
	init:         ( server, room, user, display, uid, rid, apisecret ) => {
		cr.server      = server;
		cr.roomId      = room;
		cr.userName    = user;
		cr.displayName = display;
		cr.uniqueId    = uid;
		cr.randomId    = rid;
		cr.apiSecret   = apisecret;

		cr.initJanus();
	},
	initJanus: () => {
		Janus.init({
			debug:        cr.debug,
			dependencies: Janus.useDefaultDependencies(),
			callback:     () => {
				cr.connectChat();
			},
		});
	},
	connectChat: () => {
		cr.janus = new Janus({
			debug:      cr.debug,
			server:     cr.server,
			apisecret:  cr.apiSecret,
			iceServers: cr.iceServers,
			success:    () => {
				cr.janus.attach({
					plugin:   "janus.plugin.textroom",
					opaqueId: cr.uniqueId,
					success:  ( plugin ) => {
						cr.chatRoom = plugin;
						console.log( cr.chatRoom );
						const register = {
							request: "join",
							room:    cr.roomId,
							ptype:   "publisher",
							display: cr.displayName,
						};

						cr.chatRoom.send({
							message: register,
						});
					},
					error: ( error ) => {
						Janus.error( "  -- Error attaching plugin...", error );
					},
					iceState: ( state ) => {
						Janus.log( "ICE state changed to " + state );
					},
					mediaState: ( medium, on ) => {
						Janus.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
					},
					webrtcState: ( on ) => {
						Janus.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
						if( !on ) {
							return;
						}
					},
					onmessage: ( message, jsep ) => {
						console.log( " :: Got a message :::", message );

						if( message[ "error" ] ) {
							console.error( message[ "error" ] );

							return;
						}

						if( jsep ) {
							console.log( "Handling JSEP", jsep );

							cr.textPlugin.createAnswer({
								jsep:  jsep,
								media: {
									audio: false,
									video: false,
									data:  true,
								},
								success: ( jsep ) => {
									console.log( "Got SDP For TextRoom:", jsep );
									const body = {
										request: "ack",
									};

									cr.textPlugin.send({
										message:   body,
										apisecret: cr.apiSecret,
										jsep:      jsep,
									});
								},
								error: ( error ) => {
									Janus.error( "WebRTC Error:", error );
								},
							});
						}
					},
					ondataopen: ( data ) => {
						console.log( "The DataChannel is now available!" );
						const transaction = utils.randomString( 12 );

						const register = {
							textroom:    "join",
							transaction: transaction,
							room:        cr.roomId,
							username:    cr.userName,
							display:     cr.displayName,
							apisecret:   cr.apiSecret,
						};

						cr.transactions[ transaction ] = ( response ) => {
							if( response[ "textroom" ] === "error" ) {
								switch ( response[ "error_code" ] ) {
									case 417:
										console.error( "There is no such room" );
										break;

									default:
										console.error( "Unknown error", response[ "error" ] );
										break;
								}
							}

							let i, info, nonExists;

							const rp = response.participants;
							if( rp && rp.length > 0 ) {
								for( i in rp ) {
									const p = rp[ i ];
									console.log( `Participant ${i}`, p );

									notExists = document.getElementById( "user-" + p.username ) === null;

									cr.participants[ p.username ] = p.display;
									if( p.username !== cr.userName && notExists ) {
										info = {
											username:  p.username,
											display:   p.display,
											date:      utils.getDateString(),
											apisecret: cr.apiSecret,
										};

										if( !tr.textUsers[ info[ "username" ] ] ) {
											tr.textUsers[ info[ "username" ] ] = info[ "display" ];
										}

										console.log( "Trying to add to user list", info );

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
							console.log( "Pushing transaction ", transaction );
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
};

const videoRoom = {
	videoFeeds:      {},
	videoConnection: null,
	init:            ( id, server ) => {},
	joinRoom:        () => {},
};

const textRoom = {
	textUsers:      {},
	textConnection: null,
	textSession:    null,
	textPlugin:     null,
	init:           ( id, server ) => {
		tr.textConnection = Janus.init({
			debug:        cr.debug,
			dependencies: Janus.useDefaultDependencies(),
			callback:     () => {
				tr.connectTextRoom();
			},
		});
	},
	connectTextRoom: () => {
		tr.textConnection.attach({
			plugin:   "janus.plugin.textroom",
			opaqueId: cr.uniqueId,
			success:  ( plugin ) => {
				cr.textPlugin = plugin;

				console.log( "Plugin attached! (" + cr.textPlugin.getPlugin() + ", id=" + cr.textPlugin.getId() + ")" );
				const body = {
					request:   "setup",
					apisecret: cr.apiSecret,
				};

				console.log( "Sending message:", body );
				cr.textPlugin.send({
					message:   body,
					apisecret: cr.apiSecret,
				});
			},
			error: ( error ) => {
				console.log( "-- Error attaching textroom plugin", error );
			},
			iceState: ( state ) => {
				console.log( "ICE state changed to " + state );
			},
			mediaState: ( medium, on ) => {
				console.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
			},
			webrtcState: ( on ) => {
				console.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
			},
			onmessage: ( message, jsep ) => {
				console.log( ":: Got a textRoom Message :: ", message );

				if( message[ "error" ] ) {
					console.error( message[ "error" ] );

					return;
				}

				if( jsep ) {
					console.log( "Handling JSEP", jsep );

					cr.textPlugin.createAnswer({
						jsep:  jsep,
						media: {
							audio: false,
							video: false,
							data:  true,
						},
						success: ( jsep ) => {
							console.log( "Got SDP For TextRoom:", jsep );
							const body = {
								request: "ack",
							};

							cr.textPlugin.send({
								message:   body,
								apisecret: cr.apiSecret,
								jsep:      jsep,
							});
						},
						error: ( error ) => {
							Janus.error( "WebRTC Error:", error );
						},
					});
				}
			},
			ondataopen: ( data ) => {
				console.log( "The TextRoom DataChannel is available" );
				const transaction = utils.randomString( 12 );
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
						console.error( `Error code ${response[ "error_code" ]} ${response}` );

						return;
					}

					let i, info;

					if( response.participants && response.participants.length > 0 ) {
						for( i in response.participants ) {
							const p                       = response.participants[ i ];
							cr.participants[ p.username ] = p.display;
							if( p.username !== cr.userName && document.getElementById( "user-" + p.username ) === null ) {
								info = {
									username: p.username,
									display:  p.display,
									date:     utils.getDateString(),
								};

								if( !tr.textUsers[ info[ "username" ] ] ) {
									tr.textUsers[ info[ "username" ] ] = info[ "display" ];
								}

								tr.addToUserList( info );
							}
						}
					}
				};

				console.log( JSON.stringify( register ) );
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
					console.log( "Pushing transaction ", transaction );
					cr.transactions[ transaction ]( json );
					delete cr.transactions[ transaction ];

					return;
				}

				const action = json[ "textroom" ];
				console.log( "Action: ", action );

				console.log( "Handling data: ", action, json );
				tr.handleData( action, json );
			},
		});
	},
	addUsersToRoom: ( participants ) => {
		let i, info;

		for( i in participants ) {
			const p = participants[ i ];
			console.log( `Participant ${i}`, p );

			cr.participants[ p.username ] = p.display;

			if( p.username !== cr.userName && document.getElementById( "user-" + p.username ) === null ) {
				info = {
					username:  p.username,
					display:   p.display,
					date:      utils.getDateString(),
					apisecret: cr.apiSecret,
				};

				if( !tr.textUsers[ info[ "username" ] ] ) {
					tr.textUsers[ info[ "username" ] ] = info[ "display" ];
				}

				tr.addToUserList( info );
			}
		}
	},
	addToUserList: ( info ) => {
		console.log( info );
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
			console.log( "Success!", info );
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

	addStatusMessage: ( info ) => {
		const message     = utils.buildChatMessage( info[ "date" ], info[ "message" ] );
		message.className = message.class + " status";
		tr.showMessage( message );
	},

	showMessage: ( message ) => {
		const msgbox = document.getElementById( "chat-box-text" );
		msgbox.appendChild( message );
		msgbox.scrollTop = msgbox.scrollHeight;
	},
	handleMessage: ( data ) => {
		console.log( data );
		const info = {
			from:      data[ "from" ],
			text:      utils.cleanMessage( data[ "text" ] ),
			date:      utils.getDateString( data[ "date" ] ),
			private:   data[ "whisper" ] === true,
			apisecret: cr.apiSecret,
		};

		tr.addMessage( info );
	},
	addMessage: ( info ) => {
		const classname   = info[ "private" ] ? " privmsg" : "";
		const message     = utils.buildChatMessage( info[ "date" ], `<b class="username">${tr.textUsers[ info[ "from" ] ]}</b> ${info.text}` );
		message.className = message.class + classname;
		tr.showMessage( message );
	},
	handleJoin: ( data ) => {
		const info = {
			username:  data[ "username" ],
			display:   data[ "display" ],
			date:      utils.getDateString(),
			apisecret: cr.apiSecret,
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

		if( vr.init === false ) {
			//vr.connectVideo();
		}
	},
	handleData: ( action, data ) => {
		console.log( action, data );
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
				console.log( "OH NO", action );
				console.log( action );
				break;
		}
	},
};

const cr = chatRoom;
const vr = videoRoom;
const tr = textRoom;
