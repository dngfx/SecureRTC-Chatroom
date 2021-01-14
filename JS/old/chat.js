/* eslint-disable no-delete-var */
/* eslint-disable no-case-declarations */
/* eslint-disable max-depth */
/* eslint-disable no-undef */
/* eslint-disable default-case */
const chat = {
	myid:       null,
	mypvtid:    null,
	roomid:     null,
	mynick:     null,
	mystream:   null,
	janus:      null,
	sfu:        null,
	feeds:      {},
	remoteFeed: null,
	display:    null,
	started:    false,

	init: function( roomid, nick, display ) {
		chat.roomid  = roomid;
		chat.mynick  = nick;
		chat.display = display;

		Janus.init({
			debug:        true,
			dependencies: Janus.useDefaultDependencies(),

			callback: function() {
				room.init();
				text.init( nick, display );
			},
		});
	},

	initJanus: function() {
		chat.janus = new Janus({
			debug:      true,
			server:     server,
			iceServers: rtcIceServers,
			success:    function() {
				chat.janus.attach({
					plugin:   "janus.plugin.videoroom",
					opaqueId: randomId,
					success:  function( pluginHandle ) {
						chat.sfu = pluginHandle;
						Janus.log( "Plugin attached! (" + chat.sfu.getPlugin() + ", id=" + chat.sfu.getId() + ")" );
						Janus.log( "  -- This is a publisher/manager" );

						const register = {
							request: "join",
							room:    chat.roomid,
							ptype:   "publisher",
							display: chat.mynick,
						};

						chat.sfu.send({
							message: register,
						});
					},
					error: function( error ) {
						Janus.error( "  -- Error attaching plugin...", error );
					},
					iceState: function( state ) {
						Janus.log( "ICE state changed to " + state );
					},
					mediaState: function( medium, on ) {
						Janus.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
					},
					webrtcState: function( on ) {
						Janus.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
						if( !on ) {
							return;
						}
					},
					onmessage( msg, jsep ) {
						Janus.debug( " ::: Got a message (publisher) :::", msg );
						const event = msg[ "videoroom" ];
						Janus.debug( "Event: " + event );

						if( event ) {
							switch ( event ) {
								case "joined":
									console.log( "JOINED: ", msg );
									chat.myid    = msg[ "id" ];
									chat.mypvtid = msg[ "private_id" ];
									Janus.log( "Successfully joined room " + msg[ "room" ] + " with ID " + chat.myid );
									if( msg[ "publishers" ] ) {
										const list = msg[ "publishers" ];
										Janus.debug( "Got a list of available publishers/feeds:", list );
										for( const f in list ) {
											videochat.feed[ list[ f ][ "display" ] ] = {
												feed: list[ f ],
												nick: text.users[ list[ f ][ "display" ] ],
											};
											const id                                 = list[ f ][ "id" ];
											const display                            = list[ f ][ "display" ];
											const audio                              = list[ f ][ "audio_codec" ];
											const video                              = list[ f ][ "video_codec" ];
											Janus.debug( "  >> [" +
													id +
													"] " +
													text.users[ display ] +
													" (audio: " +
													audio +
													", video: " +
													video +
													")" );

											videochat.newRemoteFeed( id, display, text.users[ display ], audio, video );
										}

										console.log( "VIDEOCHAT FEED", videochat.feed );
									}
									break;

								case "event":
									console.log( msg );
									if( msg[ "publishers" ] ) {
										const list = msg[ "publishers" ];
										Janus.debug( "Got a list of available publishers/feeds:", list );
										for( const f in list ) {
											const id      = list[ f ][ "id" ];
											const display = list[ f ][ "display" ];
											const audio   = list[ f ][ "audio_codec" ];
											const video   = list[ f ][ "video_codec" ];
											Janus.debug( "  >> [" +
													id +
													"] " +
													display +
													" " +
													text.users[ display ] +
													" (audio: " +
													audio +
													", video: " +
													video +
													")" );
											videochat.newRemoteFeed( id, display, text.users[ display ], audio, video );
										}
									} else if( msg[ "leaving" ] ) {
										// One of the publishers has gone away?
										const leaving = msg[ "leaving" ];
										Janus.log( "Publisher left: " + leaving );
										console.log( "Publisher left", leaving );
										console.log( chat.feeds, chat.feeds );
										for( let i = 1; i < 16; i++ ) {
											if( chat.feeds[ i ] && chat.feeds[ i ].rfid === leaving ) {
												chat.remoteFeed = chat.feeds[ i ];
												break;
											}
										}
										if( chat.remoteFeed !== null ) {
											Janus.debug( "Feed " +
													chat.remoteFeed.rfid +
													" (" +
													chat.remoteFeed.rfdisplay +
													") has left the room, detaching" );
											chat.feeds[ chat.remoteFeed.rfindex ] = null;
											chat.remoteFeed.detach();
											console.log( chat.feeds );
										}
									} else if( msg[ "unpublished" ] ) {
										// One of the publishers has unpublished?
										const unpublished = msg[ "unpublished" ];
										Janus.log( "Publisher left: " + unpublished );
										if( unpublished === "ok" ) {
											// That's us
											sfutest.hangup();

											return;
										}
										for( i = 1; i < 6; i++ ) {
											if( chat.feeds[ i ] && chat.feeds[ i ].rfid === unpublished ) {
												chat.remoteFeed = chat.feeds[ i ];
												break;
											}
										}
										if( chat.remoteFeed !== null ) {
											Janus.debug( "Feed " +
													chat.remoteFeed.rfid +
													" (" +
													chat.remoteFeed.rfdisplay +
													") has left the room, detaching" );
											chat.feeds[ chat.remoteFeed.rfindex ] = null;
											chat.remoteFeed.detach();
										}
									} else if( msg[ "error" ] ) {
										if( msg[ "error_code" ] === 426 ) {
											// This is a "no such room" error: give a more meaningful description
											console.log( "Room does not exist" );
										} else {
											console.log( msg[ "error" ] );
										}
									}
							}
						}
						if( jsep ) {
							Janus.debug( "Handling SDP as well...", jsep );
							chat.sfu.handleRemoteJsep({jsep: jsep});
							// Check if any of the media we wanted to publish has
							// been rejected (e.g., wrong or unsupported codec)
							const audio = msg[ "audio_codec" ];
							if(
								chat.mystream &&
								chat.mystream.getAudioTracks() &&
								chat.mystream.getAudioTracks().length > 0 &&
								!audio
							) {
								// Audio has been rejected
								console.log( "Our audio stream has been rejected, viewers won't hear us" );
							}
							const video = msg[ "video_codec" ];
							if(
								chat.mystream &&
								chat.mystream.getVideoTracks() &&
								chat.mystream.getVideoTracks().length > 0 &&
								!video
							) {
								// Video has been rejected
								console.log( "Our video stream has been rejected, viewers won't see us" );
							}
						}
					},
					onlocalstream: function( stream ) {
						console.log( " ::: Got a local stream :::", stream );
						Janus.debug( " ::: Got a local stream :::", stream );
						chat.mystream = stream;

						let localElem = document.getElementById( "video-local" );

						videochat.showVideo( localElem, stream );
						localElem = null;
					},
					onremotestream: function( stream ) {
						// The publisher stream is sendonly, we don't expect anything here
					},
					oncleanup: function() {
						Janus.log( " ::: Got a cleanup notification: we are unpublished now :::" );
						chat.mystream = null;
					},
				});
			},
		});
	},
};

