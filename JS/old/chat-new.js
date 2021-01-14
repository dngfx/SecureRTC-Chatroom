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
	privateId:    null,
	myId:         null,
	debug:        false,
	init:         function( roomid, username, displayname, apisecret ) {
		cr.roomId      = roomid;
		cr.userName    = username;
		cr.displayName = displayname;
		cr.apiSecret   = apisecret;

		cr.initJanus();
	},
	initJanus: () => {
		Janus.init({
			debug:        cr.debug,
			dependencies: Janus.useDefaultDependencies(),
			callback:     () => {
				cr.connectChat();
				vr.initHook();
			},
		});
	},
	connectChat: function() {
		cr.janus = new Janus({
			server:     server,
			iceServers: rtcIceServers,
			apisecret:  apiSecret,
			success:    () => {
				cr.janus.attach({
					plugin:   "janus.plugin.textroom",
					opaqueId: uniqueId,
					success:  ( plugin ) => {
						cr.textPlugin = plugin;
						console.log( "Plugin attached! (" + cr.textPlugin.getPlugin() + ", id=" + cr.textPlugin.getId() + ")" );
						const body = {
							request:   "setup",
							apisecret: cr.apiSecret,
						};

						console.log( "Sending message:", body );
						cr.textPlugin.send({
							message: body,
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
						console.log( "The dataChannel is available" );
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

		if( vr.init === false ) {
			vr.connectVideo();
		}
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
	videoUsers: {},
	videoFeeds: {},
	feeds:      [],
	myFeed:     null,
	init:       false,
	element:    null,
	initHook:   () => {
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
				console.log( "Got published SDP!", jsep );

				const publish = {
					request:   "configure",
					audio:     false,
					video:     true,
					apisecret: cr.apiSecret,
				};

				console.log( "CONFIGUREID", id );

				vr.element = document.getElementById( id );

				cr.videoPlugin.send({
					message: publish,
					jsep:    jsep,
				});

				vr.element = id;
			},
		});
	},
	showVideo: ( element, stream ) => {
		const id       = element.id.replace( "video", "stream" );
		const buttonid = element.id.replace( "video", "loadvideo" );

		document.getElementById( buttonid ).style = "display: none;";
		document.getElementById( id ).style       = "display: block; max-width: 100%; max-height: 100%;";

		const videoElem = document.getElementById( id );

		Janus.attachMediaStream( videoElem, stream );
		videoElem.play();
	},
	connectVideo: () => {
		vr.init = true;
		cr.janus.attach({
			plugin:   "janus.plugin.videoroom",
			opaqueId: randomId,
			token:    apiSecret,
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
				console.log( "ICE state changed to " + state );
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
				Janus.debug( " ::: Got a local stream :::", stream );

				vr.myfeed = stream;

				let localElem = document.getElementById( "video-local" );
				vr.showVideo( localElem, stream );
				localElem = null;
			},
			onremotestream: ( stream ) => {},
			oncleanup:      () => {
				vr.myFeed = null;
			},
		});
	},
	handleEvent: ( message ) => {
		console.log( "Handling event", message );
		if( message[ "publishers" ] ) {
			const list = message[ "publishers" ];
			console.log( "Got a list of available publishers/feeds:", list );

			let audio, display, id, video;
			console.log( "The list:", list );
			for( const f in list ) {
				console.log( "List:", list[ f ] );
				id      = list[ f ][ "id" ];
				display = list[ f ][ "display" ];
				audio   = list[ f ][ "audio_codec" ];
				video   = list[ f ][ "video_codec" ];
				console.log( "  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")" );

				vr.newRemoteFeed( id, display, nick, audio, video );
			}
		} else if( message[ "leaving" ] ) {
			const leaving = message[ "leaving" ];
			console.log( "Publisher left: " + leaving );

			cr.videoPlugin = null;

			for( let i = 1; i < 6; i++ ) {
				if( vr.videoFeeds[ i ] && vr.videoFeeds[ i ].rfid === leaving ) {
					cr.videoPlugin = feeds[ i ];
					break;
				}
			}

			if( cr.videoPlugin !== null ) {
				console.log( "Feed " + cr.videoPlugin.rfid + " (" + cr.videoPlugin.rfdisplay + ") has left the room, detaching" );
				vr.videoFeeds[ cr.videoFeed.rfindex ] = null;
				vr.videoPlugin.detach();
			}
		} else if( message[ "unpublished" ] ) {
			const unpublished = message[ "unpublished" ];
			console.log( "Publisher left: " + unpublished );
			if( unpublished === "ok" ) {
				// That's us
				cr.videoPlugin.hangup();

				return;
			}

			cr.videoPlugin = null;

			for( let i = 1; i < 6; i++ ) {
				if( vr.feeds[ i ] && vr.feeds[ i ].rfid === unpublished ) {
					cr.videoPlugin = vr.feeds[ i ];
					break;
				}
			}

			if( cr.videoPlugin !== null ) {
				console.log( "Feed " + cf.videoPlugin.rfid + " (" + cr.videoPlugin.rfdisplay + ") has left the room, detaching" );
				vr.feeds[ cf.videoPlugin.rfindex ] = null;
				cr.videoPlugin.detach();
			}
		} else if( message[ "error" ] ) {
			if( message[ "error_code" ] === 426 ) {
				console.error( "room does not exist" );
			} else {
				console.error( message );
			}
		}
	},
	joinedRoom: ( message ) => {
		cr.privateId = message[ "private_id" ];
		cr.myid      = message[ "id" ];
		console.log( "Successfully joined room " + message[ "room" ] + " with ID " + cr.myid );

		if( message[ "publishers" ] ) {
			const list = message[ "publishers" ];
			console.log( "Got a list of available publishers/feeds:", list );

			let audio, display, id, video;

			for( const f in list ) {
				console.log( "List:", list[ f ] );
				vr.feeds[ list[ f ][ "display" ] ] = {
					feed: list[ f ],
					nick: text.users[ list[ f ][ "display" ] ],
				};

				id      = list[ f ][ "id" ];
				display = list[ f ][ "display" ];
				audio   = list[ f ][ "audio_codec" ];
				video   = list[ f ][ "video_codec" ];
				console.log( "  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")" );

				vr.newRemoteFeed( id, display, nick, audio, video );
			}
		}
	},
	newRemoteFeed: ( id, display, nick, audio, video ) => {
		cr.videoPlugin = null;
		cr.janus.attach({
			plugin:   "janus.plugin.videoroom",
			opaqueID: cr.opaqueID,
			token:    apiSecret,
			success:  ( plugin ) => {
				cr.videoPlugin                  = plugin;
				cr.videoPlugin.simulcastStarted = false;

				console.log( "Plugin attached! (" + cr.videoPlugin.getPlugin() + ", id=" + cr.videoPlugin.getId() + ")" );
				console.log( "  -- This is a subscriber" );
				console.log( " -- ", cr.videoPlugin.getId(), id );

				const subscribe = {
					request:    "join",
					room:       cr.roomId,
					ptype:      "subscriber",
					feed:       id,
					private_id: cr.privateId,
					apisecret:  cr.apiSecret,
				};

				if(
					Janus.webRTCAdapter.browserDetails.browser === "safari" &&
					( video === "vp9" || video === "vp8" && !Janus.safariVp8 )
				) {
					if( video ) {
						video = vr.toUpperCase();
					}
					console.warn( "Publisher is using " + video + ", but Safari doesn't support it: disabling video" );
					subscribe[ "offer_video" ] = false;
				}
				cr.videoRoom.videoCodec = video;
				cr.videoRoom.send({message: subscribe});
			},
			error: ( error ) => {
				console.log( JSON.stringify( error ) );
			},
			onmessage: ( message, jsep ) => {
				Janus.debug( " ::: Got a message (subscriber) :::", message );
				console.log( "Got a message (Subscriber)", message, jsep );
				const event = message[ "videoroom" ];

				if( message[ "error" ] ) {
					console.error( "Error in onmessage:", message[ "error" ] );
				} else if( event ) {
					switch ( event ) {
						case "attached":
							{
								const uid = message[ "id" ];

								if( vr.feeds.hasOwnProperty( uid ) ) {
									return;
								}

								console.log( "Adding feed:", uid );
								vr.feeds[ uid ] = {
									nick:    tr.users[ message[ "username" ] ],
									id:      message[ "id" ],
									display: message[ "display" ],
									loading: false,
								};

								if( !cr.videoFeed.loading ) {
									cr.videoFeed.loading = true;
								} else {
									let cur, len;

									for( feed in vr.feeds ) {
										cur = vr.feeds[ feed ];
										console.log( "CUR", cur );
										const target = newVideoElement( uid, uid, text.users[ message[ "display" ] ] );
										document.getElementById( "video-container" ).appendChild( target );
									}
									cr.videoFeed.loading = false;
								}
								Janus.log( "Successfully attached to feed " +
										vr.feeds[ uid ].id +
										" (" +
										vr.feeds[ uid ].display +
										") in room " +
										message[ "room" ] );
							}
							break;

						default:
							break;
					}

					if( jsep ) {
						Janus.debug( "Handling SDP as well...", jsep );
						// Answer and attach
						cr.videoFeed.createAnswer({
							jsep:    jsep,
							// Add data:true here if you want to subscribe to datachannels as well
							// (obviously only works if the publisher offered them in the first place)
							media:   {audioSend: false, videoSend: false}, // We want recvonly audio/video
							success: function( jsep ) {
								Janus.debug( "Got SDP!", jsep );
								const body = {request: "start", room: cr.roomId};
								cr.videoFeed.send({message: body, jsep: jsep});
							},
							error: function( error ) {
								Janus.error( "WebRTC error:", error );
								//bootbox.alert("WebRTC error... " + error.message);
							},
						});
					}
				}
			},
			iceState: ( state ) => {
				Janus.log( "ICE state of this WebRTC PeerConnection (feed #" + cr.videoFeed.rfindex + ") changed to " + state );
			},
			webrtcState: ( on ) => {
				Janus.log( "Janus says this WebRTC PeerConnection (feed #" +
						cr.videoFeed.rfindex +
						") is " +
						( on ? "up" : "down" ) +
						" now" );
			},
			onlocalstream: ( stream ) => {
				// The subscriber stream is recvonly, we don't expect anything here
			},
			onremotestream: function( stream ) {
				console.log( stream, id, vr.feeds );

				let videoElem = document.getElementById( "stream-" + id );
				if( videoElem !== null ) {
					return;
				}

				const rf = cf.videoFeed;
				Janus.log( "Remote feed #" + rf.rfindex + ", stream:", stream );
				let video = document.getElementById( "stream-" + id );
				if( video === null ) {
					video = newVideoElement( id, rf.rfdisplay, tr.users[ cr.videoFeed.rfdisplay ] );
					document.getElementById( "video-container" ).appendChild( video );
				}

				videoElem = document.getElementById( "stream-" + id );
				console.log( videoElem );
				Janus.attachMediaStream( videoElem, stream );

				const videoTracks = stream.getVideoTracks();
				if( !videoTracks || videoTracks.length === 0 ) {
					console.log( "electric boogaloo" );
				} else {
					videoElem.play();
				}
			},
			oncleanup: function() {
				Janus.log( " ::: Got a cleanup notification (remote feed " + cf.videoFeed.rfindex + ") :::" );
				const videoContainer = document.getElementById( "videotemplate-" + id );
				videoContainer.parentNode.removeChild( videoContainer );
			},
		});
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

function newVideoElement( id, display, nick ) {
	console.log( "New video element", id, display, nick );
	const card       = document.getElementById( "videotemplate" ).cloneNode( true );
	card.id          = "videotemplate-" + id;
	const header     = card.querySelectorAll( "#videouser" )[ 0 ];
	header.id        = "videouser-" + id;
	header.innerText = nick;
	const stream     = card.querySelectorAll( "#stream" )[ 0 ];
	stream.id        = "stream-" + id;
	stream.style     = "display: block; max-width: 100%; max-height: 100%;";

	return card;
}
