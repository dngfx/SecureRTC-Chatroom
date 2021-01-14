/* eslint-disable no-undef */
const chatRoom = {
	server:       null,
	apiSecret:    null,
	janus:        null,
	roomId:       null,
	userName:     null,
	displayName:  null,
	users:        {},
	plugin:       null,
	videoRoom:    null,
	chatRoom:     null,
	debug:        true,
	transactions: {},
	participants: {},
	iceServers:   null,
	init:         ( server, room, user, display, uid, rid, apisecret ) => {
		cr.server      = server;
		cr.roomId      = room;
		cr.userName    = user;
		cr.displayName = display;
		cr.uniqueId    = uid;
		cr.randomId    = rid;
		cr.apiSecret   = apisecret;
		cr.iceServers  = iceServers;
		cr.textRoom    = null;
		cr.videoRoom   = null;
		cr.textPlugin  = {};
		cr.videoPlugin = {};

		console.log( cr );

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
		cr.textRoom = new Janus({
			debug:      cr.debug,
			server:     cr.server,
			iceServers: cr.iceServers,
			success:    () => {
				cr.textRoom.attach({
					plugin:   "janus.plugin.textroom",
					opaqueId: cr.opaqueId,
					success:  ( plugin ) => {
						cr.users[ username ] = plugin.id;

						cr.users[ username ] = plugin;

						const body = {
							request: "setup",
						};
						Janus.debug( "Sending message:", body );
						cr.users[ username ].send({message: body});
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
						Janus.log( " :: Got a message :::", message );
						console.log( message );

						if( message[ "error" ] ) {
							Janus.error( message[ "error" ] );

							return;
						}

						if( jsep ) {
							Janus.log( "Handling JSEP", jsep );

							cr.users[ username ].createAnswer({
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

									cr.users[ username ].send({
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
						console.log( data );
						Janus.log( "The DataChannel is now available!" );
						const transaction = utils.randomString( 12 );

						const register = {
							textroom:    "join",
							room:        cr.roomId,
							username:    cr.userName,
							ptype:       "publisher",
							display:     cr.displayName,
							transaction: transaction,
						};

						console.log( cr.users[ username ] );

						cr.users[ username ].send({
							message: register,
						});

						console.log( cr.users );

						cr.transactions[ transaction ] = ( response ) => {
							if( response[ "textroom" ] === "error" ) {
								switch ( response[ "error_code" ] ) {
									case 417:
										Janus.error( "There is no such room" );
										break;

									default:
										Janus.error( "Unknown error", response[ "error" ] );
										break;
								}
							}

							let i, info;

							const rp = response.participants;
							if( rp && rp.length > 0 ) {
								for( i in rp ) {
									const p = rp[ i ];
									console.log( p );
									Janus.log( `Participant ${i}`, p );

									const notExists = document.getElementById( "user-" + p.username ) === null;

									cr.participants[ p.username ] = p.display;
									if( p.username !== cr.userName && notExists ) {
										info = {
											username: p.username,
											display:  p.display,
											date:     utils.getDateString(),
										};

										cr.textUsers[ info["username"] ] =  {
											username: info["username"],
											display: info["display"],
											date: utils.getDateString(),
											transaction: transaction
										};

										tr.addToUserList( info );
									}
								}
							}
						};

						cr.users[ username ].data({
							text:  JSON.stringify( register ),
							error: ( reason ) => {
								Janus.error( reason );
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
						}

						tr.handleData( json[ "textroom" ], json );
					},
				});
			},
		});
	},
	addToUserList: ( info ) => {
		Janus.log( "Add to user list: ", info );
		const userlist = document.getElementById( "user-list" );

		const newlist     = document.createElement( "div" );
		newlist.id        = "user-" + info[ "username" ];
		newlist.innerText = tr.textUsers[ info[ "username" ] ];
		userlist.appendChild( newlist );

		cr.users[ newlist.id ] = {user: info[ "username" ], display: info[ "display" ]};
		info[ "message" ]      = `<b>${tr.textUsers[ info[ "username" ] ]}</b> has joined the room`;
		Janus.log( info );
		tr.addStatusMessage( info );
	},
};

const videoRoom = {
	videoFeeds:      {},
	videoConnection: null,
	myFeed:          null,
	element:         null,
	init:            () => {
		[ ...document.querySelectorAll( ".no-video" ) ].map( ( element, index, array ) => {
			const videoId   = element.id;
			element.onclick = function( self ) {
				vr.element = element;
				vr.start( element );
			};
		});
	},
	start: ( id ) => {
		cr.videoPlugin.createOffer({
			media: {
				audioRecv: false,
				videoRecv: false,
				audioSend: false,
				videoSend: true,
				video:     "lowres-16:9",
			},
			success: ( jsep ) => {
				console.log( "Got Published SDP!", jsep );

				const publish = {
					request:   "configure",
					audio:     false,
					video:     true,
					apisecret: cr.apiSecret,
				};

				console.log( "Configured videoPlugin Configure", jsep );

				vr.element = document.getElementById( id );

				cr.videoPlugin.send({
					message: publish,
					jsep:    jsep,
				});

				vr.element = id;
			},
		});
	},
	connectVideo: () => {
		cr.janus.attach({
			plugin:   "janus.plugin.videoroom",
			opaqueId: randomId,
			apisecre: apiSecret,
			success:  ( plugin ) => {
				cr.videoPlugin = plugin;
				console.log( "Plugin attached! (" + cr.videoPlugin.getPlugin() + ", id=" + cr.videoPlugin.getId() + ")" );
				console.log( "  -- This is a publisher/manager" );

				const register = {
					request:   "join",
					room:      cr.roomId,
					ptype:     "publisher",
					display:   cr.displayName,
					apisecret: cr.apiSecret,
				};

				cr.videoPlugin.send({
					message: register,
				});
			},
			error:    ( error ) => {},
			iceState: ( state ) => {
				console.log( "ICE State changed to " + state );
			},
			mediaState: ( medium, on ) => {
				console.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
			},
			webrtcState: ( on ) => {
				console.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
				if( !on ) {
					return;
				}
			},
			onmessage: ( message, jsep ) => {
				console.log( " ::: Got a message (Publisher) ::: ", message );

				const event = message[ "videoroom" ];
				console.log( "Event: ", event );

				switch ( event ) {
					case "joined":
						vr.joinedRoom( message );
						break;

					case "event":
						vr.handleEvent( message );
						break;

					case "destroyed":
						vr.joinedRoom( message );
						break;

					default:
						break;
				}
			},
			onlocalstream: ( stream ) => {
				Janus.debug( " ::: Got a local video stream ::: ", stream );

				cr.myFeed     = stream;
				let localElem = document.getElementById( "video-local" );
				vr.showVideo( localElem, stream );
				localElem = null;
			},
			onremotestream: ( stream ) => {},
			oncleanup:      () => {
				cr.myFeed = null;
			},
		});
	},
	handleEvent: ( message ) => {
		Janus.log( " :: Logging handleEvent (Video) :: ", stream );
		if( messsage[ "publishers" ] ) {
			const list = message[ "publishers" ];
			Janus.log( " :: Got a list of Video Publisher Feeds ::", list );

			let audio, display, id, video;
			console.log( "The list", list );

			for( const f in list ) {
				console.log( "List:", list[ f ] );
			}
		}
	},
};

const textRoom = {
	textConnection: null,
	textSession:    null,
	textPlugin:     null,
	randomId:       utils.randomString( 12 ),
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
			plugin:    "janus.plugin.textroom",
			opaqueId:  cr.uniqueId,
			apisecret: cr.apiSecret,
			textFeeds: {},
			debug:     cr.debug,
			success:   ( plugin ) => {
				cr.users = plugin;

				Janus.log( "Plugin attached! (" + cr.users.getPlugin() + ", id=" + cr.users.getId() + ")" );
				const body = {
					request: "setup",
				};

				Janus.log( "Sending message:", body );
				cr.users.send({
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
				Janus.log( message, jsep );
				Janus.log( ":: Got a textRoom Message :: ", message );

				if( message[ "error" ] ) {
					Janus.error( message[ "error" ] );

					return;
				}

				if( jsep ) {
					Janus.log( "Handling JSEP", jsep );

					cr.users.createAnswer({
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

							cr.users.send({
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
				Janus.log( "The TextRoom DataChannel is available" );
				const transaction = utils.randomString( 12 );
				const register    = {
					textroom:    "join",
					transaction: transaction,
					room:        cr.roomId,
					username:    cr.userName,
					display:     cr.displayName,
				};

				cr.transactions[ transaction ] = function( response ) {
					if( response[ "textroom" ] === "error" ) {
						Janus.error( `Error code ${response[ "error_code" ]} ${response}` );

						return;
					}

					let i, info;

					if( response.participants && response.participants.length > 0 ) {
						for( i in response.participants ) {
							Janus.log( response.participants[ i ] );
							const p = response.participants[ i ];
							console.log( p );
							cr.participants[ p.username ] = p.display;

							if( p.username !== cr.userName && document.getElementById( "user-" + p.username ) === null ) {
								info = {
									username:    p.username,
									display:     p.display,
									date:        utils.getDateString(),
									transaction: transaction,
								};

								cr.textUsers[ info["username"] ] =  {
									username: info["username"],
									display: info["display"],
									date: utils.getDateString(),
									transaction: transaction
								};

								tr.addToUserList( info );
							}
						}
					}
				};

				Janus.log( JSON.stringify( cr.users ) );
				cr.users.data({
					text:  JSON.stringify( register ),
					error: ( reason ) => {
						Janus.error( reason );
					},
				});
			},
			ondata: ( data ) => {
				Janus.log( "DATA:", data );
				const json        = JSON.parse( data );
				const transaction = json[ "transaction" ];

				if( cr.transactions[ transaction ] ) {
					Janus.log( "Pushing transaction ", transaction );
					cr.transactions[ transaction ]( json );
					delete cr.transactions[ transaction ];
				}

				const action = json[ "textroom" ];
				Janus.log( "Action: ", action );

				Janus.log( "Handling data: ", action, json );
				tr.handleData( action, json );
			},
		});
	},
	addUsersToRoom: ( participants ) => {
		let i, info;

		for( i in participants ) {
			const p = participants[ i ];
			Janus.log( `Participant ${i}`, p );

			cr.participants[ p.username ] = p.display;

			if( p.username !== cr.userName && document.getElementById( "user-" + p.username ) === null ) {
				info = {
					username: p.username,
					display:  p.display,
					date:     utils.getDateString(),
				};

				info[ "username" ] = info[ "username" ].toString();

				}

				tr.addToUserList( info );
			}
		}
	},
	addToUserList: ( info ) => {
		Janus.log( info );
		Janus.log( "Add to user list: ", info );
		const userlist = document.getElementById( "user-list" );

		const newlist     = document.createElement( "div" );
		newlist.id        = "user-" + info.username.toString();
		newlist.innerText = tr.textUsers[ info.username.toString() ];
		userlist.appendChild( newlist );

		info[ "message" ] = `<b>${tr.textUsers[ info[ "username" ] ]}</b> has joined the room`;
		Janus.log( info );
		tr.addStatusMessage( info );
	},

	removeFromUserList: ( info ) => {
		delete tr.textUsers[ info[ "username" ] ];

		Janus.log( tr.participants );

		if( tr.participants && tr.participants.length > 0 ) {
			const p = tr.participants;
			Janus.log( "Success!", info );
			const len = p.length;
			let i     = 0;

			for( i = 0; i < len; i++ ) {
				const user = p[ i ];
				Janus.log( user );
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
		Janus.log( data );
		const info = {
			from:    data[ "from" ],
			text:    utils.cleanMessage( data[ "text" ] ),
			date:    utils.getDateString( data[ "date" ] ),
			private: data[ "whisper" ] === true,
		};

		tr.addMessage( info );
	},
	addMessage: ( info ) => {
		const classname   = info[ "private" ] ? " privmsg" : "";
		const message     = utils.buildChatMessage( info[ "date" ], `<b class="username">${tr.textUsers[ info[ "from" ] ]}</b> ${info.text}` );
		message.className = message.class + classname;
		tr.showMessage( message );
	},
	sendMessage: ( message, user ) => {
		if( message === "" ) {
			return;
		}

		message = {
			textroom:    "message",
			transaction: utils.randomString( 12 ),
			room:        cr.roomId,
			text:        message,
		};

		cr.users[ username ].data({
			text:  JSON.stringify( message ),
			error: function( reason ) {
				Janus.error( message );
			},
			success: function() {
				utils.resetChatBox();
			},
		});
	},
	handleJoin: ( data ) => {
		console.log( "JOIN:", data );
		const info = {
			username: data[ "username" ],
			display:  data[ "display" ],
			date:     utils.getDateString(),
			randomId: randomId,
		};

		Janus.log( "Calling remove attribute" );
		document.getElementById( "chat-text-input" ).removeAttribute( "disabled" );
		const user   = data[ "username" ];
		const id     = data[ "randomId" ];
		const exists = cr.hasOwnProperty( user );

		console.log( cr.textPlugin );

		if( !exists ) {
			cr.textPlugin[ data[ "username" ] ] = data[ "display" ];
		}

		console.log( cr.textUsers );

		Janus.log( "Join JSON", data );
		cr.textPlugin[ data[ "username" ] ] = data[ "display" ];
		const userItem                      = document.getElementById( "user-" + info[ "username" ] );

		// If user is not in the list
		if( userItem === null ) {
			// Add them
			tr.addToUserList( info );
		}

		Janus.log( "Enabling user textbox" );
		document.getElementById( "chat-text-input" ).removeAttribute( "disabled" );

		if( vr.init === false ) {
			//vr.connectVideo();
		}
	},
	handleSuccess: ( data ) => {
		const i = 0;

		if( data[ "participants" ] && data[ "participants" ].length > 0 ) {
			const p = data[ "participants" ];
			console.log( "Success!", data );
			const len = p.length;

			if( !cr.users.hasOwnProperty( info.username ) ) {
				cr.users[ info.username ] = info.display;
			}
		}
	},
	handleLeave: ( data ) => {
		console.log( "Removing:", data );
		const username = data[ "username" ];
		const when     = new Date();
		const elem     = document.getElementById( "user-" + username );
		elem.parentNode.removeChild( elem );

		const message = {
			date:    utils.getDateString(),
			message: `<b>${cr.textPlugin[ username ]}</b> has left the room`,
		};

		tr.addStatusMessage( message );
		delete cr.textPlugin[ username ];
	},
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
				Janus.log( data );
				tr.handleLeave( data );
				break;

			default:
				Janus.log( action );
				break;
		}
	},
	handleEvent: ( message ) => {
		console.log( "Handling event", message );
		const list = message[ "publishers" ];
		let audio, display, id, video;
		console.log( "The list:", list );

		for( const f in list ) {
			const user = p[ i ];
			list[ f ]  = {
				id:      list[ f ][ "id" ],
				display: list[ f ][ "display" ],
				audio:   list[ f ][ "audio_codec" ],
				video:   list[ f ][ "video_codec" ],
			};
		}

		console.log( list );
	},
};

const cr = chatRoom;
const vr = videoRoom;
const tr = textRoom;