const room = {
	init: function() {
		console.log( "hello" );
		[ ...document.querySelectorAll( ".no-video" ) ].map( ( element, index, array ) => {
			const videoId   = element.id;
			element.onclick = function( self ) {
				videochat.element = element;
				videochat.start( element );
			};
		});
	},
};

const videochat = {
	element: null,
	feeds:   {},
	feed:    {},
	plugin:  null,
	start:   function( id ) {
		chat.sfu.createOffer({
			media: {
				audioRecv: false,
				videoRecv: false,
				audioSend: false,
				videoSend: true,
				video:     "lowres-16:9",
			},
			success: function( jsep ) {
				console.log( "Got published SDP!", jsep );
				Janus.debug( "Got publisher SDP!", jsep );
				const publish = {request: "configure", audio: false, video: true};
				console.log( "CONFIGUREID", id );
				videochat.element = document.getElementById( id );
				chat.sfu.send({
					message: publish,
					jsep:    jsep,
				});

				videochat.element = id;
			},
		});
	},
	showVideo: function( element, stream ) {
		const id                                  = element.id.replace( "video", "stream" );
		const buttonId                            = element.id.replace( "video", "loadvideo" );
		document.getElementById( buttonId ).style = "display: none;";
		document.getElementById( id ).style       = "display: block; max-width: 100%; max-height: 100%;";

		const videoElem = document.getElementById( id );

		Janus.attachMediaStream( videoElem, stream );
		videoElem.play();
	},
	newRemoteFeed: function( id, display, nick, audio, video ) {
		chat.remoteFeed = null;
		chat.janus.attach({
			plugin:   "janus.plugin.videoroom",
			opaqueId: chat.opaqueId,
			success:  function( pluginHandle ) {
				chat.remoteFeed                  = pluginHandle;
				chat.remoteFeed.simulcastStarted = false;
				Janus.log( "Plugin attached! (" + chat.remoteFeed.getPlugin() + ", id=" + chat.remoteFeed.getId() + ")" );
				Janus.log( "  -- This is a subscriber" );
				Janus.log( " -- ", chat.remoteFeed.getId(), id );
				// We wait for the plugin to send us an offer
				const subscribe = {
					request:    "join",
					room:       roomid,
					ptype:      "subscriber",
					feed:       id,
					private_id: chat.mypvtid,
				};
				// In case you don't want to receive audio, video or data, even if the
				// publisher is sending them, set the 'offer_audio', 'offer_video' or
				// 'offer_data' properties to false (they're true by default), e.g.:
				// 		subscribe["offer_video"] = false;
				// For example, if the publisher is VP8 and this is Safari, let's avoid video
				if(
					Janus.webRTCAdapter.browserDetails.browser === "safari" &&
					( video === "vp9" || video === "vp8" && !Janus.safariVp8 )
				) {
					if( video ) {
						video = videochat.toUpperCase();
					}
					console.warn( "Publisher is using " + video + ", but Safari doesn't support it: disabling video" );
					subscribe[ "offer_video" ] = false;
				}
				chat.remoteFeed.videoCodec = video;
				chat.remoteFeed.send({message: subscribe});
			},
			error: function( error ) {
				Janus.error( "  -- Error attaching plugin...", error );
				console.log( JSON.stringify( error ) );
			},
			onmessage: function( msg, jsep ) {
				Janus.debug( " ::: Got a message (subscriber) :::", msg );
				console.log( "Got a message (Subscriber)", msg, jsep );
				const event = msg[ "videoroom" ];

				if( msg[ "error" ] ) {
					console.log( "Error in onmessage: ", msg[ "error" ] );
				} else if( event ) {
					if( event === "attached" ) {
						const uid = msg[ "id" ];

						console.log( chat.remoteFeed );
						if( chat.feeds.hasOwnProperty( uid ) ) {
							return;
						}

						console.log( "Adding feed:", uid );
						chat.feeds[ uid ] = {
							nick:    text.users[ msg[ "display" ] ],
							id:      msg[ "id" ],
							display: msg[ "display" ],
							loading: false,
						};

						if( !chat.remoteFeed.loading ) {
							//console.log(target);
							chat.remoteFeed.loading = true;
						} else {
							let cur, len;
							console.log( "FEEDS", chat.feeds );
							for( feed in chat.feeds ) {
								cur = chat.feeds[ feed ];
								console.log( "CUR", cur );
								const target = newVideoElement( uid, uid, text.users[ msg[ "display" ] ] );
								document.getElementById( "video-container" ).appendChild( target );
							}
							chat.remoteFeed.loading = false;
						}
						Janus.log( "Successfully attached to feed " +
								chat.feeds[ uid ].id +
								" (" +
								chat.feeds[ uid ].display +
								") in room " +
								msg[ "room" ] );
					}
				}
				if( jsep ) {
					Janus.debug( "Handling SDP as well...", jsep );
					// Answer and attach
					chat.remoteFeed.createAnswer({
						jsep:    jsep,
						// Add data:true here if you want to subscribe to datachannels as well
						// (obviously only works if the publisher offered them in the first place)
						media:   {audioSend: false, videoSend: false}, // We want recvonly audio/video
						success: function( jsep ) {
							Janus.debug( "Got SDP!", jsep );
							const body = {request: "start", room: roomid};
							chat.remoteFeed.send({message: body, jsep: jsep});
						},
						error: function( error ) {
							Janus.error( "WebRTC error:", error );
							//bootbox.alert("WebRTC error... " + error.message);
						},
					});
				}
			},
			iceState: function( state ) {
				Janus.log( "ICE state of this WebRTC PeerConnection (feed #" +
						chat.remoteFeed.rfindex +
						") changed to " +
						state );
			},
			webrtcState: function( on ) {
				Janus.log( "Janus says this WebRTC PeerConnection (feed #" +
						chat.remoteFeed.rfindex +
						") is " +
						( on ? "up" : "down" ) +
						" now" );
			},
			onlocalstream: function( stream ) {
				// The subscriber stream is recvonly, we don't expect anything here
			},
			onremotestream: function( stream ) {
				console.log( stream, id, chat.feeds );

				let videoElem = document.getElementById( "stream-" + id );
				if( videoElem !== null ) {
					return;
				}

				const rf = chat.remoteFeed;
				Janus.log( "Remote feed #" + rf.rfindex + ", stream:", stream );
				let video = document.getElementById( "stream-" + id );
				if( video === null ) {
					video = newVideoElement( id, rf.rfdisplay, text.users[ chat.remoteFeed.rfdisplay ] );
					document.getElementById( "video-container" ).appendChild( video );
				}

				videoElem = document.getElementById( "stream-" + id );
				Janus.attachMediaStream( videoElem, stream );

				const videoTracks = stream.getVideoTracks();
				if( !videoTracks || videoTracks.length === 0 ) {
					console.log( "electric boogaloo" );
				} else {
					videoElem.play();
				}
			},
			oncleanup: function() {
				Janus.log( " ::: Got a cleanup notification (remote feed " + chat.remoteFeed.rfindex + ") :::" );
				const videoContainer = document.getElementById( "videotemplate-" + id );
				videoContainer.parentNode.removeChild( videoContainer );
			},
		});
	},
};

