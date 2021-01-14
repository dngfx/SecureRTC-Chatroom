const textRoom = {
	roomid: null,
	username: null,
	displayname: null,
	plugin: null,
	init: (roomid, username, displayname) => {
		tr.roomid = roomid;
		tr.username = username;
		tr.displayName = displayname;

		janus["textRoom"] = new Janus.Client(server, {
			apisecret: apiSecret,
			keepalive: true
		});
	}
};

const tr = textRoom;
tr.iceServers = rtcIceServers;