const utils = {
	randomString: ( len, charSet ) => {
		charSet          = charSet || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let randomString = "";
		for( let i = 0; i < len; i++ ) {
			const randomPoz = Math.floor( Math.random() * charSet.length );
			randomString   += charSet.substring( randomPoz, randomPoz + 1 );
		}

		return randomString;
	},

	getDateString: ( jsonDate ) => {
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
	},

	buildChatMessage: ( date, text ) => {
		const message     = document.createElement( "div" );
		message.class     = "chat-message";
		message.innerHTML = `[${date}] ${text}`;

		return message;
	},

	checkEnter: ( field, event ) => {
		const theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
		if( theCode === 13 ) {
			if( field.id === "chat-text-input" ) {
				tr.sendMessage( field.value, uniqueId );
			}

			return false;
		} else {
			return true;
		}
	},

	resetChatBox: () => {
		document.getElementById( "chat-text-input" ).value = "";
	},

	cleanMessage: ( msg ) => {
		console.log( "Cleaning message", msg );
		msg = msg.replace( new RegExp( "<", "g" ), "&lt" );
		msg = msg.replace( new RegExp( ">", "g" ), "&gt" );

		return msg;
	},

	newVideoElement: ( id, display, nick ) => {
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
	},
};