const text = {
	users:        {},
	transactions: {},
	room:         null,
	janus:        null,
	username:     null,
	display:      null,
	init:         function( nick, display ) {
		text.username = nick;
		text.display  = display;
		console.log( "Nick & display from function: ", nick, display );
		text.janus = new Janus({
			server:  server,
			debug:   true,
			success: function() {
				text.janus.attach({
					plugin:   "janus.plugin.textroom",
					opaqueId: randomId,
					success:  function( pluginHandle ) {
						text.room = pluginHandle;

						Janus.log( "Plugin attached! (" + text.room.getPlugin() + ", id=" + text.room.getId() + ")" );
						const body = {
							request: "setup",
						};

						Janus.debug( "Sending message:", body );
						text.room.send({message: body});
					},
					error: function( error ) {
						console.error( "  -- Error attaching plugin...", error );
						//bootbox.alert("Error attaching plugin... " + error);
					},
					iceState: function( state ) {
						Janus.log( "ICE state changed to " + state );
					},
					mediaState: function( medium, on ) {
						Janus.log( "Janus " + ( on ? "started" : "stopped" ) + " receiving our " + medium );
					},
					webrtcState: function( on ) {
						Janus.log( "Janus says our WebRTC PeerConnection is " + ( on ? "up" : "down" ) + " now" );
					},
					onmessage: function( msg, jsep ) {
						Janus.debug( " ::: Got a message :::", msg );
						if( msg[ "error" ] ) {
							bootbox.alert( msg[ "error" ] );
						}
						if( jsep ) {
							// Answer
							text.room.createAnswer({
								jsep:    jsep,
								media:   {audio: false, video: false, data: true}, // We only use datachannels
								success: function( jsep ) {
									Janus.debug( "Got SDP!", jsep );
									const body = {request: "ack"};
									text.room.send({message: body, jsep: jsep});
								},
								error: function( error ) {
									Janus.error( "WebRTC error:", error );
									//	bootbox.alert("WebRTC error... " + error.message);
								},
							});
						}
					},
					ondataopen: function( data ) {
						Janus.log( "The DataChannel is available!" );
						const transaction = randomString( 12 );
						const register    = {
							textroom:    "join",
							transaction: transaction,
							room:        roomid,
							username:    text.username,
							display:     text.display,
						};

						text.room.data({
							text:  JSON.stringify( register ),
							error: function( reason ) {
								console.log( reason );
							},
						});
					},
					ondata: function( data ) {
						let msg = "";
						Janus.debug( "We got data from the DataChannel!", data );
						const json        = JSON.parse( data );
						const transaction = json[ "transaction" ];
						if( text.transactions[ transaction ] ) {
							Janus.log( "Pushing transaction ", transaction );
							text.transactions[ transaction ]( json );
							delete text.transactions[ transaction ];

							return;
						}

						const action = json[ "textroom" ];
						console.log( json );

						switch ( action ) {
							case "message":
								msg = json[ "text" ];
								msg = cleanMessage( msg );

								const from = json[ "from" ];

								const dateString = getDateString( json[ "date" ] );
								const privmsg    = json[ "whisper" ] === true;

								text.addMessage( data, dateString, from, msg, privmsg );
								break;

							case "join":
							case "success":
								let user           = json[ "username" ];
								let display        = json[ "display" ];
								const participants = json[ "participants" ];
								let p;

								document.getElementById( "chat-text-input" ).removeAttribute( "disabled" );

								// No users in the channel
								if( action === "success" && participants ) {
									for( let i = 0; i < participants.length; i++ ) {
										p = participants[ i ];
										console.log( "PARTICIPANT: ", p );
										user    = p.username;
										display = p.display;

										text.users[ user ] = display !== undefined ? display : user;
										const useritem     = document.getElementById( "user-" + user );
										if( user !== text.username ) {
											const userlist    = document.getElementById( "user-list" );
											const newlist     = document.createElement( "div" );
											newlist.id        = "user-" + user;
											newlist.innerText = text.users[ user ];
											userlist.appendChild( newlist );
										}
									}

									console.log( text.users );
								} else if( action === "join" ) {
									text.users[ user ] = display !== undefined ? display : user;
									const useritem     = document.getElementById( "user-" + user );
									if( useritem === null ) {
										const userlist    = document.getElementById( "user-list" );
										const newlist     = document.createElement( "div" );
										newlist.id        = "user-" + user;
										newlist.innerText = text.users[ user ];
										userlist.appendChild( newlist );
										msg = `<b>${text.users[ user ]}</b> has joined the room`;
										text.addStatusMessage( data, getDateString(), msg );
									}
								}

								if( action === "success" && chat.started === false ) {
									chat.initJanus();
									chat.started = true;
								}
								break;

							case "leave":
								const username = json[ "username" ];
								const when     = new Date();
								const elem     = document.getElementById( "user-" + username );
								elem.parentNode.removeChild( elem );
								msg = `<b>${text.users[ username ]}</b> has left the room`;

								text.addStatusMessage( data, getDateString(), msg );
								delete text.users[ username ];
								break;
						}

						delete msg;
					},
					oncleanup: function() {
						Janus.log( " ::: Got a cleanup notification :::" );
					},
				});
			},
			error: function( error ) {
				Janus.error( error );
			},
			destroyed: function() {
				window.location.reload();
			},
		});
	},
	sendMessage: function( message ) {
		if( message === "" ) {
			return;
		}

		message = {
			textroom:    "message",
			transaction: randomString( 12 ),
			room:        roomid,
			text:        message,
		};

		text.room.data({
			text:  JSON.stringify( message ),
			error: function( reason ) {
				Janus.error( message );
			},
			success: function() {
				resetChatBox();
			},
		});
	},
	addMessage: function( data, dateString, from, msg, privmsg ) {
		const className   = privmsg ? " privmsg" : "";
		const message     = buildChatMessage( dateString, `<b class="username">${text.users[ from ]}</b> ${msg}` );
		message.className = message.class + className;
		text.showMessage( message );
	},
	addStatusMessage: function( data, date, message ) {
		message           = buildChatMessage( date, message );
		message.className = message.class + " status";
		text.showMessage( message );
	},
	showMessage: function( message ) {
		const msgbox = document.getElementById( "chat-box-text" );
		msgbox.appendChild( message );
		msgbox.scrollTop = msgbox.scrollHeight;
	},
};

function buildChatMessage( date, text ) {
	const message     = document.createElement( "div" );
	message.class     = "chat-message";
	message.innerHTML = `[${date}] ${text}`;

	return message;
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

function checkEnter( field, event ) {
	const theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if( theCode === 13 ) {
		if( field.id === "chat-text-input" ) {
			text.sendMessage( field.value );
		}

		return false;
	} else {
		return true;
	}
}

function resetChatBox() {
	document.getElementById( "chat-text-input" ).value = "";
}

function cloneObj( obj ) {
	if( obj == null || typeof obj !== "object" ) {
		return obj;
	}
	const copy = obj.constructor();
	for( const attr in obj ) {
		if( obj.hasOwnProperty( attr ) ) {
			copy[ attr ] = obj[ attr ];
		}
	}

	return copy;
}
